"""The human club's news feed beyond plain sentences: the messages that wait for an answer, and the notices the
calendar brings (transfer windows, contracts running out, unhappy players, the review of the season).

A message of one of these kinds has no sentence of its own: the pages write it from its lines (see `NewsLine`).

- `offer_received`, about a player: one line per offer, `key` the offer, `club_id` the buyer, `amount` the fee and
  `state` its answer: PENDING, then "accepted", "refused", "declined" for an accepted fee the player did not pick, or
  "raised" once the buyer has offered more (the higher offer has a line of its own, in the message of its day);
  `text` is "raised" for an offer that was lower when it was first made.
- `renewal_proposed`, about a player: the contract he has (`text` "current") then the one he asks for ("asked"), each
  with `amount` its weekly wage and `until` its end; the `state` of the asked one is the answer.
- `injury`, `injury_end`, `suspension`, `release`, `retirement`, `academy`, `loan_return`: one line per player,
  `until` the end of an injury, `amount` the matches of a suspension.
- `call_up`: one line per player, `text` the national team and `key` its id.
- `morale`: one line per player whose morale fell under the alert, `text` what weighs on him and `amount` his morale
  out of 100.
- `contract_expiry` (its `text` the months left): one line per player, `amount` his weekly wage, `until` the end.
- `market_open`, `market_close` (their `text` the window): `text` "budget" and "wages" with their `amount`, "end"
  with the last day in `until`, then "talks" and "offers" naming the players still being negotiated.
- `market_recap` (its `text` the window): one line per transfer, `text` where it counts among the main ones: "league",
  with the division of the human club in `competition_id`, or "world". `club_id` is the club the player joined and
  `key` the one he left, `amount` the fee; a free player (`state` "free") left none, and `amount` is his level out of 200.
- `cup_draw`: one line per match a cup (`competition_id`) drew for the human club, in one message: the match of a
  round, the two legs of a European tie, or every match of a European league phase. `match_id` is the match,
  `club_id` its opponent, `amount` the round, `until` the day and `text` where it plays: "home", "away" or "neutral".
- `season_review`: one line per competition the club played (`amount` its rank and `text` its points in a league,
  `match_id` its last match and `state` "won" in a cup, `club_id` the winner), `text` "europe" with the cup it
  reaches, `text` "scorer" and "rating" with the player and the goals or a hundred times the average rating.
"""
from __future__ import annotations

from collections import defaultdict

from core.domain.clubs import Club
from core.domain.date import Date
from core.domain.offers import TransferOffer, WAGE_TALKS
from core.domain.players import Contract, Player
from core.domain.world import NewsItem, NewsLine, World, history_level
from .calendar import standings
from .europe import association, league_places, resolve_european_quotas
from .human import is_human_club, record, report

PENDING = "pending"
# The months left on a contract when the club is told it runs out.
EXPIRY_NOTICES = (6, 1)
# The day the season is reviewed: every competition has ended, the summer window is about to open.
REVIEW_DAY = (6, 1)
# The transfers the recap of a window names, in the division of the human club as in the world: those of the highest
# fees, then the free players of the highest levels.
RECAP_FEES, RECAP_FREE = 5, 3


def offer_received(world: World, offer: TransferOffer) -> None:
    """An offer for a player of the human club now awaits its answer: the offers of a day for him make one message."""
    report(world, "offer_received", NewsLine(club_id=offer.target_id, amount=offer.fee, state=PENDING, key=offer.key,
                                             text="raised" if offer.countered else ""), offer.source_id, offer.player_id)


def answer_offer(world: World, key: str, state: str, amount: int | None = None) -> None:
    """The answer given to an offer, on the last line that told it; `amount` when the fee agreed is not the one it told."""
    for item in reversed(world.news):
        for line in reversed(item.lines):
            if item.kind == "offer_received" and line.key == key:
                line.state = state
                if amount is not None: line.amount = amount
                return


