"""Aggregate durable per-club player records without changing the game."""
from collections import defaultdict
from core.domain.world import World
from .views import club_ref, player_name


def leaders(world: World, competition_id: int, category: str, season: int | None = None) -> list[dict]:
    world.competitions[competition_id]
    season = world.season if season is None else season
    if category == "clean_sheets":
        counts = defaultdict(int)
        for match in world.matches.values():
            if match.season != season or match.competition_id != competition_id or not match.result: continue
            if match.result.away_goals == 0: counts[match.home_id] += 1
            if match.result.home_goals == 0: counts[match.away_id] += 1
        return [{"club": club_ref(world, cid), "value": count} for cid, count in sorted(counts.items(), key=lambda pair: (-pair[1], pair[0]))]
    data = {}
    for row in world.records.values():
        if row.competition_id != competition_id or row.season != season: continue
        item = data.setdefault(row.player_id, {"id": row.player_id, "name": player_name(world, row.player_id), "club": club_ref(world, row.club_id),
                                                "goals": 0, "assists": 0, "yellows": 0, "reds": 0, "rating_sum": 0, "rating_count": 0})
        for key in ("goals", "assists", "yellows", "reds", "rating_sum", "rating_count"): item[key] += getattr(row, key)
    field = {"buteurs": "goals", "passeurs": "assists", "cartons": "yellows", "notes": "rating_sum"}[category]
    for item in data.values(): item["value"] = item[field] / item["rating_count"] if category == "notes" and item["rating_count"] else item[field]
    return sorted((item for item in data.values() if item["value"] > 0), key=lambda item: (-item["value"], item["id"]))
