"""One possession, action after action, and the transition to the opponent's local coordinates."""
from dataclasses import dataclass
from math import exp
from random import Random

from core.config.model import Config
from core.domain.players import Player
from core.math import clamp, sigmoid, logit
from .local_state import MatchLog, TeamState
from .personnel import dismiss
from .shots import resolve_shot
from .zones import credited, foul_committer, gap, involved_player, mirror, choose_lane


@dataclass(frozen=True, slots=True)
class PossessionOutcome:
    zone: int
    lane: int
    shot: bool
    goal: bool
    # The seconds of play the possession lasted, dead ball excluded.
    seconds: float = 0
    # How the ball was lost: "interception", "tackle", "aerial" or "clearance"; empty after a shot or the whistle.
    loss: str = ""
    # Lost while the side went for it (a try that failed, a corner cleared): its players are caught upfield.
    committed: bool = False
    whistle: bool = False


def play_possession(attacker: TeamState, defender: TeamState, zone: int, lane: int, counter: bool,
                    home: bool, log: MatchLog, cfg: Config, rng: Random, deadline: float = float("inf")) -> PossessionOutcome:
    """The side keeps the ball or tries something, one action at a time. Every pass kept opens the defence a little more,
    which draws the side forward; the referee ends the half at the first pass kept once `deadline` has passed."""
    actions, rules, ratings = cfg.engine.actions, cfg.engine.transitions, cfg.engine.player_ratings
    keeping, opening_rules, durations = actions.conservation, actions.opening, actions.durations
    last_zone, lanes = len(cfg.involvement.zones) - 1, len(cfg.involvement.lanes)
    credit_rng, stats = log.attribution, attacker.stats
    # A side far ahead manages the score: it tries less and keeps the ball.
    easing = rules.easing_per_goal * max(0, attacker.goals - defender.goals - rules.comfortable_lead)
    opening, played, series = 0.0, 0.0, 0
    passer, carriers = None, []
    while True:
        # How much better this side keeps the ball here than its opponent does at the same place of its own half: nil
        # between equals, whatever their formations.
        edge = gap(attacker, defender, zone, lane, False, cfg, counter) - gap(defender, attacker, zone, lane, False, cfg)
        if counter:
            tempo = actions.counter_tempo
        else:
            tempo = actions.tempo_by_zone[zone]
            tempo += (1 - tempo) * actions.opening_pull * opening / opening_rules.max
            # The side on top takes its time; the side under pressure hurries.
            shift = easing + actions.patience * edge
            if shift: tempo = sigmoid(logit(tempo) - shift)
        draw = rng.random()
        if draw < 1 - tempo:
            if log.second >= deadline:
                if series: log.emit("circulation", attacker, zone=zone, lane=lane, detail=str(series))
                return PossessionOutcome(zone, lane, False, False, played, whistle=True)
            keep = sigmoid(keeping.bias_by_zone[zone] + keeping.sensitivity * edge)
            stats.passes_attempted += 1
            if draw >= (1 - tempo) * keep:
                if series: log.emit("circulation", attacker, zone=zone, lane=lane, detail=str(series))
                log.second += durations.pass_
                return _lost(attacker, defender, zone, lane, "interception", False, played + durations.pass_, log, cfg)
            log.second += durations.pass_
            played += durations.pass_
            stats.passes += 1
            series += 1
            opening = min(opening_rules.max, opening + opening_rules.gain_per_pass)
            # The defence had the time to get back in shape.
            counter = False
            move = rng.random()
            if move < keeping.lateral_share:
                neighbors = [candidate for candidate in (lane - 1, lane + 1) if 0 <= candidate < lanes]
                lane = neighbors[0] if len(neighbors) == 1 else choose_lane(attacker, defender, zone, cfg, rng, neighbors)
            elif move < keeping.lateral_share + keeping.back_share_by_zone[zone]:
                zone -= 1
            continue
        if series:
            log.emit("circulation", attacker, zone=zone, lane=lane, detail=str(series))
            series = 0
        # The carrier decides what he tries; the zones decide whether it comes off.
        carrier = involved_player(attacker, zone, lane, True, rng)
        attributes = carrier.player.attributes
        if zone == last_zone:
            log.second += durations.chance
            played += durations.chance
            kind = _chance_kind(carrier.player, lane, counter, opening, cfg, rng)
            chance = (rules.creation_sensitivity * gap(attacker, defender, zone, lane, True, cfg, counter)
                      + rules.creation_bias + opening)
            if rng.random() < sigmoid(chance):
                carriers.append(carrier.player.id)
                goal = resolve_shot(attacker, defender, zone, lane, counter, kind, passer, log, cfg, rng, carriers, carrier)
                return PossessionOutcome(zone, lane, True, goal, played)
            return _failed(attacker, defender, zone, lane, "tackle" if kind == "dribble" else "interception", played, log, cfg, rng)
        long_ball, long_shot = actions.long_ball, actions.long_shot
        if (zone < len(long_ball.share_by_zone) and rng.random()
                < sigmoid(logit(long_ball.share_by_zone[zone])
                          + long_ball.passing_sensitivity * (attributes.get("passe") - long_ball.passing_reference))):
            # Over the next line, to a team-mate who must win the ball in the air.
            log.second += durations.long_ball
            played += durations.long_ball
            stats.passes_attempted += 1
            zone += 2
            lane = choose_lane(attacker, defender, zone, cfg, rng)
            if rng.random() >= sigmoid(long_ball.bias + rules.progression_sensitivity * gap(attacker, defender, zone, lane, False, cfg, counter)):
                return _lost(attacker, defender, zone, lane, "aerial", False, played, log, cfg)
            stats.passes += 1
            passer = carrier.player.id
            carriers.append(passer)
            opening = 0.0
            attacker.credit(passer, ratings.progression[zone])
            log.emit("progress", attacker, passer, zone=zone, lane=lane, detail="long")
            continue
        if (zone == last_zone - 1 and lane == lanes // 2 and rng.random()
                < sigmoid(logit(long_shot.share) + long_shot.opening_effect * opening / opening_rules.max
                          + long_shot.finishing_sensitivity * (attributes.get("finition") - long_shot.finishing_reference))):
            # A defence still in place leaves only the strike from distance.
            log.second += durations.chance
            played += durations.chance
            goal = resolve_shot(attacker, defender, zone, lane, counter, "long_shot", passer, log, cfg, rng, carriers, carrier)
            return PossessionOutcome(zone, lane, True, goal, played)
        log.second += durations.progression
        played += durations.progression
        # What the move looks like is drawn on the ratings' stream: it changes nothing in play.
        label = ("dribble" if credit_rng.random() < dribble_probability(carrier.player, cfg)
                 else "carry" if credit_rng.random() < actions.carry_share else "pass")
        if label == "pass": stats.passes_attempted += 1
        chance = (rules.progression_sensitivity * gap(attacker, defender, zone, lane, False, cfg, counter)
                  + rules.progression_bias + opening + (rules.home_bonus if home else 0))
        if rng.random() >= sigmoid(chance):
            return _failed(attacker, defender, zone, lane, "interception" if label == "pass" else "tackle", played, log, cfg, rng)
        if label == "pass": stats.passes += 1
        passer = carrier.player.id
        carriers.append(passer)
        duel_zone, duel_lane = mirror(zone, lane, cfg)
        zone += 1
        opening *= opening_rules.kept_after_progression
        switch = cfg.engine.lanes.switch_probability * (1 + cfg.engine.lanes.switch_vision_weight
                                                        * attributes.get("vision") / cfg.attributes.bounds.max)
        if rng.random() < clamp(switch, 0, 1):
            neighbors = [candidate for candidate in (lane - 1, lane + 1) if 0 <= candidate < lanes]
            lane = choose_lane(attacker, defender, zone, cfg, rng, neighbors)
        attacker.credit(passer, ratings.progression[zone])
        # A carrier who prefers his feet to his passing takes his marker on rather than passing round him.
        dribbled = None
        if label == "dribble":
            dribbled = credited(defender, "progression_defense", duel_zone, duel_lane, False, credit_rng)
            defender.credit(dribbled, ratings.dribbled)
        # The ball carrier who took the side into the next zone, where the play now stands.
        log.emit("progress", attacker, passer, dribbled, zone=zone, lane=lane, detail=label)


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


