"""Camp lists, national allegiance and persistent campaign reinforcements."""
from dataclasses import replace
from statistics import mean

from core.ai.selection import LineupContext, select_lineup
from core.domain.clubs import Club, ClubPersonality, ClubStatus
from core.domain.date import Date
from core.domain.international import InternationalEdition, NationalCamp
from core.domain.players import Player, Position
from core.domain.world import World
from core.engine.abilities import generate_attributes, overall
from core.math import clamp
from core.randomness import stream
from .human import record as add_news

ROLES = [Position.GOALKEEPER] * 3 + [Position.CENTER_BACK] * 4 + [Position.LEFT_BACK] * 2 + [Position.RIGHT_BACK] * 2 + [Position.DEFENSIVE_MIDFIELDER] * 2 + [Position.CENTRAL_MIDFIELDER] * 3 + [Position.ATTACKING_MIDFIELDER] * 2 + [Position.LEFT_WINGER, Position.RIGHT_WINGER] + [Position.STRIKER] * 3


def get_player(world: World, pid: int) -> Player:
    return world.players[pid] if pid >= 0 else world.international.temporary[pid]


def available(player: Player, edition: InternationalEdition, day: Date, suspension: bool = True) -> bool:
    discipline = player.international_discipline.get(edition.competition_id)
    return ((player.injury is None or player.injury.end <= day)
            and (not suspension or not discipline or discipline.suspended_matches == 0))


def preferences(world: World) -> dict[int, str]:
    """Stable attachment plus prospects at the player's own position, computed simultaneously."""
    teams = {n.code: n for n in world.international.nations.values()}
    pools: dict[tuple[str, Position], list[float]] = {}
    for player in world.players.values():
        for code in ((player.national_team,) if player.national_team else player.nationalities):
            if code in teams:
                pools.setdefault((code, player.position), []).append(player.rating)
    cutoffs = {}
    for key, values in pools.items():
        values.sort(reverse=True)
        places = ROLES.count(key[1])
        cutoffs[key] = values[min(len(values), places) - 1]
    choices = {}
    for player in world.players.values():
        if player.national_team:
            choices[player.id] = player.national_team
            continue
        options = [code for code in player.nationalities if code in teams]
        if not options:
            continue
        def appeal(code):
            team = teams[code]
            cutoff = cutoffs.get((code, player.position), team.strength - 8)
            # A good player is attracted to strength; being below the cutoff is costly.
            attachment = stream(world.seed, "national-attachment", player.id, code).uniform(-2, 2)
            return team.strength * .3 - 2 * max(0, cutoff - player.rating) + attachment
        choices[player.id] = max(options, key=appeal)
    return choices


def reinforcement(world: World, edition: InternationalEdition, nid: int, role: Position) -> Player:
    state, cfg = world.international, world.config
    team = state.nations[nid]
    pid = state.next_temporary_id
    state.next_temporary_id -= 1
    rng = stream(world.seed, "national-reinforcement", edition.year, nid, pid)
    names = world.identity_pool.get(team.code) or [(team.name, "International")]
    given, surname = rng.choice(names)
    # Use a country's underlying depth, never its one imported star as the level of every filler.
    target = clamp(team.strength - 8 + rng.gauss(0, 4), cfg.attributes.bounds.min, cfg.attributes.bounds.max)
    attributes = generate_attributes(target, role, cfg, rng)
    rating = overall(attributes, role, cfg)
    player = Player(pid, f"{given} {surname}", surname, given, (team.code,),
                    Date(edition.year - rng.randint(22, 32), 1, 1), role, {}, attributes, rating, rating,
                    cfg.states.fitness.initial, cfg.states.form.initial, cfg.states.moral.initial,
                    rng.uniform(cfg.states.injuries.fragility_min, cfg.states.injuries.fragility_max), 0, None, None,
                    national_team=team.code)
    state.temporary[pid] = player
    state.temporary_editions[pid] = edition.year
    return player


