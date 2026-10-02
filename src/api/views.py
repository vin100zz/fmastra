"""Public read models; simulation RNGs never leave this layer."""
from __future__ import annotations

from dataclasses import asdict, replace
import unicodedata

from core.domain.clubs import Competition
from core.domain.date import Date
from core.domain.world import World
from core.domain.players import Player, Position, ATTRIBUTE_NAMES
from core.domain.matches import Match, MatchResult
from core.ai.market import market_value, asking_price, can_sell
from core.engine.abilities import weighted_rating
from core.world.calendar import standings
from core.world.finances import financial_season
from core.world.cups import ROUND_NAMES


def normalized(value: str) -> str:
    return "".join(character for character in unicodedata.normalize("NFKD", value.casefold()) if not unicodedata.combining(character))


POSITION_ORDER = ["GB", "DG", "DD", "DC", "MDC", "MC", "MOC", "AILG", "AILD", "BU"]


def position_rank(position: str) -> int:
    return POSITION_ORDER.index(position) if position in POSITION_ORDER else len(POSITION_ORDER)


# The composites the match engine plays with (`attributs.composites`), by their configuration name, in the order the
# screens show them: attack, defence, then goalkeeping.
COMPOSITES = {"progression_attaque": "progression_attack", "occasion_attaque": "creation_attack", "tir": "shooting",
              "tete": "heading", "progression_defense": "progression_defense", "occasion_defense": "creation_defense",
              "arret": "saving", "sortie": "claiming"}
# What each position mostly asks of a player, after its involvement in each phase of play (implications.json) and whom
# the engine names on a shot: the composites the screens single out, the key one first. A display choice: no match reads it.
COMPOSITES_BY_POSITION = {
    "GB": ("arret", "sortie"),
    "DC": ("occasion_defense", "progression_defense", "tete"),
    "DG": ("progression_defense", "progression_attaque", "occasion_defense"),
    "DD": ("progression_defense", "progression_attaque", "occasion_defense"),
    "MDC": ("progression_defense", "progression_attaque"),
    "MC": ("progression_attaque", "progression_defense"),
    "MOC": ("occasion_attaque", "progression_attaque", "tir"),
    "AILG": ("progression_attaque", "occasion_attaque", "tir"),
    "AILD": ("progression_attaque", "occasion_attaque", "tir"),
    "BU": ("tir", "occasion_attaque", "tete")}


def composite(player: Player, key: str, cfg) -> float:
    return weighted_rating(player.attributes, getattr(cfg.attributes.composites, COMPOSITES[key]))


def position_notes(player: Player, cfg) -> dict[str, float]:
    """The player's note at each position, on the level's scale: the mean of the composites that position singles out,
    times the engine's out-of-position factor for his affinity there."""
    values = {key: composite(player, key, cfg) for key in COMPOSITES}
    penalty = cfg.attributes.out_of_position
    return {position: round(sum(values[key] for key in keys) / len(keys)
                            * (penalty.base + penalty.factor * player.affinity(Position(position))), 1)
            for position, keys in COMPOSITES_BY_POSITION.items()}


def position_affinities(player: Player) -> dict[str, int]:
    """His affinity to each position out of 20, as the engine reads it: his ratings by position, and without any his own and his secondary ones."""
    return {position.value: round(player.affinity(position) * 20) for position in Position}


def paginate(items: list, page: int, size: int = 30) -> dict:
    return {"items": items[(page - 1) * size:page * size], "total": len(items), "page": page, "page_size": size}


def club_ref(world: World, club_id: int | None) -> dict | None:
    club = world.clubs.get(club_id)
    return {"id": club.id, "name": club.name, "major_color": club.home_kit_major_color,
            "minor_color": club.home_kit_minor_color} if club else None


def player_name(world: World, player_id: int | None) -> str | None:
    player = world.players.get(player_id)
    return player.name if player else world.retired.get(player_id)


