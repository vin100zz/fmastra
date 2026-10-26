"""One possession, action after action, the stoppages that end or interrupt it, and the transition to the opponent's local
coordinates."""
from dataclasses import dataclass
from math import exp
from random import Random

from core.config.model import Config
from core.domain.players import Player
from core.math import clamp, sigmoid, logit
from .abilities import weighted_rating
from .local_state import MatchLog, TeamState
from .personnel import dismiss
from .danger import danger
from .shots import resolve_shot
from .zones import credited, duel_defender, duel_edge, foul_committer, gap, involved_player, mirror, choose_lane


@dataclass(frozen=True, slots=True)
class PossessionOutcome:
    zone: int
    lane: int
    shot: bool
    goal: bool
    # The seconds of play the possession lasted, dead ball excluded.
    seconds: float = 0
    # How the ball was lost in play: "interception", "tackle", "aerial", "clearance" or "claim" (a keeper catching a ball
    # played into his box); empty otherwise.
    loss: str = ""
    # Lost while the side went for it (a try that failed, a ball cleared from the box): its players are caught upfield.
    committed: bool = False
    whistle: bool = False
    # How the next possession starts once the ball went dead (see `RESTARTS`); empty when it was won in play.
    restart: str = ""


# Each restart: the dead time it waits for (a field of `EngineConfigStoppagesDeadTime`) and the event that opens the next
# possession. A free kick given to the defence (a foul by the attack, a tactical foul stopping a counter, an offside) is
# played short; a keeper holding a save, or a cross he caught, distributes the ball.
RESTARTS = {"": (None, None), "goal": ("after_goal", None), "goal_kick": ("goal_kick", None), "keeper": ("keeper", None),
            "claim": ("keeper", None), "throw_in": ("throw_in", "throw_in"), "free_kick": ("short_free_kick", "free_kick"),
            "offside": ("offside", "free_kick")}
# The share of `EngineConfigStoppagesFoulShares` each failed action draws its foul from, and how the ball is lost in play.
FOUL_SHARES = {"pass": "pass_", "carry": "carry", "centre_chance": "centre_chance", "through_ball": "centre_chance",
               "box_dribble": "box_dribble", "cross": "cross", "aerial": "aerial"}
LOSSES = {"pass": "interception", "carry": "tackle", "centre_chance": "interception", "through_ball": "interception",
          "box_dribble": "tackle", "cross": "interception", "aerial": "aerial"}
# What fails when a chance of each kind does not come off in the last zone.
CREATION_ACTIONS = {"shot": "centre_chance", "through_ball": "through_ball", "dribble": "box_dribble", "cross": "cross",
                    "cutback": "cross"}
# However rash a defence, some failed actions end otherwise than in a foul.
MAX_FOUL_SHARE = 0.95


class _Draw:
    """A uniform draw shared out between outcomes in turn: each takes its share of what the previous ones left."""
    __slots__ = ("value",)

    def __init__(self, value: float) -> None:
        self.value = value

    def falls(self, share: float) -> bool:
        if self.value < share: return True
        self.value -= share
        return False


def _pause(mean: float, cfg: Config, rng: Random) -> float:
    shape = cfg.engine.stoppages.dead_time.gamma_shape
    return rng.gammavariate(shape, mean / shape) if mean > 0 else 0.0


def _book(team: TeamState, player_id: int, odds, zone: int, lane: int, log: MatchLog, cfg: Config, rng: Random) -> bool:
    """The card a foul may earn, and the time it takes; False when the side no longer has enough players to go on."""
    stats = team.individual[player_id]
    draw = rng.random()
    if draw < odds.red:
        dismiss(team, player_id, log, cfg, True)
    elif draw < odds.red + odds.yellow * (cfg.engine.cards.booked_caution_multiplier if stats.yellows else 1):
        team.stats.yellows += 1
        stats.yellows += 1
        log.emit("yellow", team, player_id, zone=zone, lane=lane)
        if stats.yellows >= 2:
            dismiss(team, player_id, log, cfg, False)
    else:
        return True
    log.second += _pause(cfg.engine.stoppages.dead_time.card, cfg, rng)
    return len(team.active) >= cfg.world.match_rules.min_players


