"""Individual shooter/keeper duels, xG and non-overlapping shot outcomes."""
from collections.abc import Sequence
from random import Random

from core.config.model import Config
from core.math import clamp, logit, sigmoid, soften, weighted_choice
from core.domain.matches import LineupSlot
from core.domain.players import Position
from .abilities import weighted_rating, state_multiplier
from .local_state import MatchLog, TeamState
from .zones import credited, involved_player, mirror


def set_piece_taker(team: TeamState) -> LineupSlot:
    """The team's dead-ball specialist: best `cpa` on the pitch, goalkeeper excluded; ties go to the lowest id."""
    candidates = [slot for slot in team.active if slot.position != Position.GOALKEEPER] or team.active
    return max(candidates, key=lambda slot: (slot.player.attributes.get("cpa"), -slot.player.id))


def delivery_quality(slot: LineupSlot, attribute: str, team: TeamState, cfg: Config) -> float:
    return slot.player.attributes.get(attribute) * state_multiplier(slot.player, slot.position, cfg, team.fitness[slot.player.id])


def delivered_xg(xg: float, quality: float, reference: float, cfg: Config) -> float:
    """A better delivery makes the same chance more dangerous; the reference level leaves the average unchanged."""
    rules = cfg.engine.chance
    return sigmoid(logit(clamp(xg, rules.probability_min, rules.probability_max)) + rules.delivery_sensitivity * (quality - reference))


def resolve_shot(attacker: TeamState, defender: TeamState, zone: int, lane: int, counter: bool,
                 kind: str, passer: int | None, log: MatchLog, cfg: Config, rng: Random, carriers: Sequence[int] = ()) -> bool:
    """`carriers` took the ball up the pitch in this possession; `passer` is the last of them, None on a set piece."""
    rules = cfg.engine.chance
    header = kind in ("cross", "corner")
    free_kick_edge = 0.0
    if kind == "corner":
        taker = set_piece_taker(attacker)
        # The specialist is at the flag: he cannot also be the man rising at the far post.
        outfield = [slot for slot in attacker.active if slot.position != Position.GOALKEEPER]
        candidates = [slot for slot in outfield if slot is not taker] or outfield
        shooter = weighted_choice(candidates, [slot.player.attributes.get("jeu_tete") for slot in candidates], rng)
        xg = delivered_xg(cfg.engine.set_pieces.corner_xg, delivery_quality(taker, "cpa", attacker, cfg), rules.set_piece_reference, cfg)
        passer = None
    elif kind == "free_kick":
        shooter = set_piece_taker(attacker)
        free_kick_edge = delivery_quality(shooter, "cpa", attacker, cfg) - rules.free_kick_reference
        xg, passer = cfg.engine.set_pieces.free_kick_xg, None
    elif header:
        crosser = involved_player(attacker, zone, lane, True, rng)
        passer = crosser.player.id
        shooter = involved_player(attacker, zone, len(cfg.involvement.lanes) // 2, True, rng, passer)
        xg = delivered_xg(rules.cross_xg, delivery_quality(crosser, "centre", attacker, cfg), rules.cross_reference, cfg)
    else:
        shooter = involved_player(attacker, zone, lane, True, rng)
        xg = rules.shot_xg * (rules.counter_multiplier if counter else 1)
    keeper = defender.goalkeeper()
    shooting_weights = cfg.attributes.composites.heading if header else cfg.attributes.composites.shooting
    # The dead-ball specialist strikes a direct free kick with his own shot, plus the points his skill exceeds the reference.
    shot_quality = (weighted_rating(shooter.player.attributes, shooting_weights)
                    * state_multiplier(shooter.player, shooter.position, cfg, attacker.fitness[shooter.player.id]) + free_kick_edge)
    keeper_quality = weighted_rating(keeper.player.attributes, cfg.attributes.composites.saving)
    if header:
        weights = rules.header_keeper_weights
        keeper_quality = (weights.saving * keeper_quality + weights.claiming * weighted_rating(keeper.player.attributes, cfg.attributes.composites.claiming))
    keeper_quality *= state_multiplier(keeper.player, keeper.position, cfg, defender.fitness[keeper.player.id])
    xg = clamp(xg, rules.probability_min, rules.probability_max)
    p_goal = sigmoid(logit(xg) + rules.finishing_sensitivity * soften(shot_quality - keeper_quality, cfg.engine.transitions.max_gap))
    p_target = max(p_goal, sigmoid(logit(rules.on_target_probability) + rules.on_target_sensitivity * (shot_quality - rules.on_target_reference)))
    if header:
        # Who put the ball in, for the replay; a corner taker gets no assist, so no other event names him.
        log.emit("delivery", attacker, (taker if kind == "corner" else crosser).player.id, zone=zone, lane=lane, detail=kind)
    log.shots += 1
    shot_id = log.shots
    attacker.stats.shots += 1
    attacker.stats.xg += xg
    log.emit("shot", attacker, shooter.player.id, keeper.player.id, zone, lane, shot_id, xg, kind)
    ratings, credit_rng = cfg.engine.player_ratings, log.attribution
    if kind in ("shot", "cross"):
        # The pass or cross that made an open-play chance, and the rest of the move that led to it.
        if passer is not None and passer != shooter.player.id: attacker.credit(passer, ratings.key_pass)
        for carrier in set(carriers) - {passer, shooter.player.id}: attacker.credit(carrier, ratings.build_up)
    # Where the defence stood: in the middle for a header, since the cross comes in from the wing.
    marking = mirror(zone, len(cfg.involvement.lanes) // 2 if header else lane, cfg)
    value = rng.random()
    if value < p_goal:
        attacker.stats.on_target += 1
        attacker.goals += 1
        attacker.individual[shooter.player.id].goals += 1
        if kind in ("corner", "free_kick"): attacker.stats.set_piece_goals += 1
        if passer == shooter.player.id: passer = None
        if passer is not None and passer in attacker.individual:
            attacker.individual[passer].assists += 1
        defender.credit(keeper.player.id, ratings.keeper_conceded)
        defender.credit(credited(defender, "creation_defense", *marking, False, credit_rng, outfield=True), ratings.beaten)
        log.emit("goal", attacker, shooter.player.id, passer, zone, lane, shot_id, xg, kind)
        return True
    if value < p_target:
        attacker.stats.on_target += 1
        defender.individual[keeper.player.id].saves += 1
        attacker.credit(shooter.player.id, ratings.saved_shot)
        log.emit("save", defender, keeper.player.id, shooter.player.id, zone, lane, shot_id)
        return False
    attacker.credit(shooter.player.id, ratings.off_target)
    # A strike, unlike a header, often misses because a defender threw himself in front of it.
    blocker = None
    if not header and credit_rng.random() < ratings.blocked_share:
        blocker = credited(defender, "creation_defense", *marking, True, credit_rng, outfield=True)
        defender.credit(blocker, ratings.block)
    log.emit("off_target", attacker, shooter.player.id, blocker, zone, lane, shot_id, detail="blocked" if blocker else "")
    return False