def player_row(world: World, player: Player) -> dict:
    contract = player.contract
    return {"id": player.id, "name": player.name, "position": player.position.value,
            "age": player.born.age_on(world.date), "nation": player.nation, "rating": round(player.rating, 1),
            "potential": round(player.potential, 1),
            "attributes": dict(zip(ATTRIBUTE_NAMES, player.attributes.values)),
            "composites": {key: round(composite(player, key, world.config), 1) for key in COMPOSITES},
            "key_composites": list(COMPOSITES_BY_POSITION[player.position]),
            "nationalities": list(player.nationalities),
            "nationality_names": [world.nation_names.get(code, code) for code in player.nationalities],
            "value": market_value(player, world),
            "club": club_ref(world, player.club_id), "wage": contract.weekly_wage if contract else 0,
            "contract_end": contract.end.iso() if contract else None,
            "expiring": bool(contract and world.date.months_until(contract.end) < 12),
            "fitness": player.fitness, "form": round(player.form, 3), "morale": round(player.morale, 3),
            "injured_until": player.injury.end.iso() if player.injury else None,
            "suspension": max((item.suspended_matches for item in player.discipline.values()), default=0),
            "goals": player.season_goals, "assists": player.season_assists,
            "appearances": player.appearances, "substitutes": player.substitutes, "minutes": round(player.season_minutes),
            "average": round(player.rating_sum / player.rating_count, 2) if player.rating_count else None}


def asking_quote(world: World, player: Player, settled: set[int]) -> dict:
    """The lowest fee his club accepts, as shown and offered: rounded up to three significant digits.

    None for a free agent, and for a player his club cannot let go (`transferable` false)."""
    from core.world.market import quoted_minimum
    seller = world.clubs.get(player.club_id) if player.club_id is not None else None
    if seller is None: return {"asking_price": None, "transferable": True}
    if player.id in settled or not can_sell(player, seller, world): return {"asking_price": None, "transferable": False}
    return {"asking_price": quoted_minimum(asking_price(player, seller, world)), "transferable": True}


def interested(world: World, player: Player) -> bool | None:
    """Whether a player accepts to join the human club; None for its own players and without a human club."""
    from core.world.transfer_rules import accepts_move
    club = world.clubs.get(world.controlled_club_id)
    return None if club is None or player.club_id == club.id else accepts_move(player, club, world)


def asked_wage(world: World, player: Player) -> int | None:
    """The weekly wage he asks to join the human club, as his counter-offer quotes it; None for its own players and without a human club."""
    from core.world import talks
    club = world.clubs.get(world.controlled_club_id)
    return None if club is None or player.club_id == club.id else talks.asked_wage(world, player)


def talks_view(world: World, player: Player) -> dict:
    """Where the human club's talks for a player stand, and what stops a new offer."""
    from core.world.talks import talks_for, opening_obstacle, available_budget
    from core.domain.offers import FEE_TALKS, SIGNING
    talks = talks_for(world, player.id)
    rounds = world.config.management.market.negotiation_rounds
    return {"etape": talks.stage if talks else None, "indemnite": talks.fee if talks else None,
            "salaire": talks.contract.weekly_wage if talks and talks.stage == SIGNING else None,
            "contre_offre": talks.counter if talks else None, "tours_restants": rounds - (talks.rounds if talks else 0),
            "date_prevue": talks.due.iso() if talks and talks.due else None, "budget": available_budget(world, player),
            "obstacle": opening_obstacle(world, player) if talks is None or talks.stage == FEE_TALKS else None}


def incoming_offers(world: World, player_id: int) -> list[dict]:
    """The offers for a player of the human club that await its answer."""
    return [{"offre_id": offer.key, "acheteur": club_ref(world, offer.target_id), "indemnite": offer.fee,
             "salaire_propose": offer.contract.weekly_wage}
            for offer in world.offers.values() if offer.player_id == player_id and offer.source_id == world.controlled_club_id
            and offer.awaiting_review]


