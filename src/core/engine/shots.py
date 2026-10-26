"""Individual shooter/keeper duels, xG and non-overlapping shot outcomes."""
from random import Random

from core.config.model import Config
from core.math import clamp, logit, sigmoid, soften, weighted_choice
from core.domain.matches import LineupSlot
from core.domain.players import Player, Position
from .abilities import weighted_rating, state_multiplier
from .local_state import MatchLog, TeamState
from .zones import credited, involved_player, mirror


# Headers: a cross met in the air, a corner, a free kick played into the box. Open play: every chance made by a move. Set
# pieces: the chances a dead ball gives.
HEADERS = frozenset({"cross", "corner", "crossed_free_kick"})
OPEN_PLAY = frozenset({"shot", "long_shot", "dribble", "through_ball", "cross", "cutback", "rebound"})
SET_PIECES = frozenset({"corner", "crossed_free_kick", "free_kick", "penalty"})


def set_piece_taker(team: TeamState) -> LineupSlot:
    """The team's dead-ball specialist: best `cpa` on the pitch, goalkeeper excluded; ties go to the lowest id."""
    candidates = [slot for slot in team.active if slot.position != Position.GOALKEEPER] or team.active
    return max(candidates, key=lambda slot: (slot.player.attributes.get("cpa"), -slot.player.id))


def penalty_skill(player: Player, cfg: Config) -> float:
    """A taker's quality from the spot: the `penalty` composite, mostly the attribute of that name."""
    return weighted_rating(player.attributes, cfg.attributes.composites.penalty)


def penalty_taker(team: TeamState, cfg: Config) -> LineupSlot:
    """The best penalty taker on the pitch, as in a shoot-out, goalkeeper excluded; ties go to the lowest id."""
    candidates = [slot for slot in team.active if slot.position != Position.GOALKEEPER] or team.active
    return max(candidates, key=lambda slot: (penalty_skill(slot.player, cfg), -slot.player.id))


def penalty_probability(taker: Player, keeper: Player, cfg: Config) -> float:
    """A penalty's chance of a goal, in the match as in a shoot-out: the taker's skill against the keeper's reflexes."""
    rules = cfg.engine.penalty
    return clamp(rules.base + rules.sensitivity * (penalty_skill(taker, cfg) - keeper.attributes.get("reflexes")),
                 rules.min, rules.max)


def delivery_quality(slot: LineupSlot, attribute: str, team: TeamState, cfg: Config) -> float:
    return slot.player.attributes.get(attribute) * state_multiplier(slot.player, slot.position, cfg, team.fitness[slot.player.id])


def delivered_xg(xg: float, quality: float, reference: float, cfg: Config) -> float:
    """A better delivery makes the same chance more dangerous; the reference level leaves the average unchanged."""
    rules = cfg.engine.chance
    return sigmoid(logit(clamp(xg, rules.probability_min, rules.probability_max)) + rules.delivery_sensitivity * (quality - reference))


