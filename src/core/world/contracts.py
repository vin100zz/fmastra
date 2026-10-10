"""Weekly renewal decisions and daily contractual expiry."""
from dataclasses import dataclass, replace

from core.domain.clubs import Club
from core.domain.offers import RenewalProposal
from core.domain.players import Contract, Player
from core.domain.world import World
from core.math import clamp
from collections import Counter
from core.ai.market import market_wage, contract_for, nominal_size, squad_quality, wage_room
from .events import PlayerReleased, PlayerSigned, PlayerChanged, RenewalProposed
from .human import is_human_club, listed_price
from .reserves import accepts_reserve, in_reserve
from .transfer_rules import frustration, held_back, recent_arrival_ids, season_arrivals, wants_to_leave


def expiry_events(world: World) -> list[PlayerReleased]:
    return [PlayerReleased(player.id) for player in world.players.values()
            if player.contract is not None and player.contract.end < world.date]


def games_by_club(world: World) -> Counter:
    """The matches each club has played this season."""
    games = Counter()
    for match in world.matches.values():
        if match.result is not None and match.season == world.season:
            games.update((match.home_id, match.away_id))
    return games


def position_ranks(world: World, club: Club) -> dict[int, int]:
    """Each player's rank by level among his club's first-team players of his position, 0 for the best.

    A player in the reserve takes no rank from the others: his own is the one he would have in the first team."""
    ranks, counts = {}, Counter()
    for pid in sorted(club.player_ids, key=lambda pid: (-world.players[pid].rating, pid)):
        player = world.players[pid]
        ranks[pid] = counts[player.position]
        counts[player.position] += not in_reserve(player)
    return ranks


@dataclass(frozen=True, slots=True)
class Contentment:
    """What a player under contract makes of his situation: his wage against the one his value commands, his minutes
    against those his rank at his position promises (each out of 1), what a renewal weighs, how restless a club beneath
    him makes him, the morale he drifts towards each week, and what being held back takes off it."""
    expected_wage: float
    wage: float
    playing_time: float
    satisfaction: float
    frustration: float
    morale_target: float
    held: float = 0.0


def contentment(world: World, player: Player, club: Club, rank: int, games: int, minutes: float) -> Contentment:
    """`games` and `minutes` are the matches his club has played this season and those he played of them: the whole
    season's, or since he came for a player who joined on the way (see `season_arrivals`)."""
    cfg = world.config
    rules = cfg.management.contracts
    expected = market_wage(player, club, cfg)
    salary_satisfaction = min(1, player.contract.weekly_wage / expected)
    expected_share = 1 / (rank + 1)
    expected_minutes = (games if club.competition_id else 0) * cfg.engine.timing.match_seconds / 60 * expected_share
    playing_satisfaction = min(1, minutes / expected_minutes) if expected_minutes else 1
    # The reserve plays no match: a step for a young player who would not start, nothing at all for anyone else.
    if in_reserve(player): playing_satisfaction = 1.0 if accepts_reserve(player, club, rank, world) else 0.0
    satisfaction = rules.wage_weight * salary_satisfaction + rules.playing_time_weight * playing_satisfaction + rules.club_weight * min(1, club.reputation / max(1, player.rating))
    moral = cfg.states.moral
    target = moral.playing_time_weight * playing_satisfaction + moral.contract_weight * salary_satisfaction + moral.results_weight * satisfaction
    # Playing every match and earning a fair wage does not settle a player whose club is beneath him.
    restless = frustration(player, world)
    target -= cfg.management.market.frustration_morale_weight * restless
    # He wants to leave and his club shut the door on every offer: that weighs on him too.
    held = cfg.management.market.offers.untouchable_morale_loss if held_back(player, world) else 0.0
    return Contentment(expected, salary_satisfaction, playing_satisfaction, satisfaction, restless, target - held, held)


# A part of his situation taking less than this off the morale he drifts towards is not named as its cause.
MORALE_CAUSE_MIN = 0.05


def morale_cause(world: World, mood: Contentment) -> str | None:
    """What holds a player's morale down most: "salaire", "temps_de_jeu", "ambition" or "intransferable" (he wants to
    leave and is not for sale); None when nothing much does."""
    cfg = world.config
    moral, rules = cfg.states.moral, cfg.management.contracts
    # What each part takes off the target, by its weight there (the satisfaction a renewal weighs counts in the target too).
    ambition = cfg.management.market.frustration_morale_weight * mood.frustration
    # Held back, the club beneath him and the door it shut are one and the same grievance.
    losses = {"salaire": (moral.contract_weight + moral.results_weight * rules.wage_weight) * (1 - mood.wage),
              "temps_de_jeu": (moral.playing_time_weight + moral.results_weight * rules.playing_time_weight) * (1 - mood.playing_time),
              "ambition": 0.0 if mood.held else ambition, "intransferable": ambition + mood.held if mood.held else 0.0}
    cause = max(losses, key=losses.get)
    return cause if losses[cause] >= MORALE_CAUSE_MIN else None