def sale_view(world: World, player: Player) -> dict:
    """A player of the human club: the fee asked if he is on its transfer list, what stops offering him to the clubs, and the offers awaiting an answer."""
    from core.world.human import listed_price
    from core.world.sales import offer_obstacle
    return {"prix_liste": listed_price(world, player.id), "obstacle_proposition": offer_obstacle(world, player),
            "offres": incoming_offers(world, player.id)}


def international_records(world: World, player_id: int) -> list[dict]:
    """A player's international editions, each with the average of the ratings he was given in it (None before any)."""
    return [{**asdict(row), "average": round(row.rating_sum / row.rating_count, 2) if row.rating_count else None}
            for row in world.international.records.values() if row.player_id == player_id]


def player_morale(world: World, player: Player) -> dict:
    """The morale outlook of one player, as the squad list gives it for each player of a club."""
    from core.world.contracts import games_by_club, position_ranks
    from core.world.transfer_rules import season_arrivals
    club = world.clubs.get(player.club_id)
    if club is None: return {"morale_target": None, "morale_cause": None, "wage_satisfaction": None, "playing_time_satisfaction": None}
    played = season_arrivals(world, club.id).get(player.id, (games_by_club(world)[club.id], player.season_minutes))
    return morale_outlook(world, player, club, position_ranks(world, club)[player.id], *played)


def player_detail(world: World, player: Player) -> dict:
    from core.world.transfer_rules import recent_arrival_ids
    result = player_row(world, player)
    result.update(asking_quote(world, player, recent_arrival_ids(world)))
    result.update(player_morale(world, player))
    result["greed"] = player.greed
    # The bounds form keeps, for the page to draw it between them.
    result["form_bounds"] = [world.config.states.form.min, world.config.states.form.max]
    result.update({"born": player.born.iso(),
                   "national_team": player.national_team,
                   "national_team_id": next((team.id for team in world.international.nations.values() if team.code == player.national_team), None),
                   "international_caps": player.international_caps, "international_goals": player.international_goals,
                   "historical_caps": player.historical_caps, "historical_goals": player.historical_goals,
                   "international_records": international_records(world, player.id),
                   "secondary_positions": list(player.secondary_positions),
                   # Weight of each attribute in the rating of his main position: the page orders and marks attributes with it.
                   "attribute_weights": dict(world.config.attributes.overall[player.position]),
                   "attributes_imported": player.source_current_ability is not None,
                   "position_ratings": player.position_ratings,
                   "position_notes": position_notes(player, world.config),
                   # The page names what each composite weighs and, for the position picked on its pitch, which ones count there.
                   "composite_weights": {key: dict(getattr(world.config.attributes.composites, name)) for key, name in COMPOSITES.items()},
                   "composites_by_position": {position: list(keys) for position, keys in COMPOSITES_BY_POSITION.items()},
                   "form": player.form, "morale": player.morale, "value": market_value(player, world),
                   "discipline": [{"competition": world.competitions[cid].name, **asdict(item)} for cid, item in player.discipline.items()]
                       + [{"competition": edition.name, **asdict(item)} for edition in world.international.editions.values()
                          if (item := player.international_discipline.get(edition.competition_id)) is not None]})
    return result


def match_row(world: World, match: Match) -> dict:
    if match.id in world.international.matches:
        from .international import international_match_row
        return international_match_row(world, match)
    from core.world.europe import aggregate_score, round_label
    competition = world.competitions[match.competition_id]
    return {"id": match.id, "date": match.date.iso(), "round": match.round_number,
            "season": match.season, "competition_id": match.competition_id,
            "competition": competition.name, "aggregate": aggregate_score(world, match),
            "first_leg_id": match.first_leg_id,
            "home": club_ref(world, match.home_id), "away": club_ref(world, match.away_id),
            "score": [match.result.home_goals, match.result.away_goals] if match.result else None,
            "penalties": match.result.penalties if match.result else None,
            "winner_id": match.result.winner_id if match.result else None,
            "neutral": match.neutral,
            "round_label": (round_label(world, match.round_number) if competition.kind == "europe" else
                            ROUND_NAMES[match.round_number - 1] if competition.kind == "cup"
                            else f"Journée {match.round_number}")}


