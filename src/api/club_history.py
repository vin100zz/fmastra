"""Seasonal club cash accounts and durable squad movements; read-only projections."""
from dataclasses import dataclass

from core.domain.date import Date
from core.domain.players import ATTRIBUTE_NAMES
from core.domain.world import World, history_level
from core.world.finances import financial_season
from . import views as v


def navigation(world: World, season: int | None) -> dict:
    first = world.config.world.start_date.year
    selected = world.season if season is None else season
    if not first <= selected <= world.season: raise ValueError("Saison hors de l'historique de la partie.")
    return {"season": selected, "previous_season": selected - 1 if selected > first else None,
            "next_season": selected + 1 if selected < world.season else None}


def movements(world: World, club_id: int, season: int | None, page: int) -> dict:
    nav = navigation(world, season)
    rows = v.transfers(world, club_id=club_id, season=nav["season"])
    regular = [row for row in rows if row["kind"] == "transfer"]
    sections = {
        "arrivals": [row for row in regular if row["target"] and row["target"]["id"] == club_id],
        "departures": [row for row in regular if row["source"] and row["source"]["id"] == club_id],
        **{kind: [row for row in rows if row["kind"] == kind] for kind in ("release", "retirement", "academy", "departure_unknown")},
    }
    return {**v.paginate(regular, page), **nav, "sections": sections,
            "arrival_total": sum(row['fee'] for row in sections['arrivals']),
            "departure_total": sum(row['fee'] for row in sections['departures']),
            "history_since": (world.movement_history_since or world.date).iso()}


TRANSFER_KINDS = {'transfer', 'release', 'departure_unknown'}
MOVEMENT_KINDS = {'transfer': TRANSFER_KINDS, 'retirement': {'retirement'}, 'academy': {'academy'}}


@dataclass(frozen=True, slots=True)
class MovementFilter:
    """What narrows a season's movements. Each tab reads the fields that mean something for it: a transfer its window, its
    fee and either club; a retirement the last club and the caps; a promotion the club that trained the player, his level
    today, his potential and whether he would join the human club."""
    search: str = ''  # normalized, in the player's name or a club's
    window: str | None = None  # 'ete' or 'hiver'
    nature: str | None = None  # 'payant' or 'libre'
    competition_id: int | None = None  # the league a club of the movement plays in today
    positions: frozenset[str] = frozenset()  # the player's position: today for a transfer, on the day for the others
    age_min: int = 0
    age_max: int = 100
    fee_min: int = 0
    club_id: int | None = None
    nation: str | None = None  # the country of the club that trained the player
    capped: bool = False  # internationals only
    rating_min: float = 0
    rating_max: float = 100
    potential_min: float = 0
    potential_max: float = 100
    interested: str | None = None  # 'oui' or 'non'


def summer_move(world: World, day: Date) -> bool:
    """Whether a movement belongs to the summer window: the first half of a season, which opens with it."""
    opening = world.config.world.key_dates.population_review.month
    return (day.month - opening) % 12 < 6


def season_movements(world: World, season: int, kinds: set[str]) -> list:
    return [item for item in world.transfers if item.kind in kinds
            and (item.season if item.season is not None else financial_season(world, item.date)) == season]


def named(world: World, row, club_ids, search: str) -> bool:
    """Whether a search matches the player of a movement or one of its clubs."""
    names = (v.player_name(world, row.player_id) or '', *(world.clubs[club_id].name for club_id in club_ids if club_id in world.clubs))
    return not search or any(search in v.normalized(name) for name in names)


def aged(row, born, chosen: MovementFilter) -> bool:
    """Whether the player's age on the day of the movement is in the range asked for; an unknown age never is."""
    if chosen.age_min <= 0 and chosen.age_max >= 100: return True
    return born is not None and chosen.age_min <= born.age_on(row.date) <= chosen.age_max


