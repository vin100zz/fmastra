"""Weekly renewal decisions and daily contractual expiry."""
from dataclasses import dataclass, replace

from core.domain.clubs import Club
from core.domain.offers import RenewalProposal
from core.domain.players import Player
from core.domain.world import World
from core.math import clamp
from collections import Counter
from core.ai.market import market_value, expected_wage, contract_for, nominal_size, squad_quality
from .events import PlayerReleased, PlayerSigned, PlayerChanged, RenewalProposed
from .human import is_human_club, listed_price
from .transfer_rules import frustration, recent_arrival_ids, season_arrivals, wants_to_leave


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
    """Each player's rank by level among his club's players of his position, 0 for the best."""
    ranks, counts = {}, Counter()
    for pid in sorted(club.player_ids, key=lambda pid: (-world.players[pid].rating, pid)):
        position = world.players[pid].position
        ranks[pid] = counts[position]
        counts[position] += 1
    return ranks


@dataclass(frozen=True, slots=True)
class Contentment:
    """What a player under contract makes of his situation: his wage against the one his value commands, his minutes
    against those his rank at his position promises (each out of 1), what a renewal weighs, how restless a club beneath
    him makes him, and the morale he drifts towards each week."""
    expected_wage: float
    wage: float
    playing_time: float
    satisfaction: float
    frustration: float
    morale_target: float


def contentment(world: World, player: Player, club: Club, rank: int, games: int, minutes: float) -> Contentment:
    """`games` and `minutes` are the matches his club has played this season and those he played of them: the whole
    season's, or since he came for a player who joined on the way (see `season_arrivals`)."""
    cfg = world.config
    rules = cfg.management.contracts
    expected = expected_wage(market_value(player, world, club, False), cfg)
    salary_satisfaction = min(1, player.contract.weekly_wage / expected)
    expected_share = 1 / (rank + 1)
    expected_minutes = (games if club.competition_id else 0) * cfg.engine.timing.match_seconds / 60 * expected_share
    playing_satisfaction = min(1, minutes / expected_minutes) if expected_minutes else 1
    satisfaction = rules.wage_weight * salary_satisfaction + rules.playing_time_weight * playing_satisfaction + rules.club_weight * min(1, club.reputation / max(1, player.rating))
    moral = cfg.states.moral
    target = moral.playing_time_weight * playing_satisfaction + moral.contract_weight * salary_satisfaction + moral.results_weight * satisfaction
    # Playing every match and earning a fair wage does not settle a player whose club is beneath him.
    restless = frustration(player, world)
    target -= cfg.management.market.frustration_morale_weight * restless
    return Contentment(expected, salary_satisfaction, playing_satisfaction, satisfaction, restless, target)


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
        proposed = round(expected * (1 + rules.greed_premium * player.greed))
        proposed = max(player.contract.weekly_wage, proposed)
        if club.wage_bill - player.contract.weekly_wage + proposed > club.wage_cap:
            # A financially constrained club can still offer the existing wage.
            proposed = player.contract.weekly_wage
        if proposed < expected and satisfaction < rules.satisfaction_threshold: continue
        contract = contract_for(player, world, proposed)
        # A new contract never ends before the current one, and has to bring him something: a raise, or more years
        # once the end is in sight.
        if contract.end < player.contract.end: contract = replace(contract, end=player.contract.end)
        longer = remaining < rules.renewal_months and contract.end > player.contract.end
        if proposed <= player.contract.weekly_wage and not longer: continue
        if is_human_club(world, club.id):
            # A player on the transfer list does not ask for an extension.
            if player.id not in world.pending_renewals and listed_price(world, player.id) is None:
                events.append(RenewalProposed(RenewalProposal(player.id, club.id, contract, world.date)))
            continue
        events.append(PlayerSigned(player.id, club.id, club.id, contract, 0, True))
    return events
