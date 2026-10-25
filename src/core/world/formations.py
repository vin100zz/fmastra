"""Each club of the AI plays the formation its first team fills best, chosen again when that first team changes."""
from core.ai.formation import best_formation
from core.domain.clubs import Club
from core.domain.world import World
from .events import FormationChosen
from .human import is_human_club


def _squad_ids(world: World, club: Club, today: int, days: int) -> tuple[int, ...]:
    """The players a club's formation is chosen for, by id: its first team, its borrowed players with it, neither the
    reserve nor those injured for longer than `formations.choix.blessure_longue_jours` (`days`)."""
    return tuple(sorted(pid for pid in club.player_ids if (player := world.players[pid]).reserve_since is None
                        and (player.injury is None or player.injury.end.ordinal() - today <= days)))


def formation_events(world: World, margin: bool = True) -> list[FormationChosen]:
    """The clubs of the AI whose first team changed since their formation was chosen, each with the formation it fills
    best; without `margin`, every club of the AI, whatever it played before. The human club chooses its own."""
    today, days = world.date.ordinal(), world.config.formations.choice.long_injury_days
    events = []
    for club in sorted(world.clubs.values(), key=lambda item: item.id):
        if is_human_club(world, club.id): continue
        ids = _squad_ids(world, club, today, days)
        if margin and ids == club.formation_squad: continue
        formation = best_formation([world.players[pid] for pid in ids], world.config, club.formation if margin else None)
        events.append(FormationChosen(club.id, formation, ids))
    return events
