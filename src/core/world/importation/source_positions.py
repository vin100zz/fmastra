"""Parse the source's compositional role grammar without a 250-entry lookup."""
from core.domain.players import Position


def parse_positions(source: str) -> tuple[Position, ...]:
    result: list[Position] = []
    for group in source.split(","):
        pieces = group.strip().split()
        if not pieces:
            raise ValueError(f"Empty source position: {source!r}")
        if pieces == ["GK"]:
            candidates = [Position.GOALKEEPER]
        elif pieces == ["DM"]:
            candidates = [Position.DEFENSIVE_MIDFIELDER]
        elif pieces == ["ST"]:
            candidates = [Position.STRIKER]
        else:
            if len(pieces) != 2 or not set(pieces[1]) <= set("RLC"):
                raise ValueError(f"Unsupported source position: {source!r}")
            candidates = []
            for role in pieces[0].split("/"):
                for side in pieces[1]:
                    if role in ("D", "WB"):
                        position = {"C": Position.CENTER_BACK, "L": Position.LEFT_BACK, "R": Position.RIGHT_BACK}[side]
                    elif role in ("M", "AM"):
                        center = Position.CENTRAL_MIDFIELDER if role == "M" else Position.ATTACKING_MIDFIELDER
                        position = {"C": center, "L": Position.LEFT_WINGER, "R": Position.RIGHT_WINGER}[side]
                    elif role == "F" and side == "C":
                        position = Position.STRIKER
                    else:
                        raise ValueError(f"Unsupported source role: {source!r}")
                    candidates.append(position)
        result.extend(position for position in candidates if position not in result)
    return tuple(result)
