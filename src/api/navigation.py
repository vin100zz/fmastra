"""Neighbours and pick lists for stepping between the members of a group; read-only projection."""
from core.domain.world import World
from . import views as v

COMPETITION_KINDS = {"league": 0, "cup": 1, "europe": 2}


def navigation(items: list[dict], current_id: int, scope: dict) -> dict:
    """`items` is the whole group in display order; the ends have no previous or next."""
    index = next(position for position, item in enumerate(items) if item["id"] == current_id)
    return {"scope": scope, "index": index, "total": len(items), "items": items,
            "previous": items[index - 1] if index > 0 else None,
            "next": items[index + 1] if index + 1 < len(items) else None}


def club_navigation(world: World, club_id: int) -> dict:
    """The clubs of the same division, or of the same country when the club plays in none."""
    club = world.clubs[club_id]
    if club.competition_id is not None:
        members = [item for item in world.clubs.values() if item.competition_id == club.competition_id]
        scope = {"kind": "division", "id": club.competition_id, "name": world.competitions[club.competition_id].name}
    else:
        members = [item for item in world.clubs.values() if item.nation == club.nation]
        scope = {"kind": "country", "code": club.nation, "name": world.nation_names.get(club.nation, club.nation)}
    members.sort(key=lambda item: (v.normalized(item.name), item.id))
    # The squad size tells apart the homonyms of the source data (a club and its empty duplicate).
    return navigation([{"id": item.id, "name": item.name, "squad": len(item.player_ids)} for item in members], club_id, scope)


def player_navigation(world: World, player_id: int) -> dict | None:
    """The squad of the player's club, goalkeepers first as in the squad table; none for retirees and free agents."""
    if player_id in world.retired:
        return None
    club = world.clubs.get(world.players[player_id].club_id)
    if club is None:
        return None
    squad = sorted((world.players[pid] for pid in club.player_ids),
                   key=lambda item: (v.position_rank(item.position.value), v.normalized(item.name), item.id))
    return navigation([{"id": item.id, "name": item.name, "position": item.position.value} for item in squad],
                      player_id, {"kind": "club", "id": club.id, "name": club.name})


def nation_navigation(world: World, nation_id: int) -> dict:
    """The nations of the same confederation, alphabetically."""
    team = world.international.nations[nation_id]
    members = [item for item in world.international.nations.values() if item.federation == team.federation]
    members.sort(key=lambda item: (v.normalized(item.name), item.id))
    return navigation([{"id": item.id, "name": item.name} for item in members], nation_id,
                      {"kind": "federation", "name": team.federation})


def competition_navigation(world: World, competition_id: int) -> dict:
    """The competitions of the same country: divisions from the top down, then the cup."""
    competition = world.competitions[competition_id]
    members = sorted((item for item in world.competitions.values() if item.nation == competition.nation),
                     key=lambda item: (COMPETITION_KINDS.get(item.kind, len(COMPETITION_KINDS)), item.level, item.code or "", item.id))
    return navigation([{"id": item.id, "name": item.name, "kind": item.kind} for item in members], competition_id,
                      {"kind": "country", "code": competition.nation, "name": world.nation_names.get(competition.nation, competition.nation)})