def table(world: World, competition_id: int, season: int | None = None) -> list[dict]:
    competition = world.competitions[competition_id]
    if competition.kind == "cup":
        return []
    matches = ([world.matches[mid] for mid in competition.match_ids] if season is None else
               [match for match in world.matches.values() if match.season == season and match.competition_id == competition_id])
    if season is not None:
        competition = replace(competition, club_ids=sorted({cid for match in matches for cid in (match.home_id, match.away_id)}))
    count = world.config.world.promotion_relegation.club_count
    if competition.kind == "europe":
        rules = world.config.world.europe
        return [{**asdict(row), "club": club_ref(world, row.club_id), "difference": row.difference,
                 "rank": index + 1, "form": row.form[-5:],
                 "movement": "direct" if index < rules.direct_places else
                             "playoff" if index < rules.direct_places + rules.playoff_places else "eliminated"}
                for index, row in enumerate(standings(competition, matches, world.config))]
    european_places = 0
    if competition.level == 1:
        from core.world.europe import resolve_european_quotas
        quotas = resolve_european_quotas(world, season if season is not None else world.season)
        european_places = sum(quotas.get(competition.nation, (0, 0, 0)))
    return [{**asdict(row), "club": club_ref(world, row.club_id), "difference": row.difference, "rank": index + 1, "form": row.form[-5:],
             "movement": ("champion" if competition.level == 1 and index == 0 else
                          "europe" if competition.level == 1 and index < european_places else
                          "promotion" if competition.level > 1 and index < count else
                          "relegation" if index >= len(competition.club_ids) - count else None)}
            for index, row in enumerate(standings(competition, matches, world.config))]


TOP_SQUAD = 16


def top_average(values) -> float | None:
    """Mean of the TOP_SQUAD best values; a smaller squad averages all it has."""
    best = sorted(values, reverse=True)[:TOP_SQUAD]
    return round(sum(best) / len(best), 1) if best else None


def squad_strength(world: World, club_id: int) -> dict:
    players = [world.players[pid] for pid in world.clubs[club_id].player_ids]
    return {"top_rating": top_average(player.rating for player in players),
            "top_potential": top_average(player.potential for player in players)}


def club_detail(world: World, club_id: int) -> dict:
    club = world.clubs[club_id]
    standing = next((row for row in table(world, club.competition_id) if row["club_id"] == club.id), None) if club.competition_id else None
    return {"id": club.id, "name": club.name, "nation_code": club.nation, "nation": world.nation_names.get(club.nation, club.nation),
            "competition_id": club.competition_id, "competition": world.competitions[club.competition_id].name if club.competition_id else None,
            "active": club.competition_id is not None, "capacity": club.capacity, "reputation": round(club.reputation, 1),
            "academy": round(club.academy, 1), "training_facilities": club.training_facilities,
            "youth_recruitment": club.youth_recruitment,
            "formation": club.formation, "squad_size": len(club.player_ids), **squad_strength(world, club_id), "standing": standing,
            "major_color": club.home_kit_major_color, "minor_color": club.home_kit_minor_color,
            "third_color": club.home_kit_third_color}


def finance_summary(world: World, club_id: int) -> dict:
    club = world.clubs[club_id]
    data = {name: getattr(club, name) for name in ("balance", "income", "transfer_budget", "wage_bill", "wage_cap", "season_spent", "season_sales")}
    data["reserved_transfer_budget"] = sum(offer.ceiling for offer in world.offers.values() if offer.target_id == club_id)
    data["reserved_wages"] = sum(offer.contract.weekly_wage for offer in world.offers.values() if offer.target_id == club_id)
    return data


