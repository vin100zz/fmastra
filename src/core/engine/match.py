"""Possession-engine orchestration with a local clock and injected RNG."""
from random import Random

from core.ai.controller import AIController
from core.config.model import Config
from core.domain.matches import Lineup, MatchResult
from core.math import clamp
from .analytical import lineup_strength
from .fitness import consume, intensity
from .local_state import TeamState, MatchLog
from .personnel import substitutions, injure
from .possession import play_possession, next_possession
from .results import assemble
from .zones import refresh, involved_player, mirror


class PossessionEngine:
    def simulate(self, home: Lineup, away: Lineup, cfg: Config, rng: Random, *, neutral: bool = False) -> MatchResult:
        teams = (TeamState.from_lineup(home, cfg), TeamState.from_lineup(away, cfg))
        controller = AIController(cfg, rng)
        log = MatchLog()
        rules, heights = cfg.engine.timing, cfg.formations.block_height
        difference = lineup_strength(home, cfg) - lineup_strength(away, cfg)
        for side, team in enumerate(teams):
            team.block_height = clamp((difference if side == 0 else -difference) * heights.initial_strength_sensitivity
                                      + (heights.initial_home_bonus if side == 0 and not neutral else 0), heights.min, heights.max)
            team.initial_block = team.block_height
            refresh(team, cfg)
        if any(len(team.active) < cfg.world.match_rules.min_players for team in teams):
            return self._forfeit(teams, home, away, log, cfg)
        first_kickoff = rng.randrange(2)
        base_stoppage = rng.randint(rules.stoppage_min, rules.stoppage_max)
        for period in (1, 2):
            log.period = period
            if period == 2:
                for team in teams:
                    substitutions(team, log, cfg, controller, halftime=True)
            period_start = log.second
            end = period_start + cfg.world.match_rules.half_seconds + base_stoppage / 2
            owner = first_kickoff if period == 1 else 1 - first_kickoff
            zone, lane, counter = 1, len(cfg.involvement.lanes) // 2, False
            log.emit("kickoff", teams[owner])
            while log.second < end:
                attacker, defender = teams[owner], teams[1 - owner]
                dt = min(rng.gammavariate(rules.possession_gamma_shape, rules.possession_mean / rules.possession_gamma_shape), end - log.second)
                event_start = len(log.events)
                # Split fitness integration at refresh boundaries without adding possessions.
                remaining = dt
                while remaining > 0:
                    boundary = min(team.next_refresh for team in teams)
                    if boundary <= log.second:
                        for team in teams:
                            refresh(team, cfg)
                            team.next_refresh = log.second + cfg.engine.rating_refresh.fitness_interval * 60
                        boundary = min(team.next_refresh for team in teams)
                    step = min(remaining, boundary - log.second)
                    for team in teams: consume(team, step, cfg)
                    log.second += step
                    remaining -= step
                log.possession += 1
                attacker.stats.possessions += 1
                attacker.stats.possession_seconds += dt
                attacker.stats.lane_attacks[lane] += 1
                log.emit("possession", attacker, zone=zone, lane=lane)
                outcome = play_possession(attacker, defender, zone, lane, counter, owner == 0 and not neutral, log, cfg, rng)
                if any(len(team.active) < cfg.world.match_rules.min_players for team in teams):
                    return self._forfeit(teams, home, away, log, cfg)
                # Exactly one named participant is assessed per possession.
                side = rng.randrange(2)
                affected = teams[side]
                injury_zone, injury_lane = (outcome.zone, outcome.lane) if side == owner else mirror(outcome.zone, outcome.lane, cfg)
                candidate = involved_player(affected, injury_zone, injury_lane, side == owner, cfg, rng)
                injuries = cfg.states.injuries
                risk = injuries.possession_probability * (injuries.fitness_factor - affected.fitness[candidate.player.id]) * candidate.player.fragility * intensity(affected.block_height, cfg)
                if rng.random() < clamp(risk, 0, 1):
                    injure(affected, candidate.player.id, log, cfg, controller)
                if any(len(team.active) < cfg.world.match_rules.min_players for team in teams):
                    return self._forfeit(teams, home, away, log, cfg)
                for side, team in enumerate(teams):
                    if log.second >= team.next_substitution:
                        substitutions(team, log, cfg, controller)
                        team.next_substitution = log.second + cfg.states.substitutions.evaluation_interval * 60
                    trailing = max(0, teams[1 - side].goals - team.goals)
                    fraction = clamp((log.second - (rules.match_seconds - heights.late_match_minutes * 60)) /
                                     (heights.late_match_minutes * 60), 0, 1)
                    team.block_height = clamp(team.initial_block + trailing * fraction * heights.late_trailing_adjustment, heights.min, heights.max)
                end += sum(event.kind in ("goal", "injury", "substitution") for event in log.events[event_start:]) * rules.seconds_per_stoppage
                zone, lane, counter = next_possession(outcome, defender, attacker, cfg, rng)
                owner = 1 - owner
            log.emit("period_end", teams[owner])
        return assemble(*teams, home, away, log, cfg)

    @staticmethod
    def _forfeit(teams: tuple[TeamState, TeamState], home: Lineup, away: Lineup, log: MatchLog, cfg: Config) -> MatchResult:
        rule = cfg.world.match_rules
        unavailable = [len(team.active) < rule.min_players for team in teams]
        if all(unavailable):
            teams[0].goals = teams[1].goals = rule.forfeit_loser_goals
            status = "double_forfeit"
        else:
            for index, team in enumerate(teams):
                team.goals = rule.forfeit_loser_goals if unavailable[index] else rule.forfeit_winner_goals
            status = "forfeit"
        log.emit(status, teams[0])
        return assemble(*teams, home, away, log, cfg, status)