def kept(world: World, row, chosen: MovementFilter) -> bool:
    player = world.players.get(row.player_id)
    clubs = [world.clubs[club_id] for club_id in (row.source_id, row.target_id) if club_id in world.clubs]
    if not named(world, row, (row.source_id, row.target_id), chosen.search): return False
    if chosen.window and summer_move(world, row.date) != (chosen.window == 'ete'): return False
    if chosen.nature and (row.fee > 0) != (chosen.nature == 'payant'): return False
    if chosen.competition_id is not None and all(club.competition_id != chosen.competition_id for club in clubs): return False
    if chosen.club_id is not None and chosen.club_id not in (row.source_id, row.target_id): return False
    if chosen.positions and (player is None or player.position not in chosen.positions): return False
    if chosen.fee_min and row.fee < chosen.fee_min: return False
    return aged(row, row.born or (player.born if player else None), chosen)


def league_ref(world: World, club_id: int | None) -> dict | None:
    """The league a club plays in today; None outside the simulated ones."""
    club = world.clubs.get(club_id)
    league = world.competitions.get(club.competition_id) if club and club.competition_id is not None else None
    return {'id': league.id, 'name': league.name} if league else None


def career_totals(world: World, player_ids: set[int]) -> dict[int, dict]:
    """What these players did over the whole game, every club and competition together."""
    totals = {player_id: {'matches': 0, 'goals': 0, 'assists': 0, 'rating_sum': 0, 'rating_count': 0} for player_id in player_ids}
    for record in world.records.values():
        row = totals.get(record.player_id)
        if row is None: continue
        for key in row: row[key] += getattr(record, key)
    return totals


def retirement_details(world: World, row, played: dict) -> dict:
    """A retired player: who he was on the day (None in retirements archived before it was kept), the best level of his
    history, his career in the game and his caps."""
    snapshot = row.snapshot
    levels = [level / 2 for _, run in world.trajectories.get(row.player_id, []) for level in run]
    rating = snapshot.rating if snapshot else levels[-1] if levels else None
    career = world.international.retired_careers.get(row.player_id)
    # Without the day's snapshot, an international still has the nation he played for.
    nationalities = list(snapshot.nationalities) if snapshot else [career.national_team] if career and career.national_team else []
    return {'position': snapshot.position if snapshot else None, 'nationalities': nationalities,
            'rating': None if rating is None else round(rating, 1), 'peak': None if rating is None else round(max([rating, *levels]), 1),
            'league': league_ref(world, row.source_id),
            'matches': played['matches'], 'goals': played['goals'], 'assists': played['assists'],
            'average': round(played['rating_sum'] / played['rating_count'], 2) if played['rating_count'] else None,
            'caps': career.international_caps if career else 0, 'caps_goals': career.international_goals if career else 0}


def retirement_kept(world: World, row, details: dict, chosen: MovementFilter) -> bool:
    if not named(world, row, (row.source_id,), chosen.search): return False
    if chosen.positions and details['position'] not in chosen.positions: return False
    if chosen.competition_id is not None and (details['league'] or {}).get('id') != chosen.competition_id: return False
    if chosen.club_id is not None and row.source_id != chosen.club_id: return False
    if chosen.capped and not details['caps']: return False
    return aged(row, row.born, chosen)


def academy_kept(world: World, row, details: dict, chosen: MovementFilter) -> bool:
    player, club = world.players.get(row.player_id), world.clubs.get(row.target_id)
    if not named(world, row, (row.target_id,), chosen.search): return False
    if chosen.positions and details.get('position') not in chosen.positions: return False
    if chosen.competition_id is not None and (club is None or club.competition_id != chosen.competition_id): return False
    if chosen.club_id is not None and row.target_id != chosen.club_id: return False
    if chosen.nation and (club is None or club.nation != chosen.nation): return False
    # The level is the one he has today, as the list shows it beside the one of his promotion.
    rating, potential = player.rating if player else details.get('rating'), details.get('potential')
    if (chosen.rating_min > 0 or chosen.rating_max < 100) and (rating is None or not chosen.rating_min <= rating <= chosen.rating_max): return False
    if (chosen.potential_min > 0 or chosen.potential_max < 100) and (potential is None or not chosen.potential_min <= potential <= chosen.potential_max): return False
    if chosen.interested and world.controlled_club_id is not None and (player is None or v.interested(world, player) is not (chosen.interested == 'oui')): return False
    return aged(row, row.born, chosen)


