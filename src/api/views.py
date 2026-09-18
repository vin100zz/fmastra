"""Public read models; true potential and simulation RNGs never leave this layer."""
from __future__ import annotations

from dataclasses import asdict, replace
import unicodedata

from core.domain.world import World
from core.domain.players import Player, ATTRIBUTE_NAMES
from core.domain.matches import Match
from core.world.estimates import estimate_potential
from core.ai.market import market_value
from core.world.calendar import standings
from core.world.finances import financial_season
from core.world.cups import ROUND_NAMES


def normalized(value: str) -> str:
    return "".join(character for character in unicodedata.normalize("NFKD", value.casefold()) if not unicodedata.combining(character))


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
            "potential_estimate": asdict(estimate_potential(player, world.date, world.seed, world.config)),
            "nationalities": list(player.nationalities),
            "nationality_names": [world.nation_names.get(code, code) for code in player.nationalities],
            "value": market_value(player, world),
            "club": club_ref(world, player.club_id), "wage": contract.weekly_wage if contract else 0,
            "contract_end": contract.end.iso() if contract else None,
            "expiring": bool(contract and world.date.months_until(contract.end) < 12),
            "fitness": player.fitness, "injured_until": player.injury.end.iso() if player.injury else None,
            "suspension": max((item.suspended_matches for item in player.discipline.values()), default=0),
            "goals": player.season_goals, "assists": player.season_assists,
            "appearances": player.appearances, "minutes": round(player.season_minutes),
            "average": round(player.rating_sum / player.rating_count, 2) if player.rating_count else None}


def player_detail(world: World, player: Player) -> dict:
    result = player_row(world, player)
    result.update({"born": player.born.iso(),
                   "secondary_positions": list(player.secondary_positions), "attributes": dict(zip(ATTRIBUTE_NAMES, player.attributes.values)),
                   "attributes_imported": player.source_current_ability is not None,
                   "position_ratings": player.position_ratings,
                   "potential_estimate": asdict(estimate_potential(player, world.date, world.seed, world.config)),
                   "form": player.form, "morale": player.morale, "value": market_value(player, world),
                   "discipline": [{"competition": world.competitions[cid].name, **asdict(item)} for cid, item in player.discipline.items()]})
    return result


def match_row(world: World, match: Match) -> dict:
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
    european_places = sum(world.european_quotas.get(competition.nation, (0, 0, 0))) if competition.level == 1 else 0
    return [{**asdict(row), "club": club_ref(world, row.club_id), "difference": row.difference, "rank": index + 1, "form": row.form[-5:],
             "movement": ("champion" if competition.level == 1 and index == 0 else
                          "europe" if competition.level == 1 and index < european_places else
                          "promotion" if competition.level > 1 and index < count else
                          "relegation" if index >= len(competition.club_ids) - count else None)}
            for index, row in enumerate(standings(competition, matches, world.config))]


def club_detail(world: World, club_id: int) -> dict:
    club = world.clubs[club_id]
    standing = next((row for row in table(world, club.competition_id) if row["club_id"] == club.id), None) if club.competition_id else None
    return {"id": club.id, "name": club.name, "nation_code": club.nation, "nation": world.nation_names.get(club.nation, club.nation),
            "competition_id": club.competition_id, "competition": world.competitions[club.competition_id].name if club.competition_id else None,
            "active": club.competition_id is not None, "capacity": club.capacity, "reputation": round(club.reputation, 1),
            "academy": round(club.academy, 1), "training_facilities": club.training_facilities,
            "youth_recruitment": club.youth_recruitment,
            "formation": club.formation, "squad_size": len(club.player_ids), "standing": standing,
            "major_color": club.home_kit_major_color, "minor_color": club.home_kit_minor_color,
            "third_color": club.home_kit_third_color}


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
        return {"id": row.player_id, "name": player_name(world, row.player_id), "age": snapshot.born.age_on(row.date),
                "position": snapshot.position, "nationalities": snapshot.nationalities,
                "nationality_names": [world.nation_names.get(code, code) for code in snapshot.nationalities],
                "rating": snapshot.rating, "potential_estimate": {"lower": snapshot.potential_lower, "upper": snapshot.potential_upper},
                "wage": snapshot.weekly_wage, "value": snapshot.value, "contract_end": snapshot.contract_end.iso() if snapshot.contract_end else None,
                "club": club_ref(world, row.target_id), "fitness": snapshot.fitness, "data_at": "promotion"}
    if row.player_id in world.players:
        return {**player_row(world, world.players[row.player_id]), "data_at": "current"}
    return {"id": row.player_id, "name": player_name(world, row.player_id), "nationalities": [], "data_at": "unknown"}


