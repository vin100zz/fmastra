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
    from .international_calendar import reserved_dates
    international = reserved_dates(world, season)
    # Domestic dates are reserved first. Solve continental dates together: moving an early
    # knockout leg can require moving its return leg as well, without colliding with the cup.
    blocked = international + ([] if domestic else competition_dates(world, season, domestic=True))
    earliest = Date(season, world.config.world.season.start_month, world.config.world.season.start_day)
    options = []
    for index, day in enumerate(dates):
        candidates = [day] if index == len(dates) - 1 else [day.add_days(offset * 7) for offset in range(-4, 5)]
        options.append(sorted((candidate for candidate in candidates if candidate >= earliest
                               and all(abs(candidate.ordinal() - other.ordinal()) >= rules.min_rest_days for other in blocked)),
                              key=lambda candidate: (abs(candidate.ordinal() - day.ordinal()), candidate)))
    def place(chosen):
        if len(chosen) == len(options):
            return chosen
        for candidate in options[len(chosen)]:
            if not chosen or candidate.ordinal() - chosen[-1].ordinal() >= rules.min_rest_days:
                result = place([*chosen, candidate])
                if result is not None:
                    return result
        return None
    dates = place([])
    if dates is None:
        raise ValueError("Cannot fit club cup dates outside international windows")
    if any(b.ordinal() - a.ordinal() < rules.min_rest_days for a, b in zip(dates, dates[1:])):
        raise ValueError("Competition dates leave insufficient rest")
    return dates
