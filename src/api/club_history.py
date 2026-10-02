"""Seasonal club cash accounts and durable squad movements; read-only projections."""
from dataclasses import dataclass

from core.domain.date import Date
from core.domain.world import World
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
    """What narrows the world's transfers of a season; retirements and promotions only take the search."""
    search: str = ''  # normalized, in the player's name or either club's
    window: str | None = None  # 'ete' or 'hiver'
    nature: str | None = None  # 'payant' or 'libre'
    competition_id: int | None = None  # the league either club plays in today
    positions: frozenset[str] = frozenset()  # the player's position today
    age_min: int = 0
    age_max: int = 100
    fee_min: int = 0
    club_id: int | None = None


def summer_move(world: World, day: Date) -> bool:
    """Whether a movement belongs to the summer window: the first half of a season, which opens with it."""
    opening = world.config.world.key_dates.population_review.month
    return (day.month - opening) % 12 < 6


def season_movements(world: World, season: int, kinds: set[str]) -> list:
    return [item for item in world.transfers if item.kind in kinds
            and (item.season if item.season is not None else financial_season(world, item.date)) == season]


def kept(world: World, row, chosen: MovementFilter) -> bool:
    player = world.players.get(row.player_id)
    clubs = [world.clubs[club_id] for club_id in (row.source_id, row.target_id) if club_id in world.clubs]
    if chosen.search and not any(chosen.search in v.normalized(name) for name in (v.player_name(world, row.player_id) or '', *(club.name for club in clubs))):
        return False
    if chosen.window and summer_move(world, row.date) != (chosen.window == 'ete'): return False
    if chosen.nature and (row.fee > 0) != (chosen.nature == 'payant'): return False
    if chosen.competition_id is not None and all(club.competition_id != chosen.competition_id for club in clubs): return False
    if chosen.club_id is not None and chosen.club_id not in (row.source_id, row.target_id): return False
    if chosen.positions and (player is None or player.position not in chosen.positions): return False
    if chosen.fee_min and row.fee < chosen.fee_min: return False
    if chosen.age_min > 0 or chosen.age_max < 100:
        born = row.born or (player.born if player else None)
        if born is None or not chosen.age_min <= born.age_on(row.date) <= chosen.age_max: return False
    return True


def world_movements(world: World, season: int | None, kind: str, page: int, sort: str | None = None, order: str = 'desc',
                    size: int = 50, chosen: MovementFilter = MovementFilter()) -> dict:
    nav = navigation(world, season)
    sort = sort or ('promotion_date' if kind == 'academy' else 'fee' if kind == 'transfer' else 'date')
    allowed = ({'position', 'name', 'nation', 'age', 'rating', 'potential', 'club', 'value', 'wage',
                'contract_end', 'fitness', 'promotion_date', 'academy_club', 'data_at'} if kind == 'academy' else
               {'date', 'position', 'name', 'nation', 'age', 'rating', 'source', 'target', 'fee', 'value'} if kind == 'transfer'
               else {'date', 'name', 'source'})
    if sort not in allowed or order not in ('asc', 'desc'): raise ValueError('Tri des mouvements invalide.')
    if kind != 'transfer': chosen = MovementFilter(chosen.search)
    rows = [item for item in season_movements(world, nav['season'], MOVEMENT_KINDS[kind]) if kept(world, item, chosen)]
    rows.sort(key=lambda item: (item.date, item.player_id), reverse=True)
    def club_name(club_id):
        return v.normalized(world.clubs[club_id].name) if club_id in world.clubs else 'libre'
    def today(row, field):
        """What a transfer's player is today; None once he has retired."""
        player = world.players.get(row.player_id)
        if player is None: return None
        if field == 'position': return v.position_rank(player.position)
        if field == 'nation': return player.nation
        return player.rating if field == 'rating' else v.market_value(player, world)
    def key(row, details):
        if sort in ('date', 'promotion_date'): return row.date.iso()
        if sort == 'name': return v.normalized(v.player_name(world, row.player_id)) if v.player_name(world, row.player_id) else None
        if sort == 'source': return club_name(row.source_id)
        if sort in ('target', 'academy_club'): return club_name(row.target_id)
        if sort == 'fee': return row.fee
        if kind == 'transfer':
            if sort == 'age': return v.transfer_row(world, row)['age']
            return today(row, sort)
        if sort == 'nation': return v.normalized(' / '.join(details.get('nationality_names', []))) or None
        if sort == 'club': return v.normalized(details['club']['name']) if details.get('club') else ('libre' if details.get('data_at') != 'unknown' else None)
        if sort == 'data_at': return {'promotion': 'a la promotion', 'current': 'actuelles', 'unknown': 'non archivees'}[details['data_at']]
        value = details.get(sort)
        return v.normalized(value) if isinstance(value, str) else value
    known, missing = [], []
    for row in rows:
        details = v.academy_player_row(world, row) if kind == 'academy' else {}
        value = key(row, details)
        (missing if value is None else known).append((row, details, value))
    if sort == 'fee':
        known.sort(key=lambda item: v.normalized(v.player_name(world, item[0].player_id) or ''))
        known.sort(key=lambda item: item[2], reverse=order == 'desc')
    else:
        known.sort(key=lambda item: (item[2], item[0].date, item[0].player_id), reverse=order == 'desc')
    data = v.paginate(known + missing, page, size)
    data['items'] = [{**v.transfer_row(world, row), **({'details': details} if kind == 'academy' else {})} for row, details, _ in data['items']]
    # Each tab names how many movements the season holds, whatever the filters.
    counts = {name: len(season_movements(world, nav['season'], kinds)) for name, kinds in MOVEMENT_KINDS.items()}
    return {**data, **nav, 'type': kind, 'sort': sort, 'order': order, 'counts': counts,
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
