"""Pre-match rotation priorities using observable player information only."""
from collections import Counter

from core.config.model import Config
from core.domain.clubs import Club
from core.domain.date import Date
from core.domain.matches import PlayingTimePriority
from core.domain.players import Player
from core.math import clamp
from core.world.estimates import estimate_potential


def playing_time_priorities(players: list[Player], club: Club, date: Date,
                            seed: int, games_played: int, cfg: Config) -> dict[int, PlayingTimePriority]:
    rules, growth = cfg.states.substitutions, cfg.demography.progression
    ranks = Counter()
    priorities = {}
    for player in sorted(players, key=lambda item: (-item.rating, item.id)):
        rank = ranks[player.position]
        ranks[player.position] += 1
        # Same positional expectations as the morale calculation. No invented
        # playing-time debt before a club has played its first match.
        expected = games_played * cfg.engine.timing.match_seconds / 60 / (rank + 1)
        deficit = clamp(1 - player.season_minutes / expected, 0, 1) if expected else 0
        age = player.born.age_on(date)
        age_factor = next((row.factor for row in growth.age_curve if age <= row.max_age), 0)
        development = 0.0
        if age_factor > 0:
            estimate = estimate_potential(player, date, seed, cfg, club.id, club.reputation)
            margin = clamp((estimate.center - player.rating) / rules.potential_margin_reference, 0, 1)
            playing_gap = clamp(1 - player.monthly_minutes / growth.monthly_reference_minutes, 0, 1)
            development = age_factor * margin * playing_gap * club.personality.youth_preference
        priorities[player.id] = PlayingTimePriority(deficit, development)
    return priorities


def rotation_bonus(priority: PlayingTimePriority, cfg: Config) -> float:
    rules = cfg.states.substitutions
    return rules.playing_time_weight * priority.satisfaction + rules.development_weight * priority.development