def _failed(attacker: TeamState, defender: TeamState, zone: int, lane: int, loss: str, played: float, log: MatchLog,
            cfg: Config, rng: Random) -> PossessionOutcome:
    """A try that did not come off: the duel may cost the defender a card, and near goal give a corner or a free kick."""
    last_zone = len(cfg.involvement.zones) - 1
    defensive_zone, defensive_lane = mirror(zone, lane, cfg)
    tackler = foul_committer(defender, defensive_zone, defensive_lane, cfg, rng)
    cards = cfg.engine.cards
    modifier = cards.defense_zone_weight if defensive_zone == 0 else 1
    yellow_modifier = modifier * (cards.booked_caution_multiplier if defender.individual[tackler.player.id].yellows else 1)
    card = rng.random()
    if card < cards.red_probability * modifier:
        dismiss(defender, tackler.player.id, log, cfg, True)
    elif card < cards.red_probability * modifier + cards.yellow_probability * yellow_modifier:
        defender.stats.yellows += 1
        defender.individual[tackler.player.id].yellows += 1
        log.emit("yellow", defender, tackler.player.id, zone=defensive_zone, lane=defensive_lane)
        if defender.individual[tackler.player.id].yellows >= 2:
            dismiss(defender, tackler.player.id, log, cfg, False)
    if len(defender.active) < cfg.world.match_rules.min_players:
        return PossessionOutcome(zone, lane, False, False, played)
    if zone >= last_zone - 1:
        stopped = rng.random()
        set_pieces, dead = cfg.engine.set_pieces, cfg.engine.actions.dead_time
        if stopped < set_pieces.corner_probability:
            attacker.stats.corners += 1
            log.emit("corner", attacker, zone=zone, lane=lane)
            log.second += dead.corner
            if rng.random() < set_pieces.corner_shot_share:
                goal = resolve_shot(attacker, defender, last_zone, lane, False, "corner", None, log, cfg, rng)
                return PossessionOutcome(zone, lane, True, goal, played)
            # Headed away from the box: the defending side starts again from its own end, the attackers still upfield.
            centre = len(cfg.involvement.lanes) // 2
            winner = credited(defender, "creation_defense", 0, centre, True, log.attribution)
            defender.credit(winner, cfg.engine.player_ratings.recovery[0])
            log.emit("turnover", defender, winner, zone=0, lane=centre, detail="clearance")
            return PossessionOutcome(last_zone, lane, False, False, played, "clearance", True)
        if stopped < set_pieces.corner_probability + set_pieces.free_kick_probability:
            attacker.stats.free_kicks += 1
            log.emit("free_kick", attacker, zone=zone, lane=lane)
            log.second += dead.free_kick
            goal = resolve_shot(attacker, defender, last_zone, lane, False, "free_kick", None, log, cfg, rng)
            return PossessionOutcome(zone, lane, True, goal, played)
    return _lost(attacker, defender, zone, lane, loss, True, played, log, cfg)