def transfers(world: World, club_id: int | None = None, player_id: int | None = None, season: int | None = None) -> list[dict]:
    rows = [item for item in world.transfers if (club_id is None or club_id in (item.source_id, item.target_id))
            and (player_id is None or item.player_id == player_id)
            and (season is None or (item.season if item.season is not None else financial_season(world, item.date)) == season)]
    return [transfer_row(world, row) for row in reversed(rows)]


def transfer_row(world: World, row) -> dict:
    player = world.players.get(row.player_id)
    born = row.born or (player.born if player else None)
    if born is None:
        born = next((item.born for item in world.transfers if item.player_id == row.player_id and item.born), None)
    return {"date": row.date.iso(), "player_id": row.player_id, "player": player_name(world, row.player_id),
            "source": club_ref(world, row.source_id), "target": club_ref(world, row.target_id), "fee": row.fee, "kind": row.kind,
            "age": born.age_on(row.date) if born else None}


def academy_player_row(world: World, row) -> dict:
    snapshot = row.snapshot
    if snapshot:
        potential = snapshot.potential
        if potential is None and row.player_id in world.players:
            # Snapshots archived before the exact value was stored; a player's potential never changes.
            potential = world.players[row.player_id].potential
        return {"id": row.player_id, "name": player_name(world, row.player_id), "age": snapshot.born.age_on(row.date),
                "position": snapshot.position, "nationalities": snapshot.nationalities,
                "nationality_names": [world.nation_names.get(code, code) for code in snapshot.nationalities],
                "rating": snapshot.rating, "potential": None if potential is None else round(potential, 1),
                "wage": snapshot.weekly_wage, "value": snapshot.value, "contract_end": snapshot.contract_end.iso() if snapshot.contract_end else None,
                "club": club_ref(world, row.target_id), "fitness": snapshot.fitness, "data_at": "promotion"}
    if row.player_id in world.players:
        return {**player_row(world, world.players[row.player_id]), "data_at": "current"}
    return {"id": row.player_id, "name": player_name(world, row.player_id), "nationalities": [], "data_at": "unknown"}


def club_season_stats(world: World, club_id: int, player_ids) -> dict[int, dict]:
    """Current-season statistics of these players for this club only, whatever they did elsewhere."""
    stats = {pid: dict(appearances=0, substitutes=0, minutes=0, goals=0, assists=0, yellows=0, reds=0, rating_sum=0, rating_count=0)
             for pid in player_ids}
    for record in world.records.values():
        if record.season != world.season or record.club_id != club_id or record.player_id not in stats: continue
        row = stats[record.player_id]
        row['appearances'] += record.matches
        row['substitutes'] += record.substitutes
        for key in ('minutes', 'goals', 'assists', 'yellows', 'reds', 'rating_sum', 'rating_count'):
            row[key] += getattr(record, key)
    for row in stats.values():
        row['average'] = round(row.pop('rating_sum') / max(1, row.pop('rating_count')), 2)
        row['minutes'] = round(row['minutes'])
    return stats


def morale_outlook(world: World, player: Player, club, rank: int, games: int, minutes: float) -> dict:
    """Where his morale drifts week after week, what holds it down most (`salaire`, `temps_de_jeu` or `ambition`, None when
    nothing much does), and how content he is with his wage and his minutes, out of 1."""
    from core.world.contracts import contentment
    if player.contract is None: return {"morale_target": None, "morale_cause": None, "wage_satisfaction": None, "playing_time_satisfaction": None}
    mood, cfg = contentment(world, player, club, rank, games, minutes), world.config
    moral, rules = cfg.states.moral, cfg.management.contracts
    # What each part takes off the target, by its weight there (the satisfaction a renewal weighs counts in the target too).
    losses = {"salaire": (moral.contract_weight + moral.results_weight * rules.wage_weight) * (1 - mood.wage),
              "temps_de_jeu": (moral.playing_time_weight + moral.results_weight * rules.playing_time_weight) * (1 - mood.playing_time),
              "ambition": cfg.management.market.frustration_morale_weight * mood.frustration}
    cause = max(losses, key=losses.get)
    return {"morale_target": round(min(moral.max, max(moral.min, mood.morale_target)), 3), "morale_cause": cause if losses[cause] >= MORALE_CAUSE_MIN else None,
            "wage_satisfaction": round(mood.wage, 3), "playing_time_satisfaction": round(mood.playing_time, 3)}


