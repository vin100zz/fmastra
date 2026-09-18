"""Match-only reinforcement players and knockout resolution, without roster mutations."""
from statistics import mean

from core.ai.selection import LineupContext, select_lineup
from core.domain.date import Date
from core.domain.matches import Match, MatchEvent, MatchResult, Lineup
from core.domain.players import Player, Position
from core.domain.world import World
from core.engine.abilities import generate_attributes, overall
from core.math import clamp
from core.randomness import stream


def cup_lineup(world: World, match: Match, club_id: int) -> tuple[Lineup, dict[int, str]]:
    club, cfg = world.clubs[club_id], world.config
    squad = [world.players[pid] for pid in club.player_ids]
    available = [p for p in squad if p.available(match.competition_id, match.date)]
    level = mean(p.rating for p in squad) if squad else club.reputation
    rng = stream(world.seed, "cup-reinforcements", match.season, match.id, club_id)
    temporary = {}
    positions = [Position(role) for role in cfg.formations.formations[club.formation]]
    names = world.identity_pool.get(club.nation) or [("Joueur", "temporaire")]
    while len(available) < cfg.world.match_rules.players_on_pitch or not any(p.position == Position.GOALKEEPER for p in available):
        selected = select_lineup(LineupContext(club, available, match.competition_id, match.date), cfg)
        missing = positions[len(selected.slots):]
        position = Position.GOALKEEPER if not any(p.position == Position.GOALKEEPER for p in available) else (missing[0] if missing else Position.CENTER_BACK)
        # Negative IDs belong only to this match's snapshot and cannot enter the market.
        pid = -(match.id * 100 + (0 if club_id == match.home_id else 40) + len(temporary) + 1)
        given, surname = rng.choice(names)
        target = clamp(level + rng.uniform(-3, 3), cfg.attributes.bounds.min, cfg.attributes.bounds.max)
        attributes = generate_attributes(target, position, cfg, rng)
        rating = overall(attributes, position, cfg)
        player = Player(pid, f"{given} {surname}", surname, given, (club.nation,),
                        Date(match.date.year - 25, 1, 1), position, {}, attributes, rating, rating,
                        cfg.states.fitness.initial, cfg.states.form.initial, cfg.states.moral.initial,
                        cfg.states.injuries.fragility_min, 0, club.id, None)
        temporary[pid] = player.name
        available.append(player)
    return select_lineup(LineupContext(club, available, match.competition_id, match.date), cfg), temporary


def decide_winner(world: World, match: Match, result: MatchResult, lineups: list[Lineup],
                  force_shootout: bool = False) -> None:
    if not force_shootout and result.home_goals != result.away_goals:
        result.winner_id = match.home_id if result.home_goals > result.away_goals else match.away_id
        return
    rng = stream(world.seed, "cup-penalties", match.season, match.id)
    if result.status == "double_forfeit":
        # Neither side can take kicks: administrative draw keeps the bracket playable.
        result.winner_id = rng.choice([match.home_id, match.away_id])
        result.events.append(MatchEvent(result.duration, 3, len(result.events), "administrative_draw",
                                       result.winner_id, detail="Qualification par tirage au sort après double forfait"))
        return
    teams = []
    keepers = []
    for lineup in lineups:
        players = {s.player.id: s.player for s in lineup.slots}
        everyone = {**players, **{p.id: p for p in lineup.bench}}
        for event in result.events:
            if event.team_id != lineup.club_id:
                continue
            if event.kind in ("red", "injury", "substitution"):
                players.pop(event.player_id, None)
            if event.kind == "substitution" and event.secondary_id in everyone:
                players[event.secondary_id] = everyone[event.secondary_id]
        candidates = list(players.values())
        if not candidates:
            raise ValueError("No eligible penalty taker")
        keeper = max(candidates, key=lambda p: (p.position == Position.GOALKEEPER, p.attributes.get("reflexes"), -p.id))
        keepers.append(keeper)
        teams.append(sorted(candidates, key=lambda p: (-(p.attributes.get("finition") + p.attributes.get("sang_froid")), p.id)))
    # Both teams must have the same number of eligible kickers.
    count = min(map(len, teams))
    for side, team in enumerate(teams):
        selected = team[:count]
        if keepers[side] not in selected:
            selected[-1] = keepers[side]
        teams[side] = selected
    scores, taken = [0, 0], [0, 0]

    def decided() -> bool:
        if max(taken) <= 5:
            return scores[0] > scores[1] + 5 - taken[1] or scores[1] > scores[0] + 5 - taken[0]
        return taken[0] == taken[1] and scores[0] != scores[1]

    while not decided():
        for side in (0, 1):
            player = teams[side][taken[side] % count]
            keeper = keepers[1 - side]
            skill = (player.attributes.get("finition") + player.attributes.get("sang_froid")) / 2
            probability = clamp(.75 + .003 * (skill - keeper.attributes.get("reflexes")), .5, .95)
            scored = rng.random() < probability
            scores[side] += int(scored)
            taken[side] += 1
            result.events.append(MatchEvent(result.duration, 3, len(result.events),
                "penalty_scored" if scored else "penalty_missed", lineups[side].club_id,
                player.id, keeper.id, detail=f"{scores[0]}–{scores[1]}"))
            if decided():
                break
    result.penalties = tuple(scores)
    result.winner_id = match.home_id if scores[0] > scores[1] else match.away_id
