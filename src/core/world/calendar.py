"""Round-robin schedules and deterministic standings."""
from __future__ import annotations

from dataclasses import dataclass
from random import Random

from core.config.model import Config
from core.domain.clubs import Competition
from core.domain.date import Date
from core.domain.matches import Match


def schedule(competition: Competition, season: int, next_id: int, cfg: Config, rng: Random,
             reserved_dates: list[Date] | None = None) -> list[Match]:
    clubs = sorted(competition.club_ids)
    rng.shuffle(clubs)
    if len(clubs) < 2:
        raise ValueError("A league requires at least two clubs")
    if len(clubs) % 2:
        clubs.append(None)  # One club rests each round in odd-sized leagues.
    size = len(clubs)
    rules = cfg.world.season
    first = Date(season, rules.start_month, rules.start_day)
    first = first.add_days((cfg.world.europe.league_weekday - (first.ordinal() - 1) % 7) % 7)
    last = Date(season + 1, rules.end_month, rules.end_day)
    span = last.ordinal() - first.ordinal()
    spacing = rules.days_between_rounds
    slots = list(range(0, span + 1, spacing))
    rounds = 2 * (size - 1)
    def available(offset: int) -> bool:
        return all(abs(first.ordinal() + offset - day.ordinal()) >= cfg.world.europe.min_rest_days for day in reserved_dates or [])
    slots = [offset for offset in slots if available(offset)]
    if len(slots) < rounds and spacing > 1:
        # Add midweek slots only when weekly rounds do not fit before summer.
        slots = sorted(set(slots) | {offset for offset in range(spacing // 2, span + 1, spacing) if available(offset)})
    if len(slots) < rounds:
        raise ValueError("Season window cannot fit the league")
    dates = [first.add_days(slots[round(index * (len(slots) - 1) / (rounds - 1))]) for index in range(rounds)]
    fixtures: list[list[tuple[int, int]]] = []
    rotating = clubs[:]
    for index in range(size - 1):
        pairs = [(rotating[i], rotating[-i - 1]) for i in range(size // 2)
                 if rotating[i] is not None and rotating[-i - 1] is not None]
        if index % 2:
            pairs = [(away, home) for home, away in pairs]
        fixtures.append(pairs)
        rotating = [rotating[0], rotating[-1], *rotating[1:-1]]
    fixtures.extend([[(away, home) for home, away in pairs] for pairs in fixtures[:]])
    matches = []
    for index, pairs in enumerate(fixtures):
        for home, away in pairs:
            matches.append(Match(next_id + len(matches), competition.id, season, index + 1, dates[index], home, away))
    return matches


@dataclass(slots=True)
class Standing:
    club_id: int
    played: int = 0
    won: int = 0
    drawn: int = 0
    lost: int = 0
    goals_for: int = 0
    goals_against: int = 0
    points: int = 0
    form: str = ""

    @property
    def difference(self) -> int:
        return self.goals_for - self.goals_against


def standings(competition: Competition, matches: list[Match], cfg: Config) -> list[Standing]:
    rows = {club_id: Standing(club_id) for club_id in competition.club_ids}
    played = [match for match in matches if match.result and match.competition_id == competition.id
              and (competition.kind != "europe" or match.round_number <= cfg.world.europe.league_rounds)]
    for match in sorted(played, key=lambda item: (item.date, item.id)):
        result = match.result
        if result.status == "double_forfeit":
            continue
        for club_id, scored, conceded in ((match.home_id, result.home_goals, result.away_goals),
                                          (match.away_id, result.away_goals, result.home_goals)):
            row = rows[club_id]
            row.played += 1
            row.goals_for += scored
            row.goals_against += conceded
            if scored > conceded:
                row.won += 1
                row.points += cfg.world.season.win_points
                row.form += "V"
            elif scored == conceded:
                row.drawn += 1
                row.points += cfg.world.season.draw_points
                row.form += "N"
            else:
                row.lost += 1
                row.points += cfg.world.season.loss_points
                row.form += "D"
    def key(row: Standing) -> tuple:
        values = []
        for criterion in (cfg.world.europe.tiebreakers if competition.kind == "europe" else cfg.world.season.tiebreakers):
            if criterion == "points": values.append(-row.points)
            elif criterion == "difference_buts": values.append(-row.difference)
            elif criterion == "buts_pour": values.append(-row.goals_for)
            elif criterion == "confrontation_directe":
                tied = {other.club_id for other in rows.values()
                        if (other.points, other.difference, other.goals_for) == (row.points, row.difference, row.goals_for)}
                direct = 0
                for match in played:
                    if match.home_id not in tied or match.away_id not in tied:
                        continue
                    if row.club_id not in (match.home_id, match.away_id):
                        continue
                    scored, conceded = (match.result.home_goals, match.result.away_goals)
                    if row.club_id == match.away_id: scored, conceded = conceded, scored
                    direct += (cfg.world.season.win_points if scored > conceded else
                               cfg.world.season.draw_points if scored == conceded else cfg.world.season.loss_points)
                values.append(-direct)
            else:
                raise ValueError(f"Unknown standings criterion: {criterion}")
        return (*values, row.club_id)
    return sorted(rows.values(), key=key)
