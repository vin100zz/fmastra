"""What a season's competitions pay each club: read from its matches, no randomness, no file access."""
from collections import defaultdict

from core.domain.clubs import Club
from core.domain.world import World


def league_place(world: World, club: Club, played: dict[int, tuple[int, int, int]]) -> float | None:
    """Where a club stands for its championship's money, from 0 for the first to 1 for the last; None without a championship.

    `played` holds, for each club ranked last season, its championship, its index in the table and the size of the
    table. A club that stays takes its rank; one that comes up takes the last place, one that comes down the first.
    """
    league = world.competitions.get(club.competition_id) if club.competition_id is not None else None
    if league is None: return None
    before = played.get(club.id)
    if before is None: return 1.0
    competition_id, index, size = before
    if competition_id == league.id: return index / (size - 1) if size > 1 else 0.5
    return 1.0 if league.level < world.competitions[competition_id].level else 0.0


def came_down(world: World, club: Club, played: dict[int, tuple[int, int, int]]) -> bool:
    """Whether a club ranked last season (see `league_place`) plays a lower championship now, or none at all."""
    before = played.get(club.id)
    if before is None: return False
    league = world.competitions.get(club.competition_id) if club.competition_id is not None else None
    return league is None or league.level > world.competitions[before[0]].level


def europe_prizes(world: World) -> dict[int, int]:
    """Prize money of the European season just played, by club: taking part, each win and draw of the league phase,
    each knockout round reached (a club qualified directly is paid the play-offs it skipped) and the title."""
    cfg = world.config
    rules, table = cfg.world.europe, cfg.management.budgets.prizes.europe
    prizes: dict[int, int] = defaultdict(int)
    for cup in world.competitions.values():
        scale = table.get(cup.code) if cup.kind == "europe" else None
        if scale is None: continue
        entered, reached = set(), {}
        for match_id in cup.match_ids:
            match = world.matches[match_id]
            if match.result is None: continue
            sides = (match.home_id, match.away_id)
            if match.round_number > rules.league_rounds:
                stage = (match.round_number - rules.league_rounds - 1) // 2
                for club_id in sides: reached[club_id] = max(reached.get(club_id, 0), stage)
                continue
            entered.update(sides)
            home, away = match.result.home_goals, match.result.away_goals
            if home == away:
                for club_id in sides: prizes[club_id] += scale.draw
            else:
                prizes[sides[0] if home > away else sides[1]] += scale.win
        for club_id in entered: prizes[club_id] += scale.participation
        for club_id, stage in reached.items(): prizes[club_id] += sum(scale.rounds[:stage + 1])
        winner = next((club_id for year, club_id in world.champions.get(cup.id, []) if year == world.season), None)
        if winner is not None: prizes[winner] += scale.winner
    return dict(prizes)


def cup_prizes(world: World) -> dict[int, int]:
    """Prize money of the national cups just played, by club: a share of the money of the nation's top championship for
    each round played, and another for the winner."""
    cfg = world.config
    rules, rights = cfg.management.budgets.prizes.national_cup, cfg.management.budgets.club_income.league_rights
    prizes: dict[int, int] = defaultdict(int)
    for cup in world.competitions.values():
        if cup.kind != "cup" or not rights.get(cup.nation): continue
        reference, rounds = rights[cup.nation][0], {}
        for match_id in cup.match_ids:
            match = world.matches[match_id]
            if match.result is None: continue
            for club_id in (match.home_id, match.away_id): rounds[club_id] = max(rounds.get(club_id, 0), match.round_number)
        for club_id, played in rounds.items(): prizes[club_id] += round(reference * sum(rules.round_shares[:played]))
        winner = next((club_id for year, club_id in world.champions.get(cup.id, []) if year == world.season), None)
        if winner is not None: prizes[winner] += round(reference * rules.winner_share)
    return dict(prizes)
