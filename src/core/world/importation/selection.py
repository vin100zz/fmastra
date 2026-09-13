"""Pure squad capping that preserves goalkeeper coverage."""
from core.domain.players import Player, Position


def select_squad(players: list[Player], limit: int, goalkeeper_places: int) -> tuple[list[Player], list[int]]:
    ordered = sorted(players, key=lambda player: (-player.rating, player.id))
    keepers = [player for player in ordered if player.position == Position.GOALKEEPER][:goalkeeper_places]
    retained_ids = {player.id for player in keepers}
    selected = keepers + [player for player in ordered if player.id not in retained_ids][:max(0, limit - len(keepers))]
    retained_ids = {player.id for player in selected}
    return sorted(selected, key=lambda player: player.id), [player.id for player in ordered if player.id not in retained_ids]