def play_possession(attacker: TeamState, defender: TeamState, zone: int, lane: int, counter: bool,
                    home: bool, log: MatchLog, cfg: Config, rng: Random, deadline: float = float("inf")) -> PossessionOutcome:
    """The side keeps the ball or tries something, one action at a time. Every pass kept opens the defence a little more,
    which draws the side forward; the referee ends the half at the first pass kept once `deadline` has passed. A foul it
    suffers, a throw-in it wins or a corner it plays short stops the play without ending the possession."""
    return _Play(attacker, defender, zone, lane, counter, home, log, cfg, rng).run(deadline)


class _Play:
    """A possession under way: where the ball is, how open the defence, who carried it, whether a set piece came, and the
    duel under way: the carrier and the defender who meets him, and the danger the side held when it began."""
    __slots__ = ("attacker", "defender", "home", "log", "cfg", "rng", "zone", "lane", "counter", "opening", "played",
                 "passer", "set_piece", "last_zone", "centre", "duel", "stake")

    def __init__(self, attacker: TeamState, defender: TeamState, zone: int, lane: int, counter: bool, home: bool,
                 log: MatchLog, cfg: Config, rng: Random) -> None:
        self.attacker, self.defender, self.home, self.log, self.cfg, self.rng = attacker, defender, home, log, cfg, rng
        self.zone, self.lane, self.counter = zone, lane, counter
        self.opening, self.played, self.passer = 0.0, 0.0, None
        # Set once a corner, a free kick played at goal or a penalty came: a goal after it is a set piece's.
        self.set_piece = False
        self.last_zone, self.centre = len(cfg.involvement.zones) - 1, len(cfg.involvement.lanes) // 2
        self.duel, self.stake = None, 0.0

    def run(self, deadline: float) -> PossessionOutcome:
        attacker, defender, log, cfg, rng = self.attacker, self.defender, self.log, self.cfg, self.rng
        actions, rules = cfg.engine.actions, cfg.engine.transitions
        keeping, opening_rules, durations = actions.conservation, actions.opening, actions.durations
        last_zone, lanes = self.last_zone, len(cfg.involvement.lanes)
        stats = attacker.stats
        # A side far ahead manages the score: it tries less and keeps the ball.
        easing = rules.easing_per_goal * max(0, attacker.goals - defender.goals - rules.comfortable_lead)
        series = 0
        while True:
            zone, lane, counter = self.zone, self.lane, self.counter
            self.duel = None
            # How much better this side keeps the ball here than its opponent does at the same place of its own half: nil
            # between equals, whatever their formations.
            edge = gap(attacker, defender, zone, lane, False, cfg, counter) - gap(defender, attacker, zone, lane, False, cfg)
            if counter:
                tempo = actions.counter_tempo
            else:
                tempo = actions.tempo_by_zone[zone]
                tempo += (1 - tempo) * actions.opening_pull * self.opening / opening_rules.max
                # The side on top takes its time; the side under pressure hurries.
                shift = easing + actions.patience * edge
                if shift: tempo = sigmoid(logit(tempo) - shift)
            draw = rng.random()
            if draw < 1 - tempo:
                if log.second >= deadline:
                    if series: log.emit("circulation", attacker, zone=zone, lane=lane, detail=str(series))
                    return PossessionOutcome(zone, lane, False, False, self.played, whistle=True)
                keep = sigmoid(keeping.bias_by_zone[zone] + keeping.sensitivity * edge)
                stats.passes_attempted += 1
                if draw >= (1 - tempo) * keep:
                    if series: log.emit("circulation", attacker, zone=zone, lane=lane, detail=str(series))
                    log.second += durations.pass_
                    self.played += durations.pass_
                    return self.misplaced()
                log.second += durations.pass_
                self.played += durations.pass_
                stats.passes += 1
                series += 1
                self.opening = min(opening_rules.max, self.opening + opening_rules.gain_per_pass)
                # The defence had the time to get back in shape.
                self.counter = False
                move = rng.random()
                if move < keeping.lateral_share:
                    neighbors = [candidate for candidate in (lane - 1, lane + 1) if 0 <= candidate < lanes]
                    self.lane = neighbors[0] if len(neighbors) == 1 else choose_lane(attacker, defender, zone, cfg, rng, neighbors)
                elif move < keeping.lateral_share + keeping.back_share_by_zone[zone]:
                    self.zone = zone - 1
                continue
            if series:
                log.emit("circulation", attacker, zone=zone, lane=lane, detail=str(series))
                series = 0
            # The carrier decides what he tries; the zones decide whether it comes off, and the duel he meets a little.
            carrier = involved_player(attacker, zone, lane, True, rng)
            attributes = carrier.player.attributes
            duel_zone, duel_lane = mirror(zone, lane, cfg)
            if zone == last_zone:
                log.second += durations.chance
                self.played += durations.chance
                kind = _chance_kind(carrier.player, lane, counter, self.opening, cfg, rng)
                marker = duel_defender(defender, duel_zone, duel_lane, True, rng)
                self.duel, self.stake = (carrier, marker), danger(cfg, zone, counter)
                chance = (rules.creation_sensitivity * gap(attacker, defender, zone, lane, True, cfg, counter)
                          + rules.creation_bias + self.opening + duel_edge(attacker, carrier, zone, lane, "creation_attack", cfg)
                          - duel_edge(defender, marker, duel_zone, duel_lane, "creation_defense", cfg))
                if rng.random() < sigmoid(chance):
                    self.duel = None
                    ended = self.shoot(kind, zone, lane, carrier, self.stake, marker)
                else:
                    ended = self.failed(CREATION_ACTIONS[kind], carrier)
                if ended: return ended
                continue
            long_ball, long_shot = actions.long_ball, actions.long_shot
            if (zone < len(long_ball.share_by_zone) and rng.random()
                    < sigmoid(logit(long_ball.share_by_zone[zone])
                              + long_ball.passing_sensitivity * (attributes.get("passe") - long_ball.passing_reference))):
                # Over the next line, to a team-mate who must win the ball in the air against the defender there.
                log.second += durations.long_ball
                self.played += durations.long_ball
                stats.passes_attempted += 1
                edge = duel_edge(attacker, carrier, zone, lane, "progression_attack", cfg)
                self.stake = danger(cfg, zone, counter)
                self.zone = zone = zone + 2
                self.lane = lane = choose_lane(attacker, defender, zone, cfg, rng)
                duel_zone, duel_lane = mirror(zone, lane, cfg)
                marker = duel_defender(defender, duel_zone, duel_lane, False, rng)
                self.duel = (carrier, marker)
                edge -= duel_edge(defender, marker, duel_zone, duel_lane, "progression_defense", cfg)
                if rng.random() >= sigmoid(long_ball.bias + rules.progression_sensitivity * gap(attacker, defender, zone, lane, False, cfg, counter) + edge):
                    ended = self.failed("aerial", carrier)
                    if ended: return ended
                    continue
                stats.passes += 1
                self.passer = carrier.player.id
                self.opening = 0.0
                self.advanced(danger(cfg, zone, counter))
                log.emit("progress", attacker, self.passer, zone=zone, lane=lane, detail="long")
                continue
            if (zone == last_zone - 1 and lane == self.centre and rng.random()
                    < sigmoid(logit(long_shot.share) + long_shot.opening_effect * self.opening / opening_rules.max
                              + long_shot.finishing_sensitivity * (attributes.get("finition") - long_shot.finishing_reference))):
                # A defence still in place leaves only the strike from distance.
                log.second += durations.chance
                self.played += durations.chance
                ended = self.shoot("long_shot", zone, lane, carrier, danger(cfg, zone, counter))
                if ended: return ended
                continue
            log.second += durations.progression
            self.played += durations.progression
            # A carry or a dribble draws more fouls than a pass: what the move is now changes the play.
            label = ("dribble" if rng.random() < dribble_probability(carrier.player, cfg)
                     else "carry" if rng.random() < actions.carry_share else "pass")
            if label == "pass": stats.passes_attempted += 1
            marker = duel_defender(defender, duel_zone, duel_lane, False, rng)
            self.duel, self.stake = (carrier, marker), danger(cfg, zone, counter)
            chance = (rules.progression_sensitivity * gap(attacker, defender, zone, lane, False, cfg, counter)
                      + rules.progression_bias + self.opening + (rules.home_bonus if self.home else 0)
                      + duel_edge(attacker, carrier, zone, lane, "progression_attack", cfg)
                      - duel_edge(defender, marker, duel_zone, duel_lane, "progression_defense", cfg))
            if rng.random() >= sigmoid(chance):
                ended = self.failed("pass" if label == "pass" else "carry", carrier)
                if ended: return ended
                continue
            if label == "pass": stats.passes += 1
            self.passer = carrier.player.id
            self.zone = zone = zone + 1
            self.opening *= opening_rules.kept_after_progression
            switch = cfg.engine.lanes.switch_probability * (1 + cfg.engine.lanes.switch_vision_weight
                                                            * attributes.get("vision") / cfg.attributes.bounds.max)
            if rng.random() < clamp(switch, 0, 1):
                neighbors = [candidate for candidate in (lane - 1, lane + 1) if 0 <= candidate < lanes]
                self.lane = lane = choose_lane(attacker, defender, zone, cfg, rng, neighbors)
            self.advanced(danger(cfg, zone, counter))
            # A carrier who prefers his feet to his passing takes his marker on rather than passing round him.
            dribbled = marker.player.id if label == "dribble" else None
            # The ball carrier who took the side into the next zone, where the play now stands.
            log.emit("progress", attacker, self.passer, dribbled, zone=zone, lane=lane, detail=label)

    def advanced(self, reached: float) -> None:
        """The carrier won his duel: the danger he added is his, and the defender he beat takes his share of it."""
        carrier, marker = self.duel
        gained = reached - self.stake
        self.attacker.threaten(carrier.player.id, gained)
        self.defender.threaten(marker.player.id, -self.cfg.engine.player_ratings.beaten_share * gained)

    # How a failed action ends.

    def failed(self, action: str, carrier) -> PossessionOutcome | None:
        """A try that did not come off: a foul, the ball out of play, an offside, or the ball lost in play. None when the
        side keeps the ball."""
        cfg, rng, zone, lane = self.cfg, self.rng, self.zone, self.lane
        stoppages = cfg.engine.stoppages
        fouls, out = stoppages.foul, stoppages.out
        centre = lane == self.centre
        defensive_zone, defensive_lane = mirror(zone, lane, cfg)
        # A defender beaten more often stops the play by a foul more often: the side on top draws the fouls. The edge is nil
        # between equals, whatever their formations.
        edge = (gap(self.attacker, self.defender, zone, lane, False, cfg, self.counter)
                - gap(self.defender, self.attacker, zone, lane, False, cfg))
        share = (getattr(fouls.shares, FOUL_SHARES[action]) * self.defender.layout.aggression[defensive_zone][defensive_lane]
                 * exp(fouls.edge_sensitivity * edge))
        # In the last zone, the action may happen in the box, where a defender takes far more care.
        box = zone == self.last_zone and rng.random() < (fouls.box_share.centre if centre else fouls.box_share.wing)
        if box: share *= fouls.box_factor
        share = min(share, MAX_FOUL_SHARE)
        draw = rng.random()
        if draw < share:
            if action == "aerial" and rng.random() < fouls.attacker_aerial_share:
                return self.attacking_foul()
            return self.foul(carrier if action != "aerial" else None, box)
        pick = _Draw((draw - share) / (1 - share))
        if action == "cross":
            cross = out.cross
            if pick.falls(cross.corner): return self.corner("cross")
            if pick.falls(cross.goal_kick): return self.dead("goal_kick", True)
            if pick.falls(cross.throw_in): return self.dead("throw_in", True)
            if pick.falls(self.claiming(cross.claimed)): return self.claim()
        elif action in ("centre_chance", "through_ball", "box_dribble"):
            if action == "through_ball" and pick.falls(stoppages.offside.through_ball): return self.offside(carrier, self.centre)
            if pick.falls(out.centre_chance_corner): return self.corner("clearance")
        elif action == "aerial":
            if zone == self.last_zone and pick.falls(stoppages.offside.long_ball): return self.offside(carrier, lane)
            if pick.falls(out.long_ball):
                # Out off either side: the throw-in goes to the one who did not touch it last.
                if rng.random() < 0.5: return self.dead("throw_in", True)
                return self.throw_in()
            return self.lost("aerial", False)
        else:
            shares = out.pass_ if action == "pass" else out.carry
            if pick.falls(shares.centre if centre else shares.wing):
                # A pass that runs out is the defence's throw-in; a tackle that puts the ball out leaves it to the attack.
                return self.dead("throw_in", True) if action == "pass" else self.throw_in()
        return self.lost(LOSSES[action], True)

    def misplaced(self) -> PossessionOutcome:
        """A pass kept that did not find its man: into touch, or to an opponent."""
        shares = self.cfg.engine.stoppages.out.conservation
        if self.rng.random() < (shares.centre if self.lane == self.centre else shares.wing): return self.dead("throw_in")
        return self.lost("interception", False)

    def dead(self, restart: str, failed: bool = False) -> PossessionOutcome:
        """The ball went dead and goes to the defence: a throw-in, a goal kick. A carrier who put it out lost his duel."""
        if failed and self.duel: self.settle(self.stake)
        return PossessionOutcome(self.zone, self.lane, False, False, self.played, restart=restart)

    def settle(self, value: float, winner: int | None = None) -> None:
        """The duel is lost: the carrier gives up `value`, which the defender who met him, or `winner`, takes."""
        carrier, marker = self.duel
        self.attacker.threaten(carrier.player.id, -value)
        self.defender.threaten(winner if winner is not None else marker.player.id, value)
        self.duel = None

    def lost(self, loss: str, committed: bool) -> PossessionOutcome:
        """The defender who met the carrier wins the ball from him; a pass kept that went astray is put down to those
        involved, the better players winning it and the weaker ones losing it more often."""
        attacker, defender, cfg, zone, lane = self.attacker, self.defender, self.cfg, self.zone, self.lane
        defensive_zone, defensive_lane = mirror(zone, lane, cfg)
        recovery = cfg.engine.player_ratings.recovery_danger[defensive_zone]
        if self.duel:
            winner, loser = self.duel[1].player.id, self.duel[0].player.id
            self.settle(self.stake + recovery)
        else:
            credit_rng, creation = self.log.attribution, zone == self.last_zone
            winner = credited(defender, "creation_defense" if creation else "progression_defense", defensive_zone, defensive_lane, True, credit_rng)
            loser = credited(attacker, "creation_attack" if creation else "progression_attack", zone, lane, False, credit_rng)
            value = danger(cfg, zone, self.counter) + recovery
            attacker.threaten(loser, -value)
            defender.threaten(winner, value)
        self.log.emit("turnover", defender, winner, loser, zone=defensive_zone, lane=defensive_lane, detail=loss)
        return PossessionOutcome(zone, lane, False, False, self.played, loss, committed)

    def cleared(self, zone: int, lane: int) -> PossessionOutcome:
        """The defence heads or kicks the ball away from its box: it starts again from there, the attackers still upfield."""
        defender, cfg = self.defender, self.cfg
        defensive_zone, defensive_lane = mirror(zone, lane, cfg)
        winner = credited(defender, "creation_defense", defensive_zone, defensive_lane, True, self.log.attribution)
        defender.threaten(winner, danger(cfg, zone, False))
        self.log.emit("turnover", defender, winner, zone=defensive_zone, lane=defensive_lane, detail="clearance")
        return PossessionOutcome(zone, lane, False, False, self.played, "clearance", True)

    def claiming(self, share: float) -> float:
        """The share of balls into his box the defending keeper catches, more for a keeper who comes for them well."""
        rules, keeper = self.cfg.engine.stoppages, self.defender.goalkeeper().player
        quality = weighted_rating(keeper.attributes, self.cfg.attributes.composites.claiming)
        return sigmoid(logit(share) + rules.claiming_sensitivity * (quality - rules.claiming_reference))

    def claim(self) -> PossessionOutcome:
        keeper = self.defender.goalkeeper().player.id
        if self.duel: self.settle(self.stake, keeper)
        else: self.defender.threaten(keeper, danger(self.cfg, self.zone, False))
        defensive_zone, defensive_lane = mirror(self.zone, self.lane, self.cfg)
        self.log.emit("turnover", self.defender, keeper, zone=defensive_zone, lane=defensive_lane, detail="claim")
        return PossessionOutcome(self.zone, self.lane, False, False, self.played, "claim", True)

    def resume(self, pause: float) -> None:
        """The side keeps the ball after a stoppage, where the play stopped; the defence is back in shape."""
        self.log.second += _pause(pause, self.cfg, self.rng)
        self.opening, self.counter, self.duel = 0.0, False, None
        return None

    def throw_in(self) -> None:
        self.log.emit("throw_in", self.attacker, zone=self.zone, lane=self.lane)
        return self.resume(self.cfg.engine.stoppages.dead_time.throw_in)

    def offside(self, passer, lane: int) -> PossessionOutcome:
        """The man the ball was played to had gone too soon: a free kick for the defence where he stood."""
        receiver = involved_player(self.attacker, self.zone, lane, True, self.rng, passer.player.id).player.id
        self.attacker.stats.offsides += 1
        # The chance is gone, by the fault of the man who went too soon.
        self.attacker.threaten(receiver, -self.stake)
        self.duel = None
        self.log.emit("offside", self.attacker, receiver, passer.player.id, zone=self.zone, lane=lane)
        return PossessionOutcome(self.zone, lane, False, False, self.played, restart="offside")

    # Fouls and what they give.

    def foul(self, fouled, box: bool) -> PossessionOutcome | None:
        """A defender stops the action unfairly: the attack keeps the ball, with a free kick or, in the box, a penalty."""
        attacker, defender, log, cfg, rng = self.attacker, self.defender, self.log, self.cfg, self.rng
        ratings, cards = cfg.engine.player_ratings, cfg.engine.cards
        defensive_zone, defensive_lane = mirror(self.zone, self.lane, cfg)
        fouler = foul_committer(defender, defensive_zone, defensive_lane, cfg, rng).player.id
        victim = (fouled or involved_player(attacker, self.zone, self.lane, True, rng)).player.id
        defender.stats.fouls += 1
        defender.credit(fouler, ratings.foul)
        log.emit("foul", defender, fouler, victim, zone=defensive_zone, lane=defensive_lane)
        if box:
            # The penalty is worth more than the chance the foul stopped.
            given = cfg.engine.penalty.base - (self.stake if self.duel else danger(cfg, self.zone, self.counter))
            defender.threaten(fouler, -given)
            attacker.threaten(victim, given)
        self.duel = None
        if not _book(defender, fouler, cards.penalty if box else cards.foul, defensive_zone, defensive_lane, log, cfg, rng):
            return PossessionOutcome(self.zone, self.lane, False, False, self.played)
        return self.penalty() if box else self.free_kick()

    def attacking_foul(self) -> PossessionOutcome:
        """The attacker fouls in the air: a free kick for the defence where it happened."""
        attacker, cfg = self.attacker, self.cfg
        fouler = foul_committer(attacker, self.zone, self.lane, cfg, self.rng).player.id
        attacker.stats.fouls += 1
        attacker.credit(fouler, cfg.engine.player_ratings.foul)
        self.log.emit("foul", attacker, fouler, zone=self.zone, lane=self.lane)
        _book(attacker, fouler, cfg.engine.cards.foul, self.zone, self.lane, self.log, cfg, self.rng)
        return PossessionOutcome(self.zone, self.lane, False, False, self.played, restart="free_kick")

    def free_kick(self) -> PossessionOutcome | None:
        """Close enough, the free kick is struck at goal or played into the box; elsewhere it restarts the play."""
        attacker, cfg, rng, zone, lane = self.attacker, self.cfg, self.rng, self.zone, self.lane
        rules, dead = cfg.engine.stoppages.free_kick, cfg.engine.stoppages.dead_time
        centre = lane == self.centre
        if zone == self.last_zone:
            kind = "direct" if centre and rng.random() < rules.direct_share else "crossed"
        elif zone == self.last_zone - 1:
            draw = rng.random()
            if centre:
                kind = "direct" if draw < rules.in_range_share * rules.direct_share else "crossed" if draw < rules.in_range_share else "short"
            else:
                kind = "crossed" if draw < rules.wing_crossed_share else "short"
        else:
            kind = "short"
        self.log.emit("free_kick", attacker, zone=zone, lane=lane, detail=kind)
        if kind == "short":
            return self.resume(dead.short_free_kick)
        attacker.stats.free_kicks += 1
        self.set_piece, self.counter, self.opening = True, False, 0.0
        self.log.second += _pause(dead.free_kick, cfg, rng)
        if kind == "direct":
            return self.shoot("free_kick", zone, lane, None)
        self.zone = self.last_zone
        return self.into_box("crossed_free_kick", rules.crossed, rules.cleared_corner_share)

    def penalty(self) -> PossessionOutcome | None:
        self.set_piece, self.counter = True, False
        self.zone, self.lane = self.last_zone, self.centre
        self.log.second += _pause(self.cfg.engine.stoppages.dead_time.penalty, self.cfg, self.rng)
        return self.shoot("penalty", self.zone, self.lane, None)

    def corner(self, cause: str) -> PossessionOutcome | None:
        """A corner on the side the ball went out: met by a head, cleared, caught, or played short, and then the possession
        goes on at the corner of the box."""
        attacker, cfg, rng = self.attacker, self.cfg, self.rng
        self.duel = None
        attacker.stats.corners += 1
        self.set_piece, self.counter, self.opening = True, False, 0.0
        lane = self.lane if self.lane != self.centre else (0 if rng.random() < 0.5 else len(cfg.involvement.lanes) - 1)
        self.zone, self.lane = self.last_zone, lane
        self.log.emit("corner", attacker, zone=self.zone, lane=lane, detail=cause)
        self.log.second += _pause(cfg.engine.stoppages.dead_time.corner, cfg, rng)
        return self.into_box("corner", cfg.engine.stoppages.corner)

    def into_box(self, kind: str, shares, cleared_corner: float = 0.0) -> PossessionOutcome | None:
        """A corner or a free kick played into the box: a header, a clearance (behind for a corner in `cleared_corner` of
        the cases), the keeper's catch; None when played short. A keeper who comes well catches what the defence would
        otherwise have had to clear."""
        claimed = self.claiming(shares.claimed)
        pick = _Draw(self.rng.random())
        if pick.falls(shares.header): return self.shoot(kind, self.last_zone, self.lane, None)
        if pick.falls(max(0.0, shares.cleared + shares.claimed - claimed)):
            if cleared_corner and self.rng.random() < cleared_corner: return self.corner("clearance")
            return self.cleared(self.last_zone, self.lane)
        if pick.falls(claimed): return self.claim()
        return None

    # What follows a shot.

    def shoot(self, kind: str, zone: int, lane: int, carrier, stake: float | None = None, marker=None) -> PossessionOutcome | None:
        """The shot, then a goal kick, the keeper's ball, a corner, a rebound or a second ball. `stake` is the danger the
        side held before the carrier made the chance, `marker` the defender he got the better of."""
        cfg, rng = self.cfg, self.rng
        self.duel = None
        result = resolve_shot(self.attacker, self.defender, zone, lane, self.counter, kind, self.passer, self.log, cfg, rng,
                              carrier, self.set_piece, stake, marker)
        after = cfg.engine.stoppages.after_shot
        if result == "goal": return PossessionOutcome(zone, lane, True, True, self.played, restart="goal")
        if result == "held": return PossessionOutcome(zone, lane, True, False, self.played, restart="keeper")
        if result == "wide": return PossessionOutcome(zone, lane, True, False, self.played, restart="goal_kick")
        self.zone, self.lane = zone, lane
        if result == "save_corner": return self.corner("save")
        if result == "blocked":
            pick = _Draw(rng.random())
            if pick.falls(after.blocked_corner): return self.corner("blocked")
            # A loose ball the attack wins back goes on where the shot was struck.
            if pick.falls(after.second_ball * (1 - after.blocked_corner)): return self.resume(0.0)
            return self.cleared(zone, lane)
        if result == "post" and rng.random() >= after.post_in_play:
            return PossessionOutcome(zone, lane, True, False, self.played, restart="goal_kick")
        # Parried or off the post, the ball drops in the box: first to it strikes again, or clears it.
        if rng.random() < after.rebound:
            self.counter = False
            return self.shoot("rebound", self.last_zone, self.centre, None)
        return self.cleared(self.last_zone, self.centre)