def squad_rows(world: World, club_id: int) -> list[dict]:
    rows = {pid: player_row(world, world.players[pid]) for pid in world.clubs[club_id].player_ids}
    for row in rows.values():
        row.update(appearances=0, minutes=0, goals=0, assists=0, yellows=0, reds=0, average=0, rating_sum=0, rating_count=0)
    for record in world.records.values():
        if record.season != world.season or record.club_id != club_id or record.player_id not in rows: continue
        row = rows[record.player_id]
        row['appearances'] += record.matches
        for key in ('minutes', 'goals', 'assists', 'yellows', 'reds', 'rating_sum', 'rating_count'):
            row[key] += getattr(record, key)
    for row in rows.values():
        row['average'] = round(row.pop('rating_sum') / max(1, row.pop('rating_count')), 2)
        row['minutes'] = round(row['minutes'])
    return list(rows.values())


def career(world: World, player_id: int) -> dict:
    player_records = [row for row in world.records.values() if row.player_id == player_id]
    rows = {}
    for record in player_records:
        key = (record.season, record.club_id)
        rows.setdefault(key, {"season": record.season, "club": club_ref(world, record.club_id),
                             "competitions": [], "matches": 0, "goals": 0, "assists": 0,
                             "rating_sum": 0, "rating_count": 0})
        row = rows[key]
        name = world.competitions[record.competition_id].name
        if name not in row["competitions"]:
            row["competitions"].append(name)
        for field in ("matches", "goals", "assists", "rating_sum", "rating_count"):
            row[field] += getattr(record, field)
    for row in rows.values():
        row["competition"] = " · ".join(row.pop("competitions"))
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
        club = world.clubs.get(club_id)
        rows[key] = {"season": season, "club": club_ref(world, club_id),
                     "competition": world.competitions[club.competition_id].name if club and club.competition_id else None,
                     "matches": 0, "goals": 0, "assists": 0, "average": None}
    items = [{**rows[key], "fee": fees.get(key)} for key in sorted(rows, key=lambda key: (key[0], order.get(key, (-1, False))), reverse=True)]
    rating_count = sum(row.rating_count for row in player_records)
    totals = {"fee": sum(fees.values()), "matches": sum(row.matches for row in player_records),
              "goals": sum(row.goals for row in player_records), "assists": sum(row.assists for row in player_records),
              "average": round(sum(row.rating_sum for row in player_records) / rating_count, 2) if rating_count else None}
    return {"items": items, "totals": totals}


def match_detail(world: World, match: Match) -> dict:
    data = match_row(world, match)
    data["competition"] = world.competitions[match.competition_id].name
    data["capacity"] = None if match.neutral else world.clubs[match.home_id].capacity
    result = match.result
    if result is None:
        data["result"] = None
        return data
    detail = {"engine": result.engine, "status": result.status, "duration": result.duration,
              "home_stats": asdict(result.home_stats) if result.home_stats else None,
              "away_stats": asdict(result.away_stats) if result.away_stats else None}
    def name(pid):
        return result.temporary_players.get(pid) or player_name(world, pid)
    detail["events"] = [{**asdict(event), "player": name(event.player_id),
                         "secondary": name(event.secondary_id),
                         "temporary": event.player_id in result.temporary_players,
                         "secondary_temporary": event.secondary_id in result.temporary_players} for event in result.events]
    for side in ("home", "away"):
        lineup = getattr(result, f"{side}_lineup")
        bench = getattr(result, f"{side}_bench")
        detail[f"{side}_lineup"] = [{"id": pid, "name": name(pid), "position": position,
                                       "temporary": pid in result.temporary_players,
                                       "stats": asdict(result.player_stats[pid]) if pid in result.player_stats else None}
                                      for pid, position in lineup]
        detail[f"{side}_bench"] = [{"id": pid, "name": name(pid), "temporary": pid in result.temporary_players,
                                      "stats": asdict(result.player_stats[pid]) if pid in result.player_stats else None} for pid in bench]
    data["result"] = detail
    return data