def renewal_lines(current: Contract, asked: Contract) -> tuple[NewsLine, NewsLine]:
    """The contract a player has, then the one he asks for, as his demand keeps them."""
    return (NewsLine(amount=current.weekly_wage, until=current.end, text="current"),
            NewsLine(amount=asked.weekly_wage, until=asked.end, text="asked", state=PENDING))


def answer_renewal(world: World, player_id: int, state: str, current: Contract) -> None:
    """The answer to the contract a player is asking for, on the message that told it; `current` is the contract he
    had when it was given. A demand told before messages had lines receives them now, so that it keeps its terms."""
    proposal = world.pending_renewals.get(player_id)
    if proposal is None: return
    for item in reversed(world.news):
        if (item.kind, item.player_id, item.date) == ("renewal_proposed", player_id, proposal.created):
            if not item.lines: item.lines = list(renewal_lines(current, proposal.contract))
            item.lines[-1].state = state
            return


def awaits_answer(world: World, item: NewsItem) -> bool:
    """Whether a message still asks the human club for a decision: an offer to accept or refuse, a contract a player
    asked for, a wage to agree with a player whose club accepted the fee. What was settled elsewhere, or lapsed,
    no longer does."""
    if item.kind == "offer_received":
        return any(line.state == PENDING and (offer := world.offers.get(line.key)) is not None and offer.awaiting_review
                   for line in item.lines)
    if item.kind == "renewal_proposed":
        proposal, player = world.pending_renewals.get(item.player_id), world.players.get(item.player_id)
        if proposal is None or proposal.created != item.date or not is_human_club(world, proposal.club_id): return False
        if player is None or not brings_something(proposal.contract, player.contract): return False
        return not item.lines or item.lines[-1].state == PENDING
    if item.kind == "talks_open":
        talks = world.offers.get(f"talks:{world.controlled_club_id}:{item.player_id}")
        return talks is not None and talks.stage == WAGE_TALKS and talks.created <= item.date
    return False


def brings_something(asked: Contract, current: Contract | None) -> bool:
    """Whether a contract a player asked for still gives him a raise or more years than the one he has."""
    return current is not None and (asked.weekly_wage > current.weekly_wage or asked.end > current.end)


def own_players(world: World, club: Club) -> list[Player]:
    """The players under contract with a club: its squad without those it borrowed, and those it lent."""
    return [player for pid in (*club.player_ids, *club.loaned_ids) if (player := world.players[pid]).owner_id == club.id]


def morale_levels(world: World) -> dict[int, float]:
    """The morale of the human club's players, before the week revises it."""
    club = world.clubs.get(world.controlled_club_id)
    return {} if club is None else {pid: world.players[pid].morale for pid in club.player_ids}


def morale_alerts(world: World, before: dict[int, float]) -> None:
    """Tells the human club which of its players' morale just fell to the level where a player accepts any way out,
    with what weighs most on him: his wage, his minutes, the reserve he is left in, or a club beneath him."""
    from .contracts import contentment, games_by_club, morale_cause, position_ranks
    from .reserves import in_reserve
    from .transfer_rules import season_arrivals
    club = world.clubs.get(world.controlled_club_id)
    if club is None: return
    alert = world.config.management.market.forced_exit_morale
    fallen = [world.players[pid] for pid in club.player_ids
              if pid in before and before[pid] > alert >= world.players[pid].morale]
    if not fallen: return
    ranks, games, arrivals = position_ranks(world, club), games_by_club(world)[club.id], season_arrivals(world, club.id)
    for player in fallen:
        mood = contentment(world, player, club, ranks[player.id], *arrivals.get(player.id, (games, player.season_minutes)))
        cause = morale_cause(world, mood) or ""
        if cause == "temps_de_jeu" and in_reserve(player): cause = "reserve"
        report(world, "morale", NewsLine(player_id=player.id, amount=round(player.morale * 100), text=cause), club.id)


