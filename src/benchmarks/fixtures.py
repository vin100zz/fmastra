"""Synthetic and imported immutable starting points for benchmarks."""
from core.config.model import Config
from core.domain.clubs import Club, ClubPersonality, ClubStatus
from core.domain.date import Date
from core.domain.matches import Lineup, LineupSlot
from core.domain.players import Attributes, ATTRIBUTE_NAMES, Player, Position
from core.domain.world import World
from core.ai.selection import LineupContext, select_lineup


# Calibration sides are average ones: raw `centre` and `cpa` giving crossers and dead-ball takers the reference
# effective quality once tiredness is applied (reference / 0.82), which leaves the calibrated cross and corner rates
# unchanged. Real players average far below a synthetic side's level on these two skills. So they do from the spot (46.5
# among real starters), where only the taker counts: the strikers keep the side's level and take the penalties, which a
# keeper of that level saves as he did before the attribute.
AVERAGE_DELIVERY = {"centre": 54.7, "cpa": 67.7, "penalty": 46.5}


def synthetic_lineup(cfg: Config, club_id: int, formation: str = "4-3-3", level: float = 70,
                     delivery: dict[str, float] | None = None) -> Lineup:
    """Every attribute at `level`, except those named in `delivery`; a striker keeps his `penalty` at `level`, to take
    them. The rating stays the level."""
    players = []
    positions = list(cfg.formations.formations[formation])
    for index, source in enumerate(positions + positions[:cfg.world.match_rules.bench_size]):
        position = Position(source)
        named = {key: value for key, value in (delivery or {}).items() if key != "penalty" or position != Position.STRIKER}
        player = Player(club_id * 100 + index, f"Player {club_id}-{index}", "Player", str(index), ("FRA",),
                        Date(2000, 1, 1), position, {item: 1.0 for item in Position},
                        Attributes(tuple(named.get(name, level) for name in ATTRIBUTE_NAMES)), level, level,
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
        return synthetic_lineup(world.config, synthetic_id, delivery=AVERAGE_DELIVERY)
    entity = world.clubs[club]
    return select_lineup(LineupContext.from_world(world, entity.id, entity.competition_id, world.date), world.config)
