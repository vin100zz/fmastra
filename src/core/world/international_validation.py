"""Save invariants for national allegiances, squads and tournament structures."""
from math import isfinite
from collections import Counter
from .international_calendar import QUOTAS


def validate_international(world):
    state = world.international
    codes = {n.code for n in state.nations.values()}
    if len(codes) != len(state.nations):
        raise ValueError("Duplicate national team code")
    for nid, nation in state.nations.items():
        if nid != nation.id or nid >= 0 or not all(isfinite(value) and 1 <= value <= 100 for value in (nation.strength, nation.reference_strength)):
            raise ValueError("Invalid national team")
    selected = set()
    for nid, camp in state.camps.items():
        if nid not in state.nations or nid != camp.nation_id or camp.edition not in state.editions:
            raise ValueError("Invalid national camp")
        if len(camp.player_ids) != 23 or len(set(camp.player_ids)) != 23 or selected.intersection(camp.player_ids):
            raise ValueError("Duplicate or invalid national squad")
        selected.update(camp.player_ids)
        for pid in camp.player_ids:
            player = world.players.get(pid) or state.temporary.get(pid)
            if not player or state.nations[nid].code not in player.nationalities or player.national_team not in (None, state.nations[nid].code):
                raise ValueError("Ineligible national player")
    for player in (*world.players.values(), *state.temporary.values()):
        if player.national_team is not None and (player.national_team not in codes or player.national_team not in player.nationalities):
            raise ValueError("Invalid national allegiance")
        if not 0 <= player.historical_caps <= player.international_caps or not 0 <= player.historical_goals <= player.international_goals:
            raise ValueError("Invalid international career totals")
    for pid, player in state.temporary.items():
        if pid >= 0 or pid != player.id or pid in world.players or player.club_id is not None or player.contract is not None or state.temporary_editions.get(pid) not in state.editions:
            raise ValueError("Temporary national player entered club registry")
    if state.next_temporary_id >= min(state.temporary, default=0):
        raise ValueError("National temporary ID would be reused")
    if set(state.matches) & set(world.matches) or world.next_id <= max(state.matches, default=0):
        raise ValueError("International match ID would be reused")
    europe = {n.id for n in state.nations.values() if n.federation == "Europe"}
    for year, edition in state.editions.items():
        groups = edition.qualification_groups
        members = [nid for group in groups for nid in group]
        if year != edition.year or len(groups) != 10 or any(len(g) not in (5, 6) for g in groups) or len(members) != len(set(members)) or set(members) != europe:
            raise ValueError("Invalid international qualification groups")
        if edition.final_groups:
            finalists = [nid for group in edition.final_groups for nid in group]
            size = 16 if edition.kind == "euro" else 32
            if len(finalists) != size or len(set(finalists)) != size or set(finalists) != set(edition.qualifiers) or any(len(g) != 4 for g in edition.final_groups):
                raise ValueError("Invalid international final groups")
            if edition.kind == "world":
                if Counter(state.nations[nid].federation for nid in finalists) != QUOTAS:
                    raise ValueError("Invalid World Cup quotas")
                for group in edition.final_groups:
                    if any(count > (2 if federation == "Europe" else 1) for federation, count in Counter(state.nations[nid].federation for nid in group).items()):
                        raise ValueError("World Cup federation restriction violated")
        if edition.winner_id is not None and edition.winner_id not in edition.qualifiers:
            raise ValueError("Invalid international winner")
    for mid, match in state.matches.items():
        edition = state.editions.get(match.season)
        if mid != match.id or not edition or match.competition_id != edition.competition_id or match.home_id == match.away_id or any(nid not in state.nations for nid in (match.home_id, match.away_id)):
            raise ValueError("Invalid international fixture")
        if match.result and match.round_number >= 14:
            result = match.result
            if result.winner_id not in (match.home_id, match.away_id):
                raise ValueError("International knockout lacks a winner")
            if result.penalties:
                a, b = result.penalties
                if a == b or min(a, b) < 0 or result.home_goals != result.away_goals or result.winner_id != (match.home_id if a > b else match.away_id):
                    raise ValueError("Invalid international shootout")