TRANSFER_SORTS = {'date', 'position', 'name', 'nation', 'age', 'rating', 'source', 'target', 'fee', 'value'}
RETIREMENT_SORTS = {'date', 'position', 'name', 'nation', 'age', 'source', 'league', 'rating', 'peak', 'matches', 'goals', 'assists', 'average',
                    'caps', 'caps_goals'}
# A promotion sorts on what the player was that day, and on what he is today: his level, what he gained, his value, what he
# asks of the human club, his attributes and his composites.
ACADEMY_SORTS = {'position', 'name', 'nation', 'age', 'rating', 'potential', 'club', 'value', 'wage', 'contract_end', 'fitness', 'promotion_date',
                 'academy_club', 'data_at', 'level', 'progress', 'worth', 'wage_demand', 'interested', *ATTRIBUTE_NAMES, *v.COMPOSITES}
DEFAULT_SORTS = {'transfer': 'fee', 'retirement': 'rating', 'academy': 'promotion_date'}


def world_movements(world: World, season: int | None, kind: str, page: int, sort: str | None = None, order: str = 'desc',
                    size: int = 50, chosen: MovementFilter = MovementFilter()) -> dict:
    nav = navigation(world, season)
    sort = sort or DEFAULT_SORTS[kind]
    allowed = ACADEMY_SORTS if kind == 'academy' else TRANSFER_SORTS if kind == 'transfer' else RETIREMENT_SORTS
    if sort not in allowed or order not in ('asc', 'desc'): raise ValueError('Tri des mouvements invalide.')
    season_rows = season_movements(world, nav['season'], MOVEMENT_KINDS[kind])
    # What each tab tells of a movement beyond its clubs and its date, which its filters and its sorts read too.
    if kind == 'academy':
        entries = [(row, v.academy_player_row(world, row)) for row in season_rows]
        entries = [(row, details) for row, details in entries if academy_kept(world, row, details, chosen)]
    elif kind == 'retirement':
        played = career_totals(world, {row.player_id for row in season_rows})
        entries = [(row, retirement_details(world, row, played[row.player_id])) for row in season_rows]
        entries = [(row, details) for row, details in entries if retirement_kept(world, row, details, chosen)]
    else:
        entries = [(row, {}) for row in season_rows if kept(world, row, chosen)]
    entries.sort(key=lambda entry: (entry[0].date, entry[0].player_id), reverse=True)
    def club_name(club_id):
        return v.normalized(world.clubs[club_id].name) if club_id in world.clubs else 'libre'
    def today(row, field):
        """What a transfer's player is today; None once he has retired."""
        player = world.players.get(row.player_id)
        if player is None: return None
        if field == 'position': return v.position_rank(player.position)
        if field == 'nation': return player.nation
        return player.rating if field == 'rating' else v.market_value(player, world)
    def promoted_today(row, details):
        """What a promoted player is today, for the sorts on it; None once he has left the world."""
        player = world.players.get(row.player_id)
        if player is None: return None
        if sort == 'level': return player.rating
        if sort == 'progress': return None if details.get('rating') is None else player.rating - details['rating']
        if sort == 'worth': return v.market_value(player, world)
        if sort == 'wage_demand': return v.asked_wage(world, player)
        if sort == 'interested':
            keen = v.interested(world, player)
            return None if keen is None else int(keen)
        return player.attributes.get(sort) if sort in ATTRIBUTE_NAMES else v.composite(player, sort, world.config)
    def key(row, details):
        if sort in ('date', 'promotion_date'): return row.date.iso()
        if sort == 'name': return v.normalized(v.player_name(world, row.player_id)) if v.player_name(world, row.player_id) else None
        if sort == 'source': return club_name(row.source_id)
        if sort in ('target', 'academy_club'): return club_name(row.target_id)
        if sort == 'fee': return row.fee
        if kind == 'transfer':
            if sort == 'age': return v.transfer_row(world, row)['age']
            return today(row, sort)
        if kind == 'retirement':
            if sort == 'position': return v.position_rank(details['position']) if details['position'] else None
            if sort == 'nation': return details['nationalities'][0] if details['nationalities'] else None
            if sort == 'age': return row.born.age_on(row.date) if row.born else None
            if sort == 'league': return v.normalized(details['league']['name']) if details['league'] else None
            return details[sort]
        if sort in ('level', 'progress', 'worth', 'wage_demand', 'interested') or sort in ATTRIBUTE_NAMES or sort in v.COMPOSITES:
            return promoted_today(row, details)
        if sort == 'nation': return v.normalized(' / '.join(details.get('nationality_names', []))) or None
        if sort == 'club': return v.normalized(details['club']['name']) if details.get('club') else ('libre' if details.get('data_at') != 'unknown' else None)
        if sort == 'data_at': return {'promotion': 'a la promotion', 'current': 'actuelles', 'unknown': 'non archivees'}[details['data_at']]
        value = details.get(sort)
        return v.normalized(value) if isinstance(value, str) else value
    known, missing = [], []
    for row, details in entries:
        value = key(row, details)
        (missing if value is None else known).append((row, details, value))
    if sort == 'fee':
        known.sort(key=lambda item: v.normalized(v.player_name(world, item[0].player_id) or ''))
        known.sort(key=lambda item: item[2], reverse=order == 'desc')
    else:
        known.sort(key=lambda item: (item[2], item[0].date, item[0].player_id), reverse=order == 'desc')
    data = v.paginate(known + missing, page, size)
    def shown(row, details) -> dict:
        if kind == 'retirement': return {**v.transfer_row(world, row), **details}
        if kind != 'academy': return v.transfer_row(world, row)
        # Beside what he was, the promoted player as he is today, with what he would ask of the human club.
        player = world.players.get(row.player_id)
        current = {**v.player_row(world, player), 'interested': v.interested(world, player), 'wage_demand': v.asked_wage(world, player)} if player else None
        return {**v.transfer_row(world, row), 'details': {**details, 'current': current}}
    data['items'] = [shown(row, details) for row, details, _ in data['items']]
    # Each tab names how many movements the season holds, whatever the filters.
    counts = {name: len(season_movements(world, nav['season'], kinds)) for name, kinds in MOVEMENT_KINDS.items()}
    # The countries of the clubs that promoted a player this season, for the list of the filter.
    nations = {'nations': sorted({world.clubs[row.target_id].nation for row in season_rows if row.target_id in world.clubs})} if kind == 'academy' else {}
    return {**data, **nav, **nations, 'type': kind, 'sort': sort, 'order': order, 'counts': counts,
            'history_since': (world.movement_history_since or world.date).iso()}


