"""What the user's club knows of its next opponent while it picks its lineup; read-only projection."""
from core.domain.matches import Match
from core.domain.world import World
from . import views as v
from .club_overview import outcome

KEY_PLAYERS = 3
LAST_MATCHES = 5


def scouting(world: World, match: Match | None, club_id: int) -> dict | None:
    """The opponent of `match`: its level and potential, its standing, its record where it plays this match, its last
    matches of the season, its best players, those who cannot play, and the latest meeting of the two clubs. None without a
    match or against a club the world does not hold."""
    if match is None: return None
    home = match.home_id == club_id
    rival_id = match.away_id if home else match.home_id
    rival = world.clubs.get(rival_id)
    if rival is None: return None
    standing = v.league_standings(world, rival.competition_id).get(rival_id)
    # Its league record this season at the ground it plays on: away when the user's club hosts the match.
    played = [item for item in world.matches.values() if item.season == world.season and item.result
              and item.competition_id == rival.competition_id and (item.away_id if home else item.home_id) == rival_id]
    letters = [outcome(rival_id, item) for item in played]
    # Its last matches of the season in every competition, oldest first, each read from its side.
    season = sorted((item for item in world.matches.values() if item.season == world.season and item.result
                     and rival_id in (item.home_id, item.away_id)), key=lambda item: (item.date, item.id))[-LAST_MATCHES:]
    first_team = [player for pid in rival.player_ids if (player := world.players[pid]).reserve_since is None]
    # Its best as the user's club reads them, never by the levels it cannot see.
    seen = {player.id: v.scouting(world, player)["estimate"]["level"] for player in first_team}
    best = sorted(first_team, key=lambda player: (-seen[player.id], player.id))[:KEY_PLAYERS]
    out = [player for player in first_team if player.injury or any(item.suspended_matches for item in player.discipline.values())]
    meetings = [item for item in world.matches.values() if item.result and {item.home_id, item.away_id} == {club_id, rival_id}]
    last = max(meetings, key=lambda item: (item.date, item.id), default=None)

    def person(player) -> dict:
        row = v.player_row(world, player)
        return {key: row[key] for key in ("id", "name", "position", "rating", "stars", "estimate", "injured_until", "suspension")}
    return {"match": v.match_row(world, match), "home": home,
            "club": {**v.club_ref(world, rival_id), "formation": rival.formation, **v.squad_strength(world, rival_id)},
            "standing": {key: standing[key] for key in ("rank", "points")} if standing else None,
            "record": {"venue": "away" if home else "home", "won": letters.count("V"), "drawn": letters.count("N"), "lost": letters.count("D")},
            "last_matches": [{**v.match_row(world, item), "outcome": outcome(rival_id, item),
                              "league": item.competition_id == rival.competition_id} for item in season],
            "key_players": [person(player) for player in best],
            "absent": [person(player) for player in sorted(out, key=lambda player: (-seen[player.id], player.id))],
            "last_meeting": {**v.match_row(world, last), "outcome": outcome(club_id, last)} if last else None}
