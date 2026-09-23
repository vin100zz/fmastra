"""Single point of contact between the default AI behavior and the human-controlled club.

Every fork between an automatic decision and a decision awaiting the user calls
`is_human_club`; nothing else compares `club_id == world.controlled_club_id`."""
from core.domain.world import World, JournalEntry


def is_human_club(world: World, club_id: int | None) -> bool:
    return club_id is not None and club_id == world.controlled_club_id


def pending_lineup_match(world: World) -> int | None:
    """The human club's match today with no lineup submitted yet, or None."""
    club_id = world.controlled_club_id
    if club_id is None:
        return None
    for match in world.matches.values():
        if match.result is None and match.date == world.date and club_id in (match.home_id, match.away_id):
            return None if match.id in world.submitted_lineups else match.id
    return None


def record(world: World, kind: str, text: str, club_id: int | None = None,
          player_id: int | None = None, match_id: int | None = None) -> None:
    """Append to the human club's news feed; a no-op for every other club."""
    if is_human_club(world, club_id):
        world.news.append(JournalEntry(world.date, kind, text, club_id, player_id, match_id))
