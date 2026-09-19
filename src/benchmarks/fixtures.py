"""Synthetic and imported immutable starting points for benchmarks."""
from core.config.model import Config
from core.domain.clubs import Club, ClubPersonality, ClubStatus
from core.domain.date import Date
from core.domain.matches import Lineup, LineupSlot
from core.domain.players import Attributes, ATTRIBUTE_NAMES, Player, Position
from core.domain.world import World
from core.ai.selection import LineupContext, select_lineup


def synthetic_lineup(cfg: Config, club_id: int, formation: str = "4-3-3", level: float = 70) -> Lineup:
    players = []
    positions = list(cfg.formations.formations[formation])
    for index, source in enumerate(positions + positions[:cfg.world.match_rules.bench_size]):
        position = Position(source)
        player = Player(club_id * 100 + index, f"Player {club_id}-{index}", "Player", str(index), ("FRA",),
                        Date(2000, 1, 1), position, {item: 1.0 for item in Position},
                        Attributes(tuple(level for _ in ATTRIBUTE_NAMES)), level, level,
                        cfg.states.fitness.initial, cfg.states.form.initial,
                        (cfg.states.moral.min + cfg.states.moral.max) / 2, cfg.states.injuries.fragility_min,
                        0, club_id, None)
        players.append(player)
    size = cfg.world.match_rules.players_on_pitch
    return Lineup(club_id, formation, [LineupSlot(player, Position(role)) for player, role in zip(players, positions)], players[size:])


def fixture_lineup(world: World, club: int | str, synthetic_id: int) -> Lineup:
    if isinstance(club, str):
        if club != "__NIVEAU_70__":
            raise ValueError(f"Unknown synthetic fixture: {club}")
        return synthetic_lineup(world.config, synthetic_id)
    entity = world.clubs[club]
    return select_lineup(LineupContext.from_world(world, entity.id, entity.competition_id, world.date), world.config)