def expiry_notices(world: World, club: Club) -> None:
    yesterday = world.date.add_days(-1)
    for player in own_players(world, club):
        end = player.contract.end
        for months in EXPIRY_NOTICES:
            if yesterday.months_until(end) > months >= world.date.months_until(end):
                report(world, "contract_expiry", NewsLine(player_id=player.id, amount=player.contract.weekly_wage, until=end),
                       club.id, text=str(months))


def market_recap(world: World, club: Club, name: str, start: Date, end: Date) -> None:
    """The main transfers of the window `name`, from `start` to `end`: in the division of the human club (a player
    who joined or left one of its clubs), then in the whole world."""
    moves = [move for move in world.transfers if move.kind == "transfer" and start <= move.date <= end and move.player_id in world.players]
    level = lambda move: history_level(world.players[move.player_id].rating)
    paid = sorted((move for move in moves if move.fee), key=lambda move: (-move.fee, move.date, move.player_id))
    free = sorted((move for move in moves if move.source_id is None), key=lambda move: (-level(move), move.date, move.player_id))
    league = club.competition_id
    plays = lambda club_id: club_id in world.clubs and world.clubs[club_id].competition_id == league
    lines = []
    for scope in ("league", "world") if league is not None else ("world",):
        for ranked, count in ((paid, RECAP_FEES), (free, RECAP_FREE)):
            told = [move for move in ranked if scope == "world" or plays(move.source_id) or plays(move.target_id)]
            lines.extend(NewsLine(text=scope, competition_id=league if scope == "league" else None, player_id=move.player_id,
                                  club_id=move.target_id, key="" if move.source_id is None else str(move.source_id),
                                  amount=move.fee or level(move), state="" if move.fee else "free") for move in told[:count])
    if lines: record(world, "market_recap", name, club.id, lines=tuple(lines))


def market_notices(world: World, club: Club) -> None:
    """The day a transfer window opens, and the eve of its last day: what the club can spend, and what is still open.
    The day after its last day: its main transfers."""
    today, tomorrow, yesterday = (world.date.month, world.date.day), world.date.add_days(1), world.date.add_days(-1)
    reserved = sum(offer.ceiling for offer in world.offers.values() if offer.target_id == club.id)
    budget = NewsLine(text="budget", amount=max(0, club.transfer_budget - reserved))
    for name in ("summer", "winter"):
        window = getattr(world.config.world.market, name)
        if today == (window.start_month, window.start_day):
            end = Date(world.date.year, window.end_month, window.end_day)
            record(world, "market_open", name, club.id, lines=(budget, NewsLine(text="wages", amount=club.wage_cap - club.wage_bill),
                                                              NewsLine(text="end", until=end)))
        if (tomorrow.month, tomorrow.day) == (window.end_month, window.end_day):
            bought = dict.fromkeys(offer.player_id for offer in world.offers.values() if offer.target_id == club.id)
            sold = dict.fromkeys(offer.player_id for offer in world.offers.values() if offer.source_id == club.id and offer.awaiting_review)
            record(world, "market_close", name, club.id, lines=(budget, *(NewsLine(text="talks", player_id=pid) for pid in bought),
                                                               *(NewsLine(text="offers", player_id=pid) for pid in sold)))
        if (yesterday.month, yesterday.day) == (window.end_month, window.end_day):
            market_recap(world, club, name, Date(yesterday.year, window.start_month, window.start_day), yesterday)


def draw_notices(world: World, first_id: int = 0) -> None:
    """The opponents the cups drew for the human club, cup by cup: the matches it has yet to play among those created
    since the id `first_id`. A round just played draws the next one; the season that opens draws the first round of
    the national cup and the league phase of the European cups; a club just chosen is told all that awaits it."""
    club = world.clubs.get(world.controlled_club_id)
    if club is None or world.next_id == first_id: return
    for cup in world.competitions.values():
        if cup.kind not in ("cup", "europe"): continue
        drawn = sorted((match for mid in cup.match_ids if mid >= first_id and (match := world.matches[mid]).result is None
                        and club.id in (match.home_id, match.away_id)), key=lambda match: (match.date, match.id))
        if not drawn: continue
        record(world, "cup_draw", "", club.id, lines=tuple(
            NewsLine(competition_id=cup.id, club_id=match.away_id if match.home_id == club.id else match.home_id, match_id=match.id,
                     amount=match.round_number, until=match.date,
                     text="neutral" if match.neutral else "home" if match.home_id == club.id else "away") for match in drawn))


