"""Public read models; true potential and simulation RNGs never leave this layer."""
from __future__ import annotations

from dataclasses import asdict
import unicodedata

from core.domain.world import World
from core.domain.players import Player, ATTRIBUTE_NAMES
from core.domain.matches import Match
from core.world.estimates import estimate_potential
from core.ai.market import market_value
from core.world.calendar import standings
from core.world.finances import financial_season


def normalized(value: str) -> str:
    return "".join(character for character in unicodedata.normalize("NFKD", value.casefold()) if not unicodedata.combining(character))


def paginate(items: list, page: int, size: int = 30) -> dict:
    return {"items": items[(page - 1) * size:page * size], "total": len(items), "page": page, "page_size": size}


def club_ref(world: World, club_id: int | None) -> dict | None:
    club = world.clubs.get(club_id)
    return {"id": club.id, "name": club.name} if club else None


def player_name(world: World, player_id: int | None) -> str | None:
    player = world.players.get(player_id)
    return player.name if player else world.retired.get(player_id)


def player_row(world: World, player: Player) -> dict:
    contract = player.contract
    return {"id": player.id, "name": player.name, "position": player.position.value,
            "age": player.born.age_on(world.date), "nation": player.nation, "rating": round(player.rating, 1),
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
    result.update({"born": player.born.iso(), "nationalities": [world.nation_names.get(nation, nation) for nation in player.nationalities],
                   "secondary_positions": list(player.secondary_positions), "attributes": dict(zip(ATTRIBUTE_NAMES, player.attributes.values)),
                   "attributes_imported": player.source_current_ability is not None,
                   "position_ratings": player.position_ratings,
                   "potential_estimate": asdict(estimate_potential(player, world.date, world.seed, world.config)),
                   "form": player.form, "morale": player.morale, "value": market_value(player, world),
                   "discipline": [{"competition": world.competitions[cid].name, **asdict(item)} for cid, item in player.discipline.items()]})
    return result


def match_row(world: World, match: Match) -> dict:
    return {"id": match.id, "date": match.date.iso(), "round": match.round_number,
            "season": match.season, "competition_id": match.competition_id,
            "home": club_ref(world, match.home_id), "away": club_ref(world, match.away_id),
            "score": [match.result.home_goals, match.result.away_goals] if match.result else None}


def table(world: World, competition_id: int) -> list[dict]:
    competition = world.competitions[competition_id]
    return [{**asdict(row), "club": club_ref(world, row.club_id), "difference": row.difference, "rank": index + 1, "form": row.form[-5:]}
            for index, row in enumerate(standings(competition, [world.matches[mid] for mid in competition.match_ids], world.config))]


def club_detail(world: World, club_id: int) -> dict:
    club = world.clubs[club_id]
    standing = next((row for row in table(world, club.competition_id) if row["club_id"] == club.id), None) if club.competition_id else None
    return {"id": club.id, "name": club.name, "nation": world.nation_names.get(club.nation, club.nation),
            "competition_id": club.competition_id, "competition": world.competitions[club.competition_id].name if club.competition_id else None,
            "active": club.competition_id is not None, "capacity": club.capacity, "reputation": round(club.reputation, 1),
            "academy": round(club.academy, 1), "training_facilities": club.training_facilities,
            "youth_recruitment": club.youth_recruitment,
            "formation": club.formation, "squad_size": len(club.player_ids), "standing": standing}


def transfers(world: World, club_id: int | None = None, player_id: int | None = None, season: int | None = None) -> list[dict]:
    rows = [item for item in world.transfers if (club_id is None or club_id in (item.source_id, item.target_id))
            and (player_id is None or item.player_id == player_id)
            and (season is None or (item.season if item.season is not None else financial_season(world, item.date)) == season)]
    return [transfer_row(world, row) for row in reversed(rows)]


def transfer_row(world: World, row) -> dict:
    return {"date": row.date.iso(), "player_id": row.player_id, "player": player_name(world, row.player_id),
            "source": club_ref(world, row.source_id), "target": club_ref(world, row.target_id), "fee": row.fee, "kind": row.kind}


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


def records(world: World, player_id: int) -> list[dict]:
    return [{**asdict(row), "club": club_ref(world, row.club_id), "competition": world.competitions[row.competition_id].name,
             "average": row.rating_sum / row.rating_count if row.rating_count else None}
            for row in sorted(world.records.values(), key=lambda row: (-row.season, row.club_id)) if row.player_id == player_id]


def match_detail(world: World, match: Match) -> dict:
    data = match_row(world, match)
    data["competition"] = world.competitions[match.competition_id].name
    data["capacity"] = world.clubs[match.home_id].capacity
    result = match.result
    if result is None:
        data["result"] = None
        return data
    detail = {"engine": result.engine, "status": result.status, "duration": result.duration,
              "home_stats": asdict(result.home_stats) if result.home_stats else None,
              "away_stats": asdict(result.away_stats) if result.away_stats else None}
    detail["events"] = [{**asdict(event), "player": player_name(world, event.player_id),
                         "secondary": player_name(world, event.secondary_id)} for event in result.events]
    for side in ("home", "away"):
        lineup = getattr(result, f"{side}_lineup")
        bench = getattr(result, f"{side}_bench")
        detail[f"{side}_lineup"] = [{"id": pid, "name": player_name(world, pid), "position": position,
                                       "stats": asdict(result.player_stats[pid]) if pid in result.player_stats else None}
                                      for pid, position in lineup]
        detail[f"{side}_bench"] = [{"id": pid, "name": player_name(world, pid),
                                      "stats": asdict(result.player_stats[pid]) if pid in result.player_stats else None} for pid in bench]
    data["result"] = detail
    return data