def _lost(attacker: TeamState, defender: TeamState, zone: int, lane: int, loss: str, committed: bool, played: float,
          log: MatchLog, cfg: Config) -> PossessionOutcome:
    """The ball goes to the best placed, and is lost by the least able; the action itself was decided by the zones."""
    ratings, credit_rng = cfg.engine.player_ratings, log.attribution
    creation = zone == len(cfg.involvement.zones) - 1
    defensive_zone, defensive_lane = mirror(zone, lane, cfg)
    winner = credited(defender, "creation_defense" if creation else "progression_defense", defensive_zone, defensive_lane, True, credit_rng)
    loser = credited(attacker, "creation_attack" if creation else "progression_attack", zone, lane, False, credit_rng)
    defender.credit(winner, ratings.recovery[defensive_zone])
    attacker.credit(loser, ratings.loss[zone])
    log.emit("turnover", defender, winner, loser, zone=defensive_zone, lane=defensive_lane, detail=loss)
    return PossessionOutcome(zone, lane, False, False, played, loss, committed)


def dribble_probability(player: Player, cfg: Config) -> float:
    rules = cfg.engine.player_ratings
    attributes = player.attributes
    return sigmoid(logit(rules.dribble_share) + rules.dribble_sensitivity * (attributes.get("technique") - attributes.get("passe")))


def next_possession(outcome: PossessionOutcome, recovering: TeamState, losing: TeamState, cfg: Config,
                    rng: Random) -> tuple[int, int, bool]:
    if outcome.goal:
        return 1, len(cfg.involvement.lanes) // 2, False
    if outcome.shot:
        rules = cfg.engine.keeper_distribution
        quality = recovering.goalkeeper().player.attributes.get("relance")
        probability = sigmoid(logit(rules.midfield_start_probability) + rules.distribution_sensitivity * (quality - rules.reference_level))
        zone = int(rng.random() < probability)
        return zone, choose_lane(recovering, losing, zone, cfg, rng), False
    last_zone = len(cfg.involvement.zones) - 1
    zone, lane = mirror(outcome.zone, outcome.lane, cfg)
    heights, rules = cfg.formations.block_height, cfg.engine.turnover
    if outcome.loss != "clearance":
        probability = sigmoid(logit(heights.advanced_recovery_probability) + recovering.block_height * heights.recovery_bonus)
        if rng.random() < probability: zone = min(last_zone, zone + 1)
    # A counter needs a defence caught out: the higher the ball is won, the likelier, more so when the losing side had
    # gone for it, less after a long ball lost far from the goal it aimed at.
    chance = (logit(rules.counter_probability_by_zone[zone]) + rules.counter_pace_sensitivity * (recovering.layout.pace - losing.layout.pace)
              + losing.block_height * heights.counter_vulnerability)
    if outcome.committed: chance += rules.committed_counter_bonus
    if outcome.loss == "aerial": chance += rules.long_ball_counter_malus
    counter = rng.random() < sigmoid(chance)
    if counter: zone = min(last_zone, zone + 1)
    return zone, lane, counter
