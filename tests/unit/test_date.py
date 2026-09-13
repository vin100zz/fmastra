import pytest
from core.domain.date import Date


def test_leap_day_and_year_boundaries():
    assert Date(2024, 2, 28).add_days(1) == Date(2024, 2, 29)
    assert Date(2024, 2, 29).add_years(1) == Date(2025, 2, 28)
    assert Date(2025, 12, 31).add_days(1) == Date(2026, 1, 1)
    assert Date(2000, 9, 11).age_on(Date(2025, 9, 10)) == 24
    with pytest.raises(ValueError): Date(2025, 2, 29)


@pytest.mark.parametrize("ordinal", [1, 365, 366, 1461, 738946, 750000])
def test_ordinal_roundtrip(ordinal):
    assert Date.from_ordinal(ordinal).ordinal() == ordinal