# A part of the situation taking less than this off the morale target is not named as its cause.
MORALE_CAUSE_MIN = 0.05


def squad_rows(world: World, club_id: int) -> list[dict]:
    from core.world.contracts import games_by_club, position_ranks
    from core.world.transfer_rules import season_arrivals
    club = world.clubs[club_id]
    stats = club_season_stats(world, club_id, club.player_ids)
    ranks, games, arrivals = position_ranks(world, club), games_by_club(world)[club_id], season_arrivals(world, club_id)
    players = [world.players[pid] for pid in club.player_ids]
    return [{**player_row(world, player), **stats[player.id],
             **morale_outlook(world, player, club, ranks[player.id], *arrivals.get(player.id, (games, player.season_minutes)))}
            for player in players]


def club_league(world: World, club_id: int | None) -> Competition | None:
    club = world.clubs.get(club_id)
    return world.competitions[club.competition_id] if club and club.competition_id else None


def level_history(world: World, player_id: int) -> list[dict]:
    """The player's level out of 200 month by month, oldest first; seasons played before the history became monthly have a
    single point, at their opening."""
    points = []
    for start, levels in world.trajectories.get(player_id, []):
        for index, level in enumerate(levels, start):
            year, month = divmod(index, 12)
            points.append({"year": year, "month": month + 1, "season": financial_season(world, Date(year, month + 1, 1)), "level": level})
    return points


def career_league(world: World, club_id: int | None, levels: dict) -> tuple[str | None, str | None]:
    """What a club's league reads as in a career, with its nation: the name of a simulated league; outside them "D" and
    the level of the club's division (`levels`, see `division_levels`). The source gives no level to the other divisions:
    such a club plays one level under the deepest known one of its nation, hence in the top flight of a nation without
    any simulated league."""
    club = world.clubs.get(club_id)
    if club is None: return None, None
    league = club_league(world, club_id)
    if league: return league.name, league.nation
    if club.division_id in levels:
        nation, level = levels[club.division_id]
    else:
        nation = club.cup_nation or club.nation
        level = max((known for country, known in levels.values() if country == nation), default=0) + 1
    return f"D{level}", nation


