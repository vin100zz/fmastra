"""Fill missing squads when clubs first enter simulated football."""
from collections import Counter

from core.domain.players import Position
from core.domain.world import World
from core.randomness import stream
from .application import apply
from .demography import generate_player
from .events import PlayerGenerated, PlayerReleased


def complete_squads(world: World, club_ids: list[int]) -> int:
    """Keep supplied players, adding academy players only for uncovered minima."""
    guard = world.config.management.guardrails
    generated = 0
    for club_id in sorted(club_ids):
        club = world.clubs[club_id]
        rng = stream(world.seed, "squad-completion", world.date.year, club_id)
        while True:
            squad = [world.players[pid] for pid in club.player_ids]
            positions = Counter(player.position for player in squad)
            missing_keeper = positions[Position.GOALKEEPER] < guard.min_goalkeepers
            if len(squad) >= guard.min_squad and not missing_keeper:
                break
            if len(squad) >= guard.max_squad:
                # A promoted full squad may lack keepers after years outside simulation.
                surplus = min((player for player in squad if player.position != Position.GOALKEEPER),
                              key=lambda player: (player.rating, player.id))
                apply(world, PlayerReleased(surplus.id))
            position = Position.GOALKEEPER if missing_keeper else Position(max(
                world.config.demography.position_targets,
                key=lambda pos: world.config.demography.position_targets[pos] / (positions[pos] + 1)))
            nation = club.nation if world.identity_pool.get(club.nation) else sorted(world.identity_pool)[0]
            player = generate_player(world, world.next_id, club, position, nation, rng)
            if not apply(world, PlayerGenerated(player)):
                raise ValueError(f"{club.name}: cannot fund the minimum squad")
            generated += 1
    return generated
