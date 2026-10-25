"""Pre-match rotation priorities using observable player information only."""
from collections import Counter

from core.config.model import Config
from core.domain.clubs import Club
from core.domain.date import Date
from core.domain.matches import PlayingTimePriority
from core.domain.players import Player
from core.math import clamp
from core.world.estimates import estimate_potential


def playing_time_priorities(players: list[Player], club: Club, date: Date, seed: int, games_played: int, cfg: Config,
                            arrivals: dict[int, tuple[int, float]] | None = None) -> dict[int, PlayingTimePriority]:
    growth = cfg.demography.progression
    ranks = Counter()
    priorities = {}
    for player in sorted(players, key=lambda item: (-item.rating, item.id)):
        rank = ranks[player.position]
        ranks[player.position] += 1
        # Same positional expectations as the morale calculation, counted since he came for a player who joined during
        # the season. No invented playing-time debt before a club has played its first match.
        games, minutes = (arrivals or {}).get(player.id, (games_played, player.season_minutes))
        expected = games * cfg.engine.timing.match_seconds / 60 / (rank + 1)
        deficit = clamp(1 - minutes / expected, 0, 1) if expected else 0
        development = 0.0
        if margin := prospect(player, club, date, seed, cfg):
            playing_gap = clamp(1 - player.monthly_minutes / growth.monthly_reference_minutes, 0, 1)
            development = margin * playing_gap * club.personality.youth_preference
        priorities[player.id] = PlayingTimePriority(deficit, development)
    return priorities


def prospect(player: Player, club: Club, date: Date, seed: int, cfg: Config) -> float:
    """How much a player has yet to grow as his club sees him, from 0 to 1: the share of progression his age still
    allows, times the margin of his estimated potential over his level. 0 past the age of progression."""
    age = player.born.age_on(date)
    age_factor = next((row.factor for row in cfg.demography.progression.age_curve if age <= row.max_age), 0)
    if age_factor <= 0:
        return 0.0
    estimate = estimate_potential(player, date, seed, cfg, club.id, club.reputation)
    return age_factor * clamp((estimate.center - player.rating) / cfg.states.substitutions.potential_margin_reference, 0, 1)


def rotation_bonus(priority: PlayingTimePriority, cfg: Config) -> float:
    rules = cfg.states.substitutions
    return rules.playing_time_weight * priority.satisfaction + rules.development_weight * priority.development
