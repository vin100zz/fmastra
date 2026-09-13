"""Weekly renewal decisions and daily contractual expiry."""
from core.domain.world import World
from core.math import clamp
from collections import Counter
from core.ai.market import market_value, expected_wage, contract_for, nominal_size, squad_quality
from .events import PlayerReleased, PlayerSigned, PlayerChanged


def expiry_events(world: World) -> list[PlayerReleased]:
    return [PlayerReleased(player.id) for player in world.players.values()
            if player.contract is not None and player.contract.end < world.date]


def renewal_events(world: World) -> list[PlayerSigned | PlayerChanged]:
    cfg = world.config
    rules = cfg.management.contracts
    events = []
    games_by_club = Counter()
    for match in world.matches.values():
        if match.result is not None and match.season == world.season:
            games_by_club.update((match.home_id, match.away_id))
    ranks, useful_ids = {}, set()
    for club in world.clubs.values():
        ordered = sorted(club.player_ids, key=lambda pid: (-world.players[pid].rating, pid))
        useful_ids.update(ordered[:nominal_size(cfg)])
        counts = Counter()
        for pid in ordered:
            position = world.players[pid].position
            ranks[pid] = counts[position]
            counts[position] += 1
    for player in world.players.values():
        if player.contract is None or player.club_id is None: continue
        club = world.clubs[player.club_id]
        remaining = world.date.months_until(player.contract.end)
        expected = expected_wage(market_value(player, world, club, False), cfg)
        salary_satisfaction = min(1, player.contract.weekly_wage / expected)
        rank = ranks[player.id]
        expected_share = 1 / (rank + 1)
        games = games_by_club[club.id] if club.competition_id else 0
        expected_minutes = games * cfg.engine.timing.match_seconds / 60 * expected_share
        playing_satisfaction = min(1, player.season_minutes / expected_minutes) if expected_minutes else 1
        satisfaction = rules.wage_weight * salary_satisfaction + rules.playing_time_weight * playing_satisfaction + rules.club_weight * min(1, club.reputation / max(1, player.rating))
        moral = cfg.states.moral
        target = moral.playing_time_weight * playing_satisfaction + moral.contract_weight * salary_satisfaction + moral.results_weight * satisfaction
        events.append(PlayerChanged(player.id, morale=clamp(player.morale + moral.drift_speed * (target - player.morale), moral.min, moral.max)))
        if remaining >= rules.renewal_months and satisfaction >= rules.satisfaction_threshold: continue
        # Keep useful squad members, including backups; surplus expiry creates a market.
        indispensable_keeper = player.position == "GB" and rank < cfg.management.guardrails.min_goalkeepers
        useful = player.id in useful_ids or indispensable_keeper or len(club.player_ids) <= cfg.management.guardrails.min_squad
        if club.competition_id is not None and not indispensable_keeper and len(club.player_ids) > cfg.management.guardrails.min_squad:
            squad = [world.players[pid] for pid in club.player_ids]
            departure_cost = squad_quality(squad, club, cfg) - squad_quality([item for item in squad if item.id != player.id], club, cfg)
            useful = departure_cost > 0
        if not useful: continue
        proposed = round(expected * (1 + rules.ego_factor * player.ego))
        proposed = max(player.contract.weekly_wage, proposed)
        if club.wage_bill - player.contract.weekly_wage + proposed > club.wage_cap:
            # A financially constrained club can still offer the existing wage.
            proposed = player.contract.weekly_wage
        if proposed < expected and satisfaction < rules.satisfaction_threshold: continue
        events.append(PlayerSigned(player.id, club.id, club.id, contract_for(player, world, proposed), 0, True))
    return events
