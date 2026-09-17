"""Daily availability, match consequences and monthly progression decisions."""
from random import Random

from core.config.model import Config
from core.domain.date import Date
from core.domain.players import Attributes, ATTRIBUTE_NAMES, Player, Injury, Position
from core.domain.world import World
from core.domain.matches import Match, MatchResult
from core.engine.abilities import overall, recenter
from core.engine.fitness import recovered_fitness
from core.math import clamp, weighted_choice
from .events import PlayerChanged, MatchPlayed


def draw_injury(date: Date, cfg: Config, rng: Random) -> Injury:
    options = cfg.states.injuries.severities
    severity = weighted_choice(options, [row.share for row in options], rng)
    return Injury(date, date.add_days(rng.randint(severity.min_days, severity.max_days)), severity.name)


def daily_player_events(world: World) -> list[PlayerChanged]:
    cfg, rng = world.config, world.rngs["states"]
    events = []
    for player in world.players.values():
        active = player.club_id is not None and world.clubs[player.club_id].competition_id is not None
        if player.injury:
            if player.injury.end <= world.date:
                attributes = player.attributes
                rules = cfg.states.injuries.permanent_penalty
                if not player.injury.penalty_applied and player.injury.end.ordinal() - player.injury.start.ordinal() >= rules.min_duration_days and player.born.age_on(world.date) >= rules.min_age:
                    loss = rng.uniform(rules.min_points, rules.max_points)
                    attributes = Attributes(tuple(max(cfg.attributes.bounds.min, value - loss) if name in rules.affected_attributes else value
                                                  for name, value in zip(ATTRIBUTE_NAMES, attributes.values)))
                events.append(PlayerChanged(player.id, attributes, overall(attributes, player.position, cfg),
                                            cfg.states.fitness.injury_return_fitness, cfg.states.injuries.injury_return_form, healed=True))
            continue
        if active and rng.random() < cfg.states.injuries.daily_probability:
            events.append(PlayerChanged(player.id, injury=draw_injury(world.date, cfg, rng)))
        elif player.fitness < cfg.states.fitness.max:
            events.append(PlayerChanged(player.id, fitness=recovered_fitness(player, player.born.age_on(world.date), cfg)))
    return events


def monthly_player_events(world: World) -> list[PlayerChanged]:
    cfg, rng = world.config, world.rngs["progression"]
    rules = cfg.demography.progression
    changes = []
    decay_vectors = {position: tuple(rules.decline_weights[name] / sum(weight * rules.decline_weights[key]
                       for key, weight in cfg.attributes.overall[position].items()) for name in ATTRIBUTE_NAMES)
                     for position in Position}
    for player in world.players.values():
        age = player.born.age_on(world.date)
        row = next((row for row in rules.age_curve if age <= row.max_age), rules.age_curve[-1])
        active = player.club_id is not None and world.clubs[player.club_id].competition_id is not None
        playing = (rules.min_playing_factor + (1 - rules.min_playing_factor) * min(player.monthly_minutes / rules.monthly_reference_minutes, 1)) if active else rules.external_playing_factor
        growth = row.factor * playing * max(0, player.potential - player.rating) / cfg.attributes.bounds.max * rules.amplitude
        decline_age = age - rules.decline.goalkeeper_age_shift if player.position == Position.GOALKEEPER else age
        decay = next((row.points_per_month for row in rules.decline.age_curve if decline_age <= row.max_age), rules.decline.age_curve[-1].points_per_month)
        noise = rng.gauss(0, rules.noise)
        values = tuple(clamp(value + growth + noise - decay * weight,
                             cfg.attributes.bounds.min, cfg.attributes.bounds.max) for weight, value in zip(decay_vectors[player.position], player.attributes.values))
        attributes = Attributes(values)
        rating = overall(attributes, player.position, cfg)
        if rating > player.potential:
            attributes = recenter(values, player.potential, player.position, cfg)
            rating = overall(attributes, player.position, cfg)
        changes.append(PlayerChanged(player.id, attributes, rating, reset_month=True))
    return changes


def match_event(world: World, match: Match, result: MatchResult) -> MatchPlayed:
    cfg, rng = world.config, world.rngs["states"]
    injuries, suspensions, forms = {}, {}, {}
    for event in result.events:
        if event.kind == "injury" and event.player_id not in result.temporary_players:
            injuries[event.player_id] = draw_injury(world.date, cfg, rng)
    for pid, stats in result.player_stats.items():
        if pid in result.temporary_players:
            continue
        player = world.players[pid]
        if stats.rating is not None:
            rules = cfg.states.form
            target = 1 + rules.rating_sensitivity * (stats.rating - rules.reference_rating)
            forms[pid] = clamp(player.form + rules.convergence_speed * (target - player.form) + rng.gauss(0, rules.noise), rules.min, rules.max)
        durations = []
        rules = cfg.states.suspensions
        if stats.red:
            durations.append(rng.randint(rules.red_min_matches, rules.red_max_matches) if stats.direct_red else rules.second_yellow_matches)
        discipline = player.discipline.get(match.competition_id)
        cumulative = (discipline.yellows if discipline else 0) + stats.yellows
        for threshold in rules.yellow_thresholds:
            if cumulative >= threshold.yellows and (not discipline or threshold.yellows not in discipline.served_thresholds):
                durations.append(threshold.matches)
        if durations: suspensions[pid] = max(durations)
    return MatchPlayed(match.id, result, injuries, suspensions, forms)
