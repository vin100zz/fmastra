"""Parse the source's compositional role grammar without a 250-entry lookup."""
from core.domain.players import Position

# Side midfielders and wingbacks share the corresponding engine roles.
POSITION_COLUMNS = {
    Position.GOALKEEPER: ("Goalkeeper",),
    Position.CENTER_BACK: ("DefenderCentral", "Sweeper"),
    Position.LEFT_BACK: ("DefenderLeft", "WingbackLeft"),
    Position.RIGHT_BACK: ("DefenderRight", "WingbackRight"),
    Position.DEFENSIVE_MIDFIELDER: ("DefensiveMidfielderCentral",),
    Position.CENTRAL_MIDFIELDER: ("MidfielderCentral",),
    Position.ATTACKING_MIDFIELDER: ("AttackingMidfielderCentral",),
    Position.LEFT_WINGER: ("AttackingMidfielderLeft", "MidfielderLeft"),
    Position.RIGHT_WINGER: ("AttackingMidfielderRight", "MidfielderRight"),
    Position.STRIKER: ("AttackerCentral",),
}


def parse_positions(source: str) -> tuple[Position, ...]:
    result: list[Position] = []
    for group in source.split(","):
        compact = group.strip()
        if compact in ("DC", "DL", "DR", "WBL", "WBR", "MC", "ML", "MR", "AMC", "AML", "AMR"):
            group = compact[:-1] + " " + compact[-1]
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
