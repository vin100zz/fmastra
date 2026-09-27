"""One possession and the transition to the opponent's local coordinates."""
from dataclasses import dataclass
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


def play_possession(attacker: TeamState, defender: TeamState, zone: int, lane: int, counter: bool,
                    home: bool, log: MatchLog, cfg: Config, rng: Random) -> PossessionOutcome:
    last_zone = len(cfg.involvement.zones) - 1
    ratings, credit_rng = cfg.engine.player_ratings, log.attribution
    passer, carriers = None, []
    while True:
        creation = zone == last_zone
        rules = cfg.engine.transitions
        coefficient = rules.creation_sensitivity if creation else rules.progression_sensitivity
        chance = coefficient * gap(attacker, defender, zone, lane, creation, cfg, counter)
        chance += rules.creation_bias if creation else rules.progression_bias
        if not creation and home: chance += rules.home_bonus
        # A side far ahead manages the score rather than chasing more goals.
        chance -= rules.easing_per_goal * max(0, attacker.goals - defender.goals - rules.comfortable_lead)
        if rng.random() >= sigmoid(chance):
            break
        if creation:
            kind = "shot" if lane == len(cfg.involvement.lanes) // 2 else "cross"
            goal = resolve_shot(attacker, defender, zone, lane, counter, kind, passer, log, cfg, rng, carriers)
            return PossessionOutcome(zone, lane, True, goal)
        creator = involved_player(attacker, zone, lane, True, rng)
        passer = creator.player.id
        carriers.append(passer)
        duel_zone, duel_lane = mirror(zone, lane, cfg)
        zone += 1
        switch = cfg.engine.lanes.switch_probability * (1 + cfg.engine.lanes.switch_vision_weight
                                                        * creator.player.attributes.get("vision") / cfg.attributes.bounds.max)
        if rng.random() < clamp(switch, 0, 1):
            neighbors = [candidate for candidate in (lane - 1, lane + 1) if 0 <= candidate < len(cfg.involvement.lanes)]
            lane = choose_lane(attacker, defender, zone, cfg, rng, neighbors)
        attacker.credit(passer, ratings.progression[zone])
        # A carrier who prefers his feet to his passing takes his marker on rather than passing round him.
        dribbled = None
        if credit_rng.random() < dribble_probability(creator.player, cfg):
            dribbled = credited(defender, "progression_defense", duel_zone, duel_lane, False, credit_rng)
            defender.credit(dribbled, ratings.dribbled)
        # The ball carrier who took the side into the next zone, where the play now stands.
        log.emit("progress", attacker, passer, dribbled, zone=zone, lane=lane, detail="dribble" if dribbled else "")
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
        return PossessionOutcome(zone, lane, False, False)
    if zone >= last_zone - 1:
        stopped = rng.random()
        set_pieces = cfg.engine.set_pieces
        kind = None
        if stopped < set_pieces.corner_probability:
            attacker.stats.corners += 1
            kind = "corner"
        elif stopped < set_pieces.corner_probability + set_pieces.free_kick_probability:
            attacker.stats.free_kicks += 1
            kind = "free_kick"
        if kind:
            log.emit(kind, attacker, zone=zone, lane=lane)
            goal = resolve_shot(attacker, defender, last_zone, lane, False, kind, None, log, cfg, rng)
            return PossessionOutcome(zone, lane, True, goal)
    # The foul, if any, was the tackler's; the ball goes to the best placed, and is lost by the least able.
    creation = zone == last_zone
    winner = credited(defender, "creation_defense" if creation else "progression_defense", defensive_zone, defensive_lane, True, credit_rng)
    loser = credited(attacker, "creation_attack" if creation else "progression_attack", zone, lane, False, credit_rng)
    defender.credit(winner, ratings.recovery[defensive_zone])
    attacker.credit(loser, ratings.loss[zone])
    log.emit("turnover", defender, winner, loser, zone=defensive_zone, lane=defensive_lane)
    return PossessionOutcome(zone, lane, False, False)


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
    zone, lane = mirror(outcome.zone, outcome.lane, cfg)
    heights = cfg.formations.block_height
    probability = sigmoid(logit(heights.advanced_recovery_probability) + recovering.block_height * heights.recovery_bonus)
    if rng.random() < probability: zone = min(len(cfg.involvement.zones) - 1, zone + 1)
    threshold = cfg.involvement.zones.index(cfg.engine.turnover.counter_zone)
    counter = zone >= threshold
    if not counter:
        attack_pace = sum(slot.player.attributes.get("vitesse") for slot in recovering.active) / len(recovering.active)
        defense_pace = sum(slot.player.attributes.get("vitesse") for slot in losing.active) / len(losing.active)
        rules = cfg.engine.turnover
        probability = sigmoid(logit(rules.low_counter_probability) + rules.counter_pace_sensitivity * (attack_pace - defense_pace)
                              + losing.block_height * heights.counter_vulnerability)
        counter = rng.random() < probability
        if counter: zone = min(len(cfg.involvement.zones) - 1, zone + 1)
    return zone, lane, counter