def asked_wage(player: Player, expected: float, cfg) -> int:
    """The weekly wage a player asks to extend: what his value commands, raised by his greed, never less than he earns."""
    return max(player.contract.weekly_wage, round(expected * (1 + cfg.management.contracts.greed_premium * player.greed)))


def worth_asking(wage: int, current: int, cfg) -> bool:
    """Whether a wage is a raise a player asks a new contract for: by `hausse_min_prolongation` of his own at least, and
    so by more than the pages, rounding monthly wages to two figures, could show as the same wage."""
    return wage > current and wage >= current * (1 + cfg.management.contracts.min_raise)


def brings_something(asked: Contract, current: Contract | None, cfg) -> bool:
    """Whether a contract gives a player something the one he has does not: more years, or a raise worth asking for."""
    return current is not None and (asked.end > current.end or worth_asking(asked.weekly_wage, current.weekly_wage, cfg))


def extension(world: World, player: Player, wage: int) -> Contract:
    """The contract a player signs to stay at this wage: as long as his age allows, never ending before the one he has."""
    contract = contract_for(player, world, wage)
    return replace(contract, end=player.contract.end) if contract.end < player.contract.end else contract


def renewal_events(world: World) -> list[PlayerSigned | PlayerChanged | RenewalProposed]:
    cfg = world.config
    rules = cfg.management.contracts
    events = []
    games, arrivals = games_by_club(world), season_arrivals(world)
    settling = recent_arrival_ids(world)
    ranks, useful_ids = {}, set()
    for club in world.clubs.values():
        useful_ids.update(sorted(club.player_ids, key=lambda pid: (-world.players[pid].rating, pid))[:nominal_size(cfg)])
        ranks.update(position_ranks(world, club))
    for player in world.players.values():
        if player.contract is None or player.club_id is None: continue
        club = world.clubs[player.club_id]
        remaining = world.date.months_until(player.contract.end)
        rank = ranks[player.id]
        mood = contentment(world, player, club, rank, *arrivals.get(player.id, (games[club.id], player.season_minutes)))
        expected, satisfaction, moral = mood.expected_wage, mood.satisfaction, cfg.states.moral
        events.append(PlayerChanged(player.id, morale=clamp(player.morale + moral.drift_speed * (mood.morale_target - player.morale), moral.min, moral.max)))
        # The club a player is lent to has no say on his contract, and his owner waits for him to be back.
        if player.loan is not None: continue
        if remaining >= rules.renewal_months and satisfaction >= rules.satisfaction_threshold: continue
        # A player who wants a bigger club does not extend; he plays out his contract or is sold.
        if wants_to_leave(player, world): continue
        # A player who has just arrived does not reopen the contract he signed.
        if player.id in settling: continue
        # Keep useful squad members, including backups; surplus expiry creates a market.
        indispensable_keeper = player.position == "GB" and rank < cfg.management.guardrails.min_goalkeepers
        useful = player.id in useful_ids or indispensable_keeper or len(club.player_ids) <= cfg.management.guardrails.min_squad
        if club.competition_id is not None and not indispensable_keeper and len(club.player_ids) > cfg.management.guardrails.min_squad:
            squad = [world.players[pid] for pid in club.player_ids]
            departure_cost = squad_quality(squad, club, cfg) - squad_quality([item for item in squad if item.id != player.id], club, cfg)
            useful = departure_cost > 0
        if not useful: continue
        # Wages that have outgrown the club's income are not signed again: its players leave as their contracts end.
        means = club.income * cfg.management.budgets.wage_income_share / cfg.management.budgets.weeks_per_year
        if club.income and club.wage_bill > rules.renewal_stop_ratio * means and not is_human_club(world, club.id): continue
        proposed = asked_wage(player, expected, cfg)
        room = wage_room(club, cfg)
        if proposed - player.contract.weekly_wage > room:
            # A financially constrained club can still offer the existing wage; a dormant one adds what its unseen squad leaves.
            proposed = player.contract.weekly_wage + (max(0, room) if club.competition_id is None else 0)
        if proposed < expected and satisfaction < rules.satisfaction_threshold: continue
        # A new contract has to bring him something: a raise worth asking for, or more years once the end is in sight.
        contract = extension(world, player, proposed)
        longer = remaining < rules.renewal_months and contract.end > player.contract.end
        if not longer and not worth_asking(proposed, player.contract.weekly_wage, cfg): continue
        if is_human_club(world, club.id):
            # Turned down, he does not ask again while this contract runs, save once when its end comes in sight.
            refused = world.refused_renewals.get(player.id)
            if refused is not None and not (remaining < rules.renewal_months <= refused.months_until(player.contract.end)): continue
            # A player on the transfer list does not ask for an extension.
            if player.id not in world.pending_renewals and listed_price(world, player.id) is None:
                events.append(RenewalProposed(RenewalProposal(player.id, club.id, contract, world.date)))
            continue
        events.append(PlayerSigned(player.id, club.id, club.id, contract, 0, True))
    return events
