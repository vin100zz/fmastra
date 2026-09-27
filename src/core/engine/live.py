"""A match played one possession at a time, with a local clock and injected RNG.

`PossessionEngine.simulate` runs it to the end; an interactive match advances it segment by segment."""
from random import Random

from core.config.model import Config
from core.domain.matches import Lineup, LineupSlot, LiveOrder, MatchEvent, MatchResult, PlayerMatchStats
from core.domain.players import Position
from core.math import clamp
from core.randomness import side_stream
from .analytical import lineup_strength
from .fitness import consume, intensity
from .local_state import TeamState, MatchLog
from .personnel import ensure_keeper, substitutions, injure
from .possession import play_possession, next_possession
from .results import assemble
from .zones import refresh, involved_player, mirror

# A segment of a watched match ends on the first of these: every chance, card, injury, change and whistle.
NOTABLE_KINDS = frozenset({"shot", "goal", "yellow", "red", "injury", "substitution", "period_end", "forfeit", "double_forfeit"})


class LiveMatch:
    def __init__(self, home: Lineup, away: Lineup, cfg: Config, rng: Random, *, neutral: bool = False,
                 controllers: tuple | None = None) -> None:
        from core.ai.controller import AIController
        self.home, self.away, self.cfg, self.rng, self.neutral = home, away, cfg, rng, neutral
        self.teams = (TeamState.from_lineup(home, cfg), TeamState.from_lineup(away, cfg))
        if controllers is None:
            shared = AIController(cfg, rng)
            controllers = (shared, shared)
        self.controllers = controllers
        for team, controller in zip(self.teams, controllers):
            team.automatic = controller.automatic
        self.log = MatchLog(attribution=side_stream(rng, "ratings"))
        self.status, self.outcome = "playing", "played"
        self.delivered = 0  # events already handed out by advance_segment
        self._result: MatchResult | None = None
        heights = cfg.formations.block_height
        difference = lineup_strength(home, cfg) - lineup_strength(away, cfg)
        for side, team in enumerate(self.teams):
            team.block_height = clamp((difference if side == 0 else -difference) * heights.initial_strength_sensitivity
                                      + (heights.initial_home_bonus if side == 0 and not neutral else 0), heights.min, heights.max)
            team.initial_block = team.block_height
            refresh(team, cfg)
        if self._short_handed():
            self._forfeit()
            return
        rules = cfg.engine.timing
        self.first_kickoff = rng.randrange(2)
        self.base_stoppage = rng.randint(rules.stoppage_min, rules.stoppage_max)
        self._kick_off(1)

    @property
    def finished(self) -> bool:
        return self.status == "finished"

    def run(self) -> MatchResult:
        while not self.finished:
            self.step()
        return self.result()

    def advance_segment(self) -> list[MatchEvent]:
        """Plays on until something worth showing happens; returns every event not handed out yet,
        including those of the orders given since the previous segment."""
        start = len(self.log.events)
        while not self.finished:
            self.step()
            if any(event.kind in NOTABLE_KINDS for event in self.log.events[start:]):
                break
        return self.undelivered()

    def undelivered(self) -> list[MatchEvent]:
        events = self.log.events[self.delivered:]
        self.delivered = len(self.log.events)
        return events

    @property
    def order_point(self) -> tuple[int, bool]:
        """Where an order given now belongs: after this possession, during the break or not."""
        return self.log.possession, self.status == "halftime"

    def apply_orders(self, side: int, orders: list[LiveOrder]) -> None:
        """The side manager's changes, between two possessions or at the break; ValueError when the rules forbid one."""
        if self.finished:
            raise ValueError("Le match est terminé.")
        team, rules = self.teams[side], self.cfg.world.match_rules
        halftime = self.status == "halftime"
        changes = any(order.kind == "substitution" for order in orders)
        if changes and not halftime and team.windows >= rules.substitution_windows:
            raise ValueError("Plus de fenêtre de remplacement disponible.")
        for order in orders:
            if order.kind == "substitution":
                self._substitute(team, order)
            elif order.kind == "reposition":
                self._reposition(team, order.slots)
            elif order.kind == "mentality":
                if order.mentality not in self.cfg.formations.block_height.mentalities:
                    raise ValueError("Mentalité inconnue.")
                team.mentality = order.mentality
            elif order.kind == "auto":
                from core.ai.controller import AIController
                controllers = list(self.controllers)
                controllers[side] = AIController(self.cfg, self.rng)
                self.controllers = tuple(controllers)
                team.automatic = True
            else:
                raise ValueError("Ordre inconnu.")
        if sum(slot.position == Position.GOALKEEPER for slot in team.active) > 1:
            raise ValueError("Un seul gardien sur le terrain.")
        if changes and not halftime:
            team.windows += 1
        ensure_keeper(team, self.cfg)
        refresh(team, self.cfg)
        team.block_height = self.controllers[side].late_block(team, self.teams[1 - side].goals, self.log.second)

    def vacancies(self, team: TeamState) -> int:
        """Places left empty by an injured player nobody replaced."""
        return self.cfg.world.match_rules.players_on_pitch - len(team.dismissed) - len(team.active)

    def _substitute(self, team: TeamState, order: LiveOrder) -> None:
        if team.substituted >= self.cfg.world.match_rules.max_substitutions:
            raise ValueError("Tous les remplacements ont été effectués.")
        incoming = next((player for player in team.bench if player.id == order.incoming_id), None)
        if incoming is None:
            raise ValueError("Ce joueur n'est pas sur le banc.")
        position = self._position(order.position)
        slot = next((slot for slot in team.active if slot.player.id == order.outgoing_id), None)
        replaced = any(event.kind == "substitution" and event.team_id == team.club_id and event.player_id == order.outgoing_id
                       for event in self.log.events)
        if slot is not None:
            team.active[team.active.index(slot)] = LineupSlot(incoming, position)
        elif order.outgoing_id in team.injured and self.vacancies(team) > 0 and not replaced:
            team.active.append(LineupSlot(incoming, position))
        else:
            raise ValueError("Ce joueur n'est plus sur le terrain.")
        team.bench.remove(incoming)
        team.individual[incoming.id] = PlayerMatchStats(final_fitness=incoming.fitness)
        team.substituted += 1
        self.log.emit("substitution", team, order.outgoing_id, incoming.id, detail=position.value)

    def _reposition(self, team: TeamState, slots: tuple[tuple[int, str], ...]) -> None:
        players = {slot.player.id: slot.player for slot in team.active}
        if sorted(player_id for player_id, _ in slots) != sorted(players):
            raise ValueError("Le placement doit reprendre exactement les joueurs sur le terrain.")
        team.active[:] = [LineupSlot(players[player_id], self._position(position)) for player_id, position in slots]

    @staticmethod
    def _position(value: str) -> Position:
        try:
            return Position(value)
        except ValueError:
            raise ValueError("Poste inconnu.") from None

    def step(self) -> None:
        if self.status == "finished":
            return
        if self.status == "halftime":
            self.status = "playing"
            self._kick_off(2)
            return
        self._possession()
        if self.status == "playing" and self.log.second >= self.end:
            self.log.emit("period_end", self.teams[self.owner])
            self.status = "halftime" if self.log.period == 1 else "finished"

    def result(self) -> MatchResult:
        if not self.finished:
            raise ValueError("The match is not over")
        if self._result is None:
            self._result = assemble(*self.teams, self.home, self.away, self.log, self.cfg, self.outcome)
        return self._result

    def _short_handed(self) -> bool:
        return any(len(team.active) < self.cfg.world.match_rules.min_players for team in self.teams)

    def _kick_off(self, period: int) -> None:
        log = self.log
        log.period = period
        if period == 2:
            for team, controller in zip(self.teams, self.controllers):
                substitutions(team, log, self.cfg, controller, halftime=True)
        self.end = log.second + self.cfg.world.match_rules.half_seconds + self.base_stoppage / 2
        self.owner = self.first_kickoff if period == 1 else 1 - self.first_kickoff
        self.zone, self.lane, self.counter = 1, len(self.cfg.involvement.lanes) // 2, False
        log.emit("kickoff", self.teams[self.owner])

    def _possession(self) -> None:
        cfg, rng, log, teams = self.cfg, self.rng, self.log, self.teams
        rules = cfg.engine.timing
        owner = self.owner
        attacker, defender = teams[owner], teams[1 - owner]
        dt = min(rng.gammavariate(rules.possession_gamma_shape, rules.possession_mean / rules.possession_gamma_shape), self.end - log.second)
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
            chunk = min(remaining, boundary - log.second)
            for team in teams: consume(team, chunk, cfg)
            log.second += chunk
            remaining -= chunk
        log.possession += 1
        attacker.stats.possessions += 1
        attacker.stats.possession_seconds += dt
        attacker.stats.lane_attacks[self.lane] += 1
        log.emit("possession", attacker, zone=self.zone, lane=self.lane, detail="counter" if self.counter else "")
        outcome = play_possession(attacker, defender, self.zone, self.lane, self.counter, owner == 0 and not self.neutral, log, cfg, rng)
        if self._short_handed():
            self._forfeit()
            return
        # Exactly one named participant is assessed per possession.
        side = rng.randrange(2)
        affected = teams[side]
        injury_zone, injury_lane = (outcome.zone, outcome.lane) if side == owner else mirror(outcome.zone, outcome.lane, cfg)
        candidate = involved_player(affected, injury_zone, injury_lane, side == owner, rng)
        injuries = cfg.states.injuries
        risk = injuries.possession_probability * (injuries.fitness_factor - affected.fitness[candidate.player.id]) * candidate.player.fragility * intensity(affected.block_height, cfg)
        if rng.random() < clamp(risk, 0, 1):
            injure(affected, candidate.player.id, log, cfg, self.controllers[side])
        if self._short_handed():
            self._forfeit()
            return
        for side, team in enumerate(teams):
            if log.second >= team.next_substitution:
                substitutions(team, log, cfg, self.controllers[side], goal_difference=team.goals - teams[1 - side].goals)
                team.next_substitution = log.second + cfg.states.substitutions.evaluation_interval * 60
            team.block_height = self.controllers[side].late_block(team, teams[1 - side].goals, log.second)
        self.end += sum(event.kind in ("goal", "injury", "substitution") for event in log.events[event_start:]) * rules.seconds_per_stoppage
        self.zone, self.lane, self.counter = next_possession(outcome, defender, attacker, cfg, rng)
        self.owner = 1 - owner

    def _forfeit(self) -> None:
        rule = self.cfg.world.match_rules
        unavailable = [len(team.active) < rule.min_players for team in self.teams]
        if all(unavailable):
            self.teams[0].goals = self.teams[1].goals = rule.forfeit_loser_goals
            status = "double_forfeit"
        else:
            for index, team in enumerate(self.teams):
                team.goals = rule.forfeit_loser_goals if unavailable[index] else rule.forfeit_winner_goals
            status = "forfeit"
        self.log.emit(status, self.teams[0])
        self.outcome, self.status = status, "finished"
