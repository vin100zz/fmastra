"""Single point of contact between the default AI behavior and the human-controlled club.

Every fork between an automatic decision and a decision awaiting the user calls
`is_human_club`; what the user is told, and the lineup he submitted, follow his club
through `is_controlled_club`, whoever decides for it. Nothing else compares
`club_id == world.controlled_club_id`."""
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar

from core.domain.world import World, NewsItem, NewsLine

# Set for the days Auto mode plays: the AI runs the human club as any other (see `ai_in_charge`).
_ai_in_charge: ContextVar[bool] = ContextVar("ai_in_charge", default=False)


@contextmanager
def ai_in_charge() -> Iterator[None]:
    """The days played inside it leave the human club's decisions to the AI, as for any other club: its contracts, its
    transfers, its loans and its reserve. His transfer list and the players he declared not for sale wait for him
    to take the club back. His news feed still tells him what happens to it."""
    token = _ai_in_charge.set(True)
    try:
        yield
    finally:
        _ai_in_charge.reset(token)


def is_controlled_club(world: World, club_id: int | None) -> bool:
    """Whether a club is the one the user plays, even while the AI decides for it."""
    return club_id is not None and club_id == world.controlled_club_id


def is_human_club(world: World, club_id: int | None) -> bool:
    """Whether a club's decisions are the user's: his club, unless the AI is in charge of it (see `ai_in_charge`)."""
    return is_controlled_club(world, club_id) and not _ai_in_charge.get()


def listed_price(world: World, player_id: int) -> int | None:
    """The fee the human club asks for a player on its transfer list, or None."""
    player = world.players.get(player_id)
    return world.transfer_list.get(player_id) if player is not None and is_human_club(world, player.club_id) else None


def on_sale(world: World, player_id: int) -> bool:
    """Whether the human club let a player know it would sell him: on its transfer list, or offered to clubs lately."""
    if listed_price(world, player_id) is not None: return True
    until, player = world.offered_until.get(player_id), world.players.get(player_id)
    return until is not None and until > world.date and player is not None and is_human_club(world, player.club_id)


def untouchable(world: World, player_id: int) -> bool:
    """Whether the human club declared one of its players not for sale (see `core.world.sales.set_untouchable`)."""
    player = world.players.get(player_id)
    return player_id in world.not_for_sale and player is not None and is_human_club(world, player.club_id)


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
          player_id: int | None = None, match_id: int | None = None, lines: tuple[NewsLine, ...] = ()) -> NewsItem | None:
    """Append to the human club's news feed; a no-op for every other club. `lines` name who the sentence speaks of
    beside its player: the pages link them."""
    if not is_controlled_club(world, club_id): return None
    item = NewsItem(world.date, kind, text, club_id, player_id, match_id, lines=list(lines))
    world.news.append(item)
    return item


def report(world: World, kind: str, line: NewsLine, club_id: int | None, player_id: int | None = None,
          match_id: int | None = None, text: str = "") -> NewsItem | None:
    """A line of the human club's feed: it joins today's message of the same kind, about the same player and the same
    match, or opens one (`text` tells apart two messages of a kind, see `core.world.news`). A message that gains a
    line is to be read again."""
    if not is_controlled_club(world, club_id): return None
    for item in reversed(world.news):
        if item.date != world.date: break
        if (item.kind, item.player_id, item.match_id, item.text) == (kind, player_id, match_id, text) and item.lines:
            item.lines.append(line)
            item.read = False
            return item
    return record(world, kind, text, club_id, player_id, match_id, (line,))