def market_summary(world: World, season: int | None) -> dict:
    """A season's transfers in figures: their count and fees, the weeks they were signed in, and what each club and each
    league spent and received. A club counts for the league it plays in today (None outside the simulated ones)."""
    nav = navigation(world, season)
    rows = season_movements(world, nav['season'], TRANSFER_KINDS)
    fees = sorted(row.fee for row in rows if row.fee > 0)
    record = max(rows, key=lambda row: row.fee, default=None)
    weeks: dict[int, dict] = {}
    clubs: dict[int, dict] = {}
    leagues: dict[int | None, dict] = {}
    def side(book: dict, key, kind: str, fee: int) -> None:
        entry = book.setdefault(key, {'arrivals': 0, 'departures': 0, 'spent': 0, 'earned': 0})
        entry['arrivals' if kind == 'spent' else 'departures'] += 1
        entry[kind] += fee
    for row in rows:
        # Ordinal 1 is a Monday.
        monday = row.date.ordinal() - (row.date.ordinal() - 1) % 7
        week = weeks.setdefault(monday, {'week': Date.from_ordinal(monday).iso(), 'summer': summer_move(world, row.date), 'count': 0, 'volume': 0})
        week['count'] += 1
        week['volume'] += row.fee
        for club_id, kind in ((row.target_id, 'spent'), (row.source_id, 'earned')):
            club = world.clubs.get(club_id)
            if club is None: continue
            side(clubs, club.id, kind, row.fee)
            side(leagues, club.competition_id, kind, row.fee)
    return {**nav, 'total': len(rows), 'paid': len(fees), 'volume': sum(fees), 'median': fees[len(fees) // 2] if fees else 0,
            'record': {'fee': record.fee, 'player_id': record.player_id, 'player': v.player_name(world, record.player_id)} if record and record.fee else None,
            'weeks': [weeks[monday] for monday in sorted(weeks)],
            # Clubs that paid or received a fee, biggest spenders first.
            'clubs': sorted(({'club': v.club_ref(world, club_id), **entry} for club_id, entry in clubs.items() if entry['spent'] or entry['earned']),
                            key=lambda entry: (-entry['spent'], entry['club']['name'])),
            'leagues': sorted(({'id': league_id, 'name': world.competitions[league_id].name if league_id is not None else None, **entry}
                               for league_id, entry in leagues.items()), key=lambda entry: (entry['id'] is None, -entry['spent']))}



def mean(values: list, digits: int = 1) -> float | None:
    return round(sum(values) / len(values), digits) if values else None


def retirement_summary(world: World, season: int | None) -> dict:
    """A season's retirements in figures: how many, at what age, how many internationals, and the clubs and the leagues
    they left. Players retired without a club count in the totals only."""
    nav = navigation(world, season)
    rows = season_movements(world, nav['season'], {'retirement'})
    played = career_totals(world, {row.player_id for row in rows})
    ages, capped, oldest = [], 0, None
    clubs: dict[int, dict] = {}
    leagues: dict[int | None, dict] = {}
    for row in rows:
        age = row.born.age_on(row.date) if row.born else None
        if age is not None:
            ages.append(age)
            if oldest is None or age > oldest[0]: oldest = (age, row.player_id)
        career = world.international.retired_careers.get(row.player_id)
        capped += bool(career and career.international_caps)
        club = world.clubs.get(row.source_id)
        if club is None: continue
        for book, key in ((clubs, club.id), (leagues, club.competition_id)):
            entry = book.setdefault(key, {'count': 0, 'ages': [], 'matches': 0})
            entry['count'] += 1
            entry['matches'] += played[row.player_id]['matches']
            if age is not None: entry['ages'].append(age)
    def figures(entry: dict) -> dict:
        return {'count': entry['count'], 'average_age': mean(entry['ages']), 'matches': entry['matches']}
    return {**nav, 'total': len(rows), 'average_age': mean(ages), 'capped': capped,
            'oldest': {'age': oldest[0], 'player_id': oldest[1], 'player': v.player_name(world, oldest[1])} if oldest else None,
            'ages': [{'age': age, 'count': ages.count(age)} for age in range(min(ages), max(ages) + 1)] if ages else [],
            # The clubs that lost the most players first.
            'clubs': sorted(({'club': v.club_ref(world, club_id), 'league': league_ref(world, club_id), **figures(entry)} for club_id, entry in clubs.items()),
                            key=lambda entry: (-entry['count'], entry['club']['name'])),
            'leagues': sorted(({'id': league_id, 'name': world.competitions[league_id].name if league_id is not None else None, **figures(entry)}
                               for league_id, entry in leagues.items()), key=lambda entry: (entry['id'] is None, -entry['count']))}


# The potentials of a class of promoted players are counted by ten levels out of 200, everything under 100 together.
POTENTIAL_FLOOR, POTENTIAL_STEP, POTENTIAL_TOP = 100, 10, 200


def academy_summary(world: World, season: int | None) -> dict:
    """A season's promotions in figures: how many, their potential and what they have gained since, then the clubs that
    trained them and the countries of those clubs. A promotion archived without its potential counts for its club and
    its country, not in the potentials."""
    nav = navigation(world, season)
    rows = season_movements(world, nav['season'], {'academy'})
    potentials, gains, best = [], [], None
    clubs: dict[int, dict] = {}
    nations: dict[str, dict] = {}
    for row in rows:
        player, snapshot, club = world.players.get(row.player_id), row.snapshot, world.clubs.get(row.target_id)
        potential = snapshot.potential if snapshot and snapshot.potential is not None else player.potential if player else None
        if snapshot and player: gains.append(player.rating - snapshot.rating)
        books = [clubs.setdefault(club.id, {'count': 0, 'potentials': [], 'best': None}),
                 nations.setdefault(club.nation, {'count': 0, 'potentials': [], 'best': None, 'clubs': set()})] if club else []
        for entry in books: entry['count'] += 1
        if club: books[1]['clubs'].add(club.id)
        if potential is None: continue
        potentials.append(potential)
        if best is None or potential > best[0]: best = (potential, row.player_id)
        for entry in books:
            entry['potentials'].append(potential)
            if entry['best'] is None or potential > entry['best'][0]: entry['best'] = (potential, row.player_id)
    def prospect(found) -> dict | None:
        return {'potential': round(found[0], 1), 'player_id': found[1], 'player': v.player_name(world, found[1])} if found else None
    levels = [history_level(potential) for potential in potentials]
    floors = range(POTENTIAL_FLOOR, POTENTIAL_TOP, POTENTIAL_STEP)
    return {**nav, 'total': len(rows), 'average_potential': mean(potentials), 'best': prospect(best), 'average_progress': mean(gains, 2),
            'bins': [{'from': None, 'count': sum(level < POTENTIAL_FLOOR for level in levels)},
                     *({'from': floor, 'count': sum(floor <= level < floor + POTENTIAL_STEP or level == POTENTIAL_TOP == floor + POTENTIAL_STEP for level in levels)}
                       for floor in floors)],
            # The clubs by their best prospect, then by the mean potential of their class.
            'academies': sorted(({'club': v.club_ref(world, club_id), 'count': entry['count'], 'average_potential': mean(entry['potentials']),
                                  'best': prospect(entry['best']), 'youth_recruitment': world.clubs[club_id].youth_recruitment}
                                 for club_id, entry in clubs.items()),
                                key=lambda entry: (-(entry['best'] or {}).get('potential', 0), -(entry['average_potential'] or 0), entry['club']['name'])),
            'nations': sorted(({'code': code, 'count': entry['count'], 'clubs': len(entry['clubs']), 'average_potential': mean(entry['potentials']),
                                'best': round(entry['best'][0], 1) if entry['best'] else None} for code, entry in nations.items()),
                              key=lambda entry: (-entry['count'], entry['code']))}


def finances(world: World, club_id: int, season: int | None) -> dict:
    nav = navigation(world, season)
    record = world.finance_history.get(club_id, {}).get(nav["season"])
    since = world.finance_history_since or world.date
    review = world.config.world.key_dates.population_review
    start = Date(nav["season"], review.month, review.day)
    totals = {key: 0 for key in ("income", "wages", "operating_costs", "transfer_income", "transfer_expenses", "rounding_income", "rounding_expenses")}
    entries = []
    if record:
        for month, amounts in record.months.items():
            period = Date(nav["season"] + (month < review.month), month, 1).iso()
            for key, label, expense in (("income", "Revenus structurels", False), ("wages", "Salaires", True),
                                        ("operating_costs", "Frais de fonctionnement", True)):
                amount = getattr(amounts, key)
                totals[key] += amount
                if amount: entries.append({"date": period, "monthly": True, "label": label, "revenue": 0 if expense else amount, "expense": amount if expense else 0})
            totals["transfer_income"] += amounts.transfer_income
            totals["transfer_expenses"] += amounts.transfer_expenses
            rounding = amounts.rounding
            totals["rounding_income"] += max(0, rounding)
            totals["rounding_expenses"] += max(0, -rounding)
            if rounding: entries.append({"date": period, "monthly": True, "label": "Régularisation des arrondis", "revenue": max(0, rounding), "expense": max(0, -rounding)})
        for index in record.transfer_indices:
            item = world.transfers[index]
            sale = item.source_id == club_id
            entries.append({"date": item.date.iso(), "monthly": False, "label": "Vente de joueur" if sale else "Achat de joueur",
                            "player_id": item.player_id, "player": v.player_name(world, item.player_id),
                            "revenue": item.fee if sale else 0, "expense": 0 if sale else item.fee})
    revenue = totals["income"] + totals["transfer_income"] + totals["rounding_income"]
    expenses = totals["wages"] + totals["operating_costs"] + totals["transfer_expenses"] + totals["rounding_expenses"]
    opening = record.opening_balance if record else None
    return {**nav, "since": since.iso(), "partial": since > start, "available": record is not None,
            "opening_balance": opening, "closing_balance": opening + revenue - expenses if opening is not None else None,
            "revenue": revenue, "expenses": expenses, "net": revenue - expenses, "totals": totals,
            "entries": sorted(entries, key=lambda row: (row["date"], row["label"]), reverse=True)}