def season_review(world: World, club: Club) -> None:
    """How the season went for the human club: each competition it played with its winner, the European cup its league
    rank earns it, its top scorer and its best-rated player."""
    lines = []
    league = world.competitions.get(club.competition_id)
    nation = association(world, club.id)
    champion = lambda competition: next((cid for year, cid in world.champions.get(competition.id, []) if year == world.season), None)
    if league is not None:
        table = standings(league, [world.matches[mid] for mid in league.match_ids], world.config)
        rank = next(index for index, row in enumerate(table) if row.club_id == club.id)
        lines.append(NewsLine(competition_id=league.id, club_id=table[0].club_id, amount=rank + 1, text=str(table[rank].points)))
    cups = sorted((c for c in world.competitions.values() if c.kind == "europe" or (c.kind == "cup" and c.nation == nation)),
                  key=lambda c: (c.kind == "europe", c.code or "", c.id))
    for cup in cups:
        played = [match for mid in cup.match_ids if club.id in ((match := world.matches[mid]).home_id, match.away_id) and match.result]
        if not played: continue
        last, winner = max(played, key=lambda match: (match.date, match.id)), champion(cup)
        lines.append(NewsLine(competition_id=cup.id, club_id=winner, match_id=last.id, state="won" if winner == club.id else ""))
    if league is not None and league.level == 1 and nation in world.european_quota_ranges:
        cup = next((c for c in cups if c.kind == "cup"), None)
        winner = champion(cup) if cup is not None else None
        ranked = [row.club_id for row in table if not world.clubs[row.club_id].is_reserve]
        places = league_places(ranked, winner, resolve_european_quotas(world, world.season + 1)[nation])
        tier = next((index for index, clubs in enumerate(places) if club.id in clubs), None)
        # Without the cup winner, only the places of the first cup are certain.
        if tier is not None and (winner is not None or tier == 0):
            european = sorted((c for c in cups if c.kind == "europe"), key=lambda c: c.code)
            if tier < len(european): lines.append(NewsLine(text="europe", competition_id=european[tier].id))
    goals, ratings = defaultdict(int), defaultdict(lambda: [0.0, 0])
    for row in world.records.values():
        if row.season != world.season or row.club_id != club.id or row.player_id not in world.players: continue
        goals[row.player_id] += row.goals
        ratings[row.player_id][0] += row.rating_sum
        ratings[row.player_id][1] += row.rating_count
    scorer = max(goals, key=lambda pid: (goals[pid], -pid), default=None)
    if scorer is not None and goals[scorer]: lines.append(NewsLine(text="scorer", player_id=scorer, amount=goals[scorer]))
    # A rating counts once he has been rated in half as many matches as the most rated player of the club.
    most = max((count for _, count in ratings.values()), default=0)
    rated = {pid: total / count for pid, (total, count) in ratings.items() if count and count * 2 >= most}
    best = max(rated, key=lambda pid: (rated[pid], -pid), default=None)
    if best is not None: lines.append(NewsLine(text="rating", player_id=best, amount=round(rated[best] * 100)))
    if lines: record(world, "season_review", "", club.id, lines=tuple(lines))


def daily_notices(world: World) -> None:
    """What the calendar tells the human club this morning."""
    club = world.clubs.get(world.controlled_club_id)
    if club is None: return
    market_notices(world, club)
    expiry_notices(world, club)
    if (world.date.month, world.date.day) == REVIEW_DAY: season_review(world, club)
