"""Reserve continental and domestic windows before scheduling league fixtures."""
from core.domain.date import Date
from core.domain.world import World


def nearest_weekday(day: Date, weekday: int) -> Date:
    return day.add_days((weekday - (day.ordinal() - 1) % 7 + 3) % 7 - 3)


def competition_dates(world: World, season: int, domestic: bool = False) -> list[Date]:
    rules = world.config.world.europe
    targets = rules.domestic_dates if domestic else rules.dates
    dates = []
    for index, (month, day) in enumerate(targets):
        target = Date(season if month >= world.config.world.season.start_month else season + 1, month, day)
        dates.append(target if not domestic and index == len(targets) - 1
                     else nearest_weekday(target, rules.cup_weekday))
    if any(b.ordinal() - a.ordinal() < rules.min_rest_days for a, b in zip(dates, dates[1:])):
        raise ValueError("Competition dates leave insufficient rest")
    return dates