def career(world: World, player_id: int) -> dict:
    from core.world.reputation import division_levels
    levels = division_levels(world.config)
    player_records =[row for row in world.records.values() if row.player_id == player_id]
    rows = {}
    for record in player_records:
        key = (record.season, record.club_id)
        rows.setdefault(key, {"season": record.season, "club": club_ref(world, record.club_id),
                             "competitions": {}, "matches": 0, "substitutes": 0, "goals": 0, "assists": 0,
                             "rating_sum": 0, "rating_count": 0})
        row = rows[key]
        competition = world.competitions[record.competition_id]
        # A row names the league division and the European cup code; national cups stay in the totals only.
        label = competition.name if competition.kind == "league" else competition.code if competition.kind == "europe" else None
        if label: row["competitions"][label] = competition.kind == "europe"
        if competition.kind == "league": row["nation"] = competition.nation
        for field in ("matches", "substitutes", "goals", "assists", "rating_sum", "rating_count"):
            row[field] += getattr(record, field)
    for (_, club_id), row in rows.items():
        labels = row.pop("competitions")
        # The league comes first, the one he played in or else his club's (a club outside the simulated leagues, or a season
        # of cup matches only), then the European cup.
        league, nation = career_league(world, club_id, levels)
        played = [label for label, european in labels.items() if not european] or ([league] if league else [])
        row["competition"] = " · ".join([*played, *(label for label, european in labels.items() if european)]) or None
        row["competition_nation"] = row.pop("nation", None) or nation
        count = row.pop("rating_count")
        total = row.pop("rating_sum")
        row["average"] = round(total / count, 2) if count else None
    moves = sorted((row for row in world.transfers if row.player_id == player_id and row.season is not None), key=lambda row: row.date)
    fees: dict[tuple[int, int], int] = {}
    order: dict[tuple[int, int], tuple[int, bool]] = {}
    targeted = {move.target_id for move in moves if move.target_id is not None}
    for move in moves:
        if move.target_id is not None:
            key = (move.season, move.target_id)
            fees[key] = fees.get(key, 0) + move.fee
            order[key] = (move.date.ordinal(), True)
        # A source club never reached as a target is where the player was before the earliest tracked transfer.
        if move.source_id is not None and move.source_id not in targeted:
            order.setdefault((move.season, move.source_id), (move.date.ordinal(), False))
    for key in order:
        if key in rows: continue
        season, club_id = key
        league, nation = career_league(world, club_id, levels)
        rows[key] = {"season": season, "club": club_ref(world, club_id),
                     "competition": league, "competition_nation": nation,
                     "matches": 0, "substitutes": 0, "goals": 0, "assists": 0, "average": None}
    items = [{**rows[key], "fee": fees.get(key)} for key in sorted(rows, key=lambda key: (key[0], order.get(key, (-1, False))), reverse=True)]
    rating_count = sum(row.rating_count for row in player_records)
    totals = {"fee": sum(fees.values()), "matches": sum(row.matches for row in player_records),
              "goals": sum(row.goals for row in player_records), "assists": sum(row.assists for row in player_records),
              "average": round(sum(row.rating_sum for row in player_records) / rating_count, 2) if rating_count else None}
    return {"items": items, "totals": totals}


def match_player_name(world: World, result: MatchResult, player_id: int | None) -> str | None:
    return result.temporary_players.get(player_id) or player_name(world, player_id)


def lineup_rows(world: World, result: MatchResult, side: str) -> list[dict]:
    """The starting eleven of one side, with the positions and ratings of that match."""
    return [{"id": pid, "name": match_player_name(world, result, pid), "position": position,
             "temporary": pid in result.temporary_players,
             "stats": asdict(result.player_stats[pid]) if pid in result.player_stats else None}
            for pid, position in getattr(result, f"{side}_lineup")]


def match_detail(world: World, match: Match) -> dict:
    data = match_row(world, match)
    data["capacity"] = None if match.neutral or match.id in world.international.matches else world.clubs[match.home_id].capacity
    result = match.result
    if result is None:
        data["result"] = None
        return data
    detail = {"engine": result.engine, "status": result.status, "duration": result.duration,
              "home_stats": asdict(result.home_stats) if result.home_stats else None,
              "away_stats": asdict(result.away_stats) if result.away_stats else None}
    detail["events"] = [{**asdict(event), "player": match_player_name(world, result, event.player_id),
                         "secondary": match_player_name(world, result, event.secondary_id),
                         "temporary": event.player_id in result.temporary_players,
                         "secondary_temporary": event.secondary_id in result.temporary_players} for event in result.events]
    for side in ("home", "away"):
        bench = getattr(result, f"{side}_bench")
        detail[f"{side}_lineup"] = lineup_rows(world, result, side)
        detail[f"{side}_bench"] = [{"id": pid, "name": match_player_name(world, result, pid), "temporary": pid in result.temporary_players,
                                      "stats": asdict(result.player_stats[pid]) if pid in result.player_stats else None} for pid in bench]
    data["result"] = detail
    return data