def _chance_kind(carrier: Player, lane: int, counter: bool, opening: float, cfg: Config, rng: Random) -> str:
    """What the carrier tries in the last zone: in the middle a shot, a dribble or a ball in behind, which an open defence
    or a counter makes likelier; on a wing a cross in the air, likelier from a good crosser, or a cutback."""
    creation = cfg.engine.actions.creation
    if lane == len(cfg.involvement.lanes) // 2:
        shares = creation.centre_shares
        through = shares.through_ball * exp(creation.through_opening_pull * opening / cfg.engine.actions.opening.max)
        if counter: through *= creation.counter_through_factor
        value = rng.random() * (shares.shot + shares.dribble + through)
        return "shot" if value < shares.shot else "dribble" if value < shares.shot + shares.dribble else "through_ball"
    shares = creation.wing_shares
    cross = sigmoid(logit(shares.cross / (shares.cross + shares.cutback))
                    + creation.crossing_sensitivity * (carrier.attributes.get("centre") - cfg.engine.chance.cross_reference))
    return "cross" if rng.random() < cross else "cutback"


def dribble_probability(player: Player, cfg: Config) -> float:
    rules = cfg.engine.actions
    attributes = player.attributes
    return sigmoid(logit(rules.dribble_share) + rules.dribble_sensitivity * (attributes.get("technique") - attributes.get("passe")))


