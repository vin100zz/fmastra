"""Winners of every competition across the archived seasons; read-only projection."""
from core.domain.clubs import Competition
from core.domain.world import World
from . import views as v
from .navigation import COMPETITION_KINDS


def honours_block(world: World, competition: Competition) -> dict:
    """One competition and its champions, the latest season first."""
    return {"id": competition.id, "name": competition.name, "kind": competition.kind, "level": competition.level,
            "code": competition.code,
            "items": [{"season": year, "champion": v.club_ref(world, winner)}
                      for year, winner in reversed(world.champions.get(competition.id, []))]}


def honours(world: World) -> dict:
    """The European cups, then each country: its divisions from the top down, then its cup."""
    europe = sorted((item for item in world.competitions.values() if item.kind == "europe"), key=lambda item: (item.code or "", item.id))
    nations: dict[str, list[Competition]] = {}
    for competition in world.competitions.values():
        if competition.kind != "europe":
            nations.setdefault(competition.nation, []).append(competition)
    return {"europe": [honours_block(world, item) for item in europe],
            "countries": [{"code": code, "name": world.nation_names.get(code, code),
                           "competitions": [honours_block(world, item) for item in sorted(
                               members, key=lambda item: (COMPETITION_KINDS.get(item.kind, len(COMPETITION_KINDS)), item.level, item.code or "", item.id))]}
                          for code, members in sorted(nations.items())]}