def fill_camp(world: World, camp: NationalCamp, choices: dict[int, str], retain: bool = False) -> None:
    state = world.international
    edition, team = state.editions[camp.edition], state.nations[camp.nation_id]
    # Suspended players may be called up: the ban can be served during this gathering.
    existing = [get_player(world, pid) for pid in camp.player_ids] if retain else []
    selected = [p for p in existing if available(p, edition, world.date, False)]
    removed = {p.id for p in existing} - {p.id for p in selected}
    pool = [p for p in world.players.values() if choices.get(p.id) == team.code and p.id not in removed]
    pool += [p for pid, p in state.temporary.items() if p.national_team == team.code
             and state.temporary_editions[pid] == edition.year and pid not in removed]
    pool = [p for p in pool if available(p, edition, world.date, False)]
    # A preferred player cannot be promised to two teams in overlapping camps.
    elsewhere = {pid for nid, other in state.camps.items() if nid != camp.nation_id for pid in other.player_ids}
    pool = [p for p in pool if p.id not in elsewhere]
    rng = stream(world.seed, "national-list", camp.edition, camp.nation_id, camp.start.iso())
    noise = {p.id: rng.uniform(-world.config.international.selection_noise, world.config.international.selection_noise)
             for p in sorted(pool, key=lambda p: p.id)}
    # Keep a balanced list; retained players occupy the closest remaining roles.
    roles = ROLES.copy()
    for player in selected:
        role = max(roles, key=player.affinity)
        roles.remove(role)
    for role in roles:
        used = {p.id for p in selected}
        candidates = [p for p in pool if p.id not in used and p.affinity(role) >= .5]
        if candidates:
            def score(p):
                return overall(p.attributes, role, world.config) + 3 * (p.form - 1) + 3 * (p.fitness - 1) + noise[p.id]
            player = max(candidates, key=lambda p: (score(p), p.id >= 0, -p.id))
        else:
            player = reinforcement(world, edition, camp.nation_id, role)
        selected.append(player)
    newcomers = {p.id for p in selected} - {p.id for p in existing}
    camp.player_ids = [p.id for p in selected]
    for player in selected:
        if player.id in newcomers and player.id >= 0:
            add_news(world, "call_up", f"{player.name} est convoqué avec {team.name}", player.club_id, player.id)


def camp_lineup(world: World, edition: InternationalEdition, nid: int):
    team, camp = world.international.nations[nid], world.international.camps[nid]
    players = [get_player(world, pid) for pid in camp.player_ids]
    players = [p for p in players if available(p, edition, world.date)]
    cfg = world.config
    # National benches have all 12 substitutes, including the two reserve goalkeepers.
    match_rules = replace(cfg.world.match_rules, bench_size=12)
    cfg = replace(cfg, world=replace(cfg.world, match_rules=match_rules))
    club = Club(team.id, team.name, team.code, -1, None, ClubStatus.DORMANT, None, team.strength, 0,
                next(iter(cfg.formations.formations)), ClubPersonality(0, 0, 0, 0))
    lineup = select_lineup(LineupContext(club, players, edition.competition_id, world.date, world.seed), cfg)
    chosen = {slot.player.id for slot in lineup.slots}
    lineup.bench = [p for p in players if p.id not in chosen]
    lineup.playing_time = {}  # Club contractual playing-time debt does not influence a national coach.
    return lineup


def revise_strengths(world: World, year: int) -> None:
    for team in world.international.nations.values():
        players = sorted((p.rating for p in world.players.values()
                          if p.national_team == team.code or (not p.national_team and team.code in p.nationalities)), reverse=True)[:23]
        # Missing observations preserve the reference instead of implying a weak country.
        observed = mean(players + [team.reference_strength] * (23 - len(players)))
        target = .6 * team.reference_strength + .4 * observed
        team.strength = clamp(.9 * team.strength + .1 * target, 1, 100)