def next_possession(outcome: PossessionOutcome, recovering: TeamState, losing: TeamState, log: MatchLog, cfg: Config,
                    rng: Random) -> tuple[int, int, bool, str]:
    """Where the side that now has the ball starts, whether on the counter, and the restart it waits for (see `RESTARTS`)."""
    lanes = len(cfg.involvement.lanes)
    if outcome.goal:
        return 1, lanes // 2, False, "goal"
    last_zone = len(cfg.involvement.zones) - 1
    heights, rules = cfg.formations.block_height, cfg.engine.turnover
    restart = outcome.restart
    if restart in ("goal_kick", "keeper") or outcome.loss == "claim":
        distribution = cfg.engine.keeper_distribution
        quality = recovering.goalkeeper().player.attributes.get("relance")
        probability = sigmoid(logit(distribution.midfield_start_probability)
                              + distribution.distribution_sensitivity * (quality - distribution.reference_level))
        zone = int(rng.random() < probability)
        lane = choose_lane(recovering, losing, zone, cfg, rng)
        if outcome.loss != "claim":
            return zone, lane, False, restart
        restart = "claim"
    else:
        zone, lane = mirror(outcome.zone, outcome.lane, cfg)
        if restart:
            # A throw-in, a free kick or an offside, taken where the ball went dead: the defence had time to get back.
            return zone, lane, False, restart
        if outcome.loss != "clearance":
            probability = sigmoid(logit(heights.advanced_recovery_probability) + recovering.block_height * heights.recovery_bonus)
            if rng.random() < probability: zone = min(last_zone, zone + 1)
    # A counter needs a defence caught out: the higher the ball is won, the likelier, more so when the losing side had
    # gone for it, less after a long ball lost far from the goal it aimed at or a ball the keeper caught.
    chance = (logit(rules.counter_probability_by_zone[zone]) + rules.counter_pace_sensitivity * (recovering.layout.pace - losing.layout.pace)
              + losing.block_height * heights.counter_vulnerability)
    if outcome.committed: chance += rules.committed_counter_bonus
    if outcome.loss == "aerial": chance += rules.long_ball_counter_malus
    if restart == "claim": chance += rules.keeper_counter_malus
    if rng.random() >= sigmoid(chance):
        return zone, lane, False, restart
    if 0 < zone < last_zone:
        # From midfield, the side that lost the ball may stop the counter with a foul, and take the card that goes with it.
        losing_zone, losing_lane = mirror(zone, lane, cfg)
        if rng.random() < cfg.engine.stoppages.foul.tactical * losing.layout.aggression[losing_zone][losing_lane]:
            fouler = foul_committer(losing, losing_zone, losing_lane, cfg, rng).player.id
            victim = involved_player(recovering, zone, lane, True, rng).player.id
            losing.stats.fouls += 1
            losing.credit(fouler, cfg.engine.player_ratings.foul)
            log.emit("foul", losing, fouler, victim, zone=losing_zone, lane=losing_lane, detail="tactical")
            _book(losing, fouler, cfg.engine.cards.tactical, losing_zone, losing_lane, log, cfg, rng)
            return zone, lane, False, "free_kick"
    return min(last_zone, zone + 1), lane, True, restart