def resolve_shot(attacker: TeamState, defender: TeamState, zone: int, lane: int, counter: bool,
                 kind: str, passer: int | None, log: MatchLog, cfg: Config, rng: Random,
                 carrier: LineupSlot | None = None, set_piece: bool = False, stake: float | None = None,
                 marker: LineupSlot | None = None) -> str:
    """`passer` is the last one named before the chance, None on a set piece; `carrier` made the chance: he crosses, plays
    the ball in, takes his man on or strikes from distance; `set_piece` says a corner, a free kick or a penalty came before
    it in the possession. A chance made in play is worth to its maker what its xG adds to `stake`, the danger his side held
    before, and costs `marker`, the defender he beat, his share of it.

    Returns what became of the shot: "goal"; "held", "save_corner" or "parried" when the keeper saved it; "blocked",
    "post" or "wide" when it missed."""
    rules = cfg.engine.chance
    header = kind in HEADERS
    centre = len(cfg.involvement.lanes) // 2
    free_kick_edge, server = 0.0, None
    if kind in ("corner", "crossed_free_kick"):
        taker = set_piece_taker(attacker)
        # The specialist delivers the ball: he cannot also be the man rising at the far post.
        outfield = [slot for slot in attacker.active if slot.position != Position.GOALKEEPER]
        candidates = [slot for slot in outfield if slot is not taker] or outfield
        shooter = weighted_choice(candidates, [slot.player.attributes.get("jeu_tete") for slot in candidates], rng)
        xg = delivered_xg(cfg.engine.set_pieces.corner_xg, delivery_quality(taker, "cpa", attacker, cfg), rules.set_piece_reference, cfg)
        passer, server = None, taker
    elif kind == "free_kick":
        shooter = set_piece_taker(attacker)
        free_kick_edge = delivery_quality(shooter, "cpa", attacker, cfg) - rules.free_kick_reference
        xg, passer = cfg.engine.set_pieces.free_kick_xg, None
    elif kind == "penalty":
        shooter, passer = penalty_taker(attacker, cfg), None
        xg = cfg.engine.penalty.base
        log.emit("penalty", attacker, shooter.player.id, zone=zone, lane=lane)
    elif kind == "rebound":
        # The ball dropped in the box after a save or off the post: whoever is there strikes first time.
        shooter, passer = involved_player(attacker, zone, centre, True, rng), None
        xg = rules.rebound_xg
    elif kind in ("cross", "cutback"):
        # From the wing to a team-mate in the middle, in the air or along the ground; the service makes the chance.
        server = carrier or involved_player(attacker, zone, lane, True, rng)
        passer = server.player.id
        shooter = involved_player(attacker, zone, centre, True, rng, passer)
        xg = delivered_xg(rules.cross_xg if kind == "cross" else rules.cutback_xg,
                          delivery_quality(server, "centre", attacker, cfg), rules.cross_reference, cfg)
    elif kind == "through_ball":
        server = carrier or involved_player(attacker, zone, lane, True, rng)
        passer = server.player.id
        shooter = involved_player(attacker, zone, centre, True, rng, passer)
        xg = rules.through_ball_xg * (rules.counter_multiplier if counter else 1)
    elif kind in ("dribble", "long_shot"):
        shooter = carrier or involved_player(attacker, zone, lane, True, rng)
        xg = rules.dribble_xg if kind == "dribble" else rules.long_shot_xg
    else:
        shooter = involved_player(attacker, zone, lane, True, rng)
        if carrier is not None and carrier.player.id != shooter.player.id:
            passer, server = carrier.player.id, carrier
        xg = rules.shot_xg * (rules.counter_multiplier if counter else 1)
    keeper = defender.goalkeeper()
    xg = clamp(xg, rules.probability_min, rules.probability_max)
    if kind == "penalty":
        # The rule of the shoot-out; a penalty missed is saved, but for those put wide.
        p_goal = penalty_probability(shooter.player, keeper.player, cfg)
        p_target = p_goal + (1 - p_goal) * (1 - cfg.engine.penalty.off_target_share)
    else:
        shooting_weights = cfg.attributes.composites.heading if header else cfg.attributes.composites.shooting
        # The dead-ball specialist strikes a direct free kick with his own shot, plus the points his skill exceeds the
        # reference. The shooter's fatigue stays out of the duel: the keeper barely tires, and a tired shooter facing him
        # would make goals rarer as the match goes on. Fatigue weighs on the chance itself, through the zones that make
        # and stop it.
        shot_quality = (weighted_rating(shooter.player.attributes, shooting_weights)
                        * state_multiplier(shooter.player, shooter.position, cfg, 1.0) + free_kick_edge)
        keeper_quality = weighted_rating(keeper.player.attributes, cfg.attributes.composites.saving)
        if header or kind == "through_ball":
            # In the air or one on one, the keeper first has to come for the ball.
            weights = rules.header_keeper_weights if header else rules.one_on_one_keeper_weights
            keeper_quality = (weights.saving * keeper_quality + weights.claiming * weighted_rating(keeper.player.attributes, cfg.attributes.composites.claiming))
        keeper_quality *= state_multiplier(keeper.player, keeper.position, cfg, defender.fitness[keeper.player.id])
        p_goal = sigmoid(logit(xg) + rules.finishing_sensitivity * soften(shot_quality - keeper_quality, cfg.engine.transitions.max_gap))
        p_target = max(p_goal, sigmoid(logit(rules.on_target_probability) + rules.on_target_sensitivity * (shot_quality - rules.on_target_reference)))
    if server is not None:
        # Who put the ball in, for the replay; a set-piece taker gets no assist, so no other event names him.
        log.emit("delivery", attacker, server.player.id, zone=zone, lane=lane, detail=kind)
    log.shots += 1
    shot_id = log.shots
    attacker.stats.shots += 1
    attacker.stats.xg += xg
    log.emit("shot", attacker, shooter.player.id, keeper.player.id, zone, lane, shot_id, xg, kind)
    ratings, credit_rng = cfg.engine.player_ratings, log.attribution
    if stake is not None and carrier is not None:
        made = xg - stake
        attacker.threaten(carrier.player.id, made)
        if marker is not None: defender.threaten(marker.player.id, -ratings.beaten_share * made)
    # The shooter answers for what he makes of the chance, the keeper for what he makes of a shot on target, against the
    # share of those that go in.
    stopping = min(rules.probability_max, xg / p_target) if p_target > 0 else rules.probability_max
    weight = ratings.shot_share
    # Where the defence stood: in the middle when the ball comes in from the wing.
    marking = mirror(zone, centre if header or kind == "cutback" else lane, cfg)
    value = rng.random()
    if value < p_goal:
        attacker.stats.on_target += 1
        attacker.goals += 1
        attacker.individual[shooter.player.id].goals += 1
        if set_piece or kind in SET_PIECES: attacker.stats.set_piece_goals += 1
        if passer == shooter.player.id: passer = None
        if passer is not None and passer in attacker.individual:
            attacker.individual[passer].assists += 1
        attacker.threaten(shooter.player.id, weight * (1 - xg))
        defender.threaten(keeper.player.id, weight * (stopping - 1))
        log.emit("goal", attacker, shooter.player.id, passer, zone, lane, shot_id, xg, kind)
        return "goal"
    attacker.threaten(shooter.player.id, -weight * xg)
    if value < p_target:
        attacker.stats.on_target += 1
        defender.individual[keeper.player.id].saves += 1
        defender.threaten(keeper.player.id, weight * stopping)
        # Held, pushed behind for a corner, or parried back into the box.
        save, draw = cfg.engine.stoppages.after_shot.save, rng.random()
        detail = "held" if draw < save.held else "corner" if draw < save.held + save.corner else "parried"
        log.emit("save", defender, keeper.player.id, shooter.player.id, zone, lane, shot_id, detail=detail)
        return "save_corner" if detail == "corner" else detail
    # A strike, unlike a header or a penalty, often misses because a defender threw himself in front of it; one that gets
    # past him may hit the woodwork. The shot's own draw, made uniform again over its misses, decides which.
    miss = (value - p_target) / (1 - p_target)
    after = cfg.engine.stoppages.after_shot
    blocked = 0.0 if header or kind == "penalty" else after.long_shot_blocked_share if kind == "long_shot" else after.blocked_share
    if miss < blocked:
        blocker = credited(defender, "creation_defense", *marking, True, credit_rng, outfield=True)
        defender.threaten(blocker, weight * xg)
        log.emit("off_target", attacker, shooter.player.id, blocker, zone, lane, shot_id, detail="blocked")
        return "blocked"
    post = (miss - blocked) / (1 - blocked) < after.post_share
    log.emit("off_target", attacker, shooter.player.id, None, zone, lane, shot_id, detail="post" if post else "")
    return "post" if post else "wide"
