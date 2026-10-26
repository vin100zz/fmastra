"""Each club of the AI plays the formation its first team fills best, chosen again when that first team changes."""
from core.ai.formation import best_formation
from core.domain.clubs import Club
from core.domain.world import NewsLine, World
from .events import FormationChosen
from .human import is_human_club, report


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
        # A new world or an older save chooses every formation at once: the human club hears of none of them.
        events.append(FormationChosen(club.id, formation, ids, notify=margin))
    return events


def next_opponent(world: World, club_id: int) -> int | None:
    """The club a club plays next, in any competition."""
    upcoming = min((match for match in world.matches.values() if match.result is None and club_id in (match.home_id, match.away_id)
                    and match.date >= world.date), key=lambda match: (match.date.ordinal(), match.id), default=None)
    if upcoming is None: return None
    return upcoming.away_id if upcoming.home_id == club_id else upcoming.home_id


def formation_notice(world: World, club: Club, formation: str) -> None:
    """Tells the human club that its next opponent, or a club of its league, changes formation: one line per club, the
    formation it plays in `text` and the one it left in `key`."""
    human = world.controlled_club_id
    if human is None or club.id == human or formation == club.formation or club.formation not in world.config.formations.formations: return
    league = world.clubs[human].competition_id
    if (league is None or club.competition_id != league) and next_opponent(world, human) != club.id: return
    report(world, "formation_change", NewsLine(club_id=club.id, text=formation, key=club.formation), human)
