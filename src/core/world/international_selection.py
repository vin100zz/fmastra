"""Camp lists, national allegiance and persistent campaign reinforcements."""
from dataclasses import replace
from statistics import mean

from core.ai.assignment import maximize_assignment
from core.ai.formation import Value, best_formation, position_value
from core.ai.selection import LineupContext, select_lineup
from core.config.model import Config
from core.domain.clubs import Club, ClubPersonality, ClubStatus
from core.domain.date import Date
from core.domain.international import InternationalEdition, NationalCamp
from core.domain.players import Player, Position
from core.domain.world import NewsLine, World
from core.engine.abilities import generate_attributes, overall
from core.math import clamp
from core.randomness import stream
from .human import report

# What an assignment pays for a place no candidate may hold, and for one left to a reinforcement.
FORBIDDEN, REINFORCED = -1e9, -1e6


def list_roles(formation: str, cfg: Config) -> list[Position]:
    """The 23 places of a list in `formation`: its eleven, a backup for each outfield place, and two more goalkeepers."""
    roles = [Position(role) for role in cfg.formations.formations[formation]]
    return roles + [role for role in roles if role != Position.GOALKEEPER] + [Position.GOALKEEPER] * 2


def selection_value(cfg: Config, noise: dict[int, float] | None = None) -> Value:
    """A coach's value of a player at a position: `position_value`, his level there raised or lowered by his form, his
    fitness and the draw of the camp (`noise`), nothing where his affinity is below `squad_list.min_affinity`."""
    penalty, least = cfg.attributes.out_of_position, cfg.international.squad_list.min_affinity
    if noise is None:
        base = position_value(cfg)
        return lambda player, position: base(player, position) if player.affinity(position) >= least else 0.0

    def value(player: Player, position: Position) -> float:
        affinity = player.affinity(position)
        if affinity < least: return 0.0
        note = overall(player.attributes, position, cfg) + 3 * (player.form - 1) + 3 * (player.fitness - 1) + noise.get(player.id, 0)
        return note * (penalty.base + penalty.factor * affinity)
    return value


def shortlist(pool: list[Player], value: Value, cfg: Config) -> list[Player]:
    """The `squad_list.pool_per_position` best candidates of `pool` at each position, by `value`, by id."""
    count, chosen = cfg.international.squad_list.pool_per_position, set()
    for position in Position:
        ranked = sorted((player for player in pool if value(player, position) > 0),
                        key=lambda player: (-value(player, position), player.id < 0, abs(player.id)))
        chosen.update(player.id for player in ranked[:count])
    return sorted((player for player in pool if player.id in chosen), key=lambda player: (player.id < 0, abs(player.id)))


def nation_pool(world: World, code: str) -> list[Player]:
    """The players of the source who play for a nation, or could: capped for it, or among their nationalities."""
    return [player for player in world.players.values()
            if player.national_team == code or (not player.national_team and code in player.nationalities)]


def reference_formation(world: World, team, margin: bool = True) -> str:
    """The formation a nation's whole pool fills best (`selection_value` without form, fitness nor draw), kept unless
    another does better by the margin of the clubs."""
    cfg = world.config
    value = selection_value(cfg)
    return best_formation(shortlist(nation_pool(world, team.code), value, cfg), cfg, (team.reference_formation or None) if margin else None, value)


def initialize_formations(world: World) -> None:
    """Each nation's reference formation, and the formation of its first camp, for a world that lacks them."""
    for team in world.international.nations.values():
        if not team.reference_formation: team.reference_formation = reference_formation(world, team, margin=False)
        if not team.formation: team.formation = team.reference_formation


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
    places = {team.code: list_roles(team.reference_formation or next(iter(world.config.formations.formations)), world.config)
              for team in teams.values()}
    for key, values in pools.items():
        values.sort(reverse=True)
        # A position the nation's formation does not play is open to its best player there only.
        count = max(1, places[key[0]].count(key[1]))
        cutoffs[key] = values[min(len(values), count) - 1]
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
    # A reinforcement stays with its selection through the campaign, from the Nations League to the tournament.
    pool += [p for pid, p in state.temporary.items() if p.national_team == team.code and pid not in removed]
    pool = [p for p in pool if available(p, edition, world.date, False)]
    # A preferred player cannot be promised to two teams in overlapping camps.
    elsewhere = {pid for nid, other in state.camps.items() if nid != camp.nation_id for pid in other.player_ids}
    pool = [p for p in pool if p.id not in elsewhere]
    rng = stream(world.seed, "national-list", camp.edition, camp.nation_id, camp.start.iso())
    noise = {p.id: rng.uniform(-world.config.international.selection_noise, world.config.international.selection_noise)
             for p in sorted(pool, key=lambda p: p.id)}
    cfg = world.config
    value = selection_value(cfg, noise)
    used = {p.id for p in selected}
    candidates = [p for p in shortlist(pool, value, cfg) if p.id not in used]
    # The formation is chosen as a camp opens and kept through it: a replacement takes the place of the one he replaces.
    if not retain or not team.formation:
        team.formation = best_formation(candidates, cfg, team.formation or None, value)
    roles = list_roles(team.formation, cfg)
    # Retained players occupy the closest remaining roles.
    for player in selected:
        role = max(roles, key=player.affinity)
        roles.remove(role)
    least = cfg.international.squad_list.min_affinity
    scores = [[value(p, role) if p.affinity(role) >= least else FORBIDDEN for p in candidates] + [REINFORCED] * len(roles)
              for role in roles]
    for row, (role, column) in enumerate(zip(roles, maximize_assignment(scores) if roles else [])):
        if column < len(candidates) and scores[row][column] > FORBIDDEN:
            selected.append(candidates[column])
        else:
            selected.append(reinforcement(world, edition, camp.nation_id, role))
    newcomers = {p.id for p in selected} - {p.id for p in existing}
    camp.player_ids = [p.id for p in selected]
    for player in selected:
        if player.id < 0:
            # Kept until the latest edition it is called up for is over.
            state.temporary_editions[player.id] = max(state.temporary_editions[player.id], edition.year)
        if player.id in newcomers and player.id >= 0:
            report(world, "call_up", NewsLine(player_id=player.id, text=team.name, key=str(camp.nation_id)), player.club_id)


def camp_lineup(world: World, edition: InternationalEdition, nid: int):
    team, camp = world.international.nations[nid], world.international.camps[nid]
    players = [get_player(world, pid) for pid in camp.player_ids]
    players = [p for p in players if available(p, edition, world.date)]
    cfg = world.config
    # National benches have all 12 substitutes, including the two reserve goalkeepers.
    match_rules = replace(cfg.world.match_rules, bench_size=12)
    cfg = replace(cfg, world=replace(cfg.world, match_rules=match_rules))
    club = Club(team.id, team.name, team.code, -1, None, ClubStatus.DORMANT, None, team.strength, 0,
                team.formation or next(iter(cfg.formations.formations)), ClubPersonality(0, 0, 0, 0))
    lineup = select_lineup(LineupContext(club, players, edition.competition_id, world.date, world.seed), cfg)
    chosen = {slot.player.id for slot in lineup.slots}
    lineup.bench = [p for p in players if p.id not in chosen]
    lineup.playing_time = {}  # Club contractual playing-time debt does not influence a national coach.
    return lineup


def revise_strengths(world: World, year: int) -> None:
    """Each nation's strength drifts towards its pool's, and its reference formation is revised (see
    `reference_formation`)."""
    for team in world.international.nations.values():
        team.reference_formation = reference_formation(world, team)
        players = sorted((p.rating for p in nation_pool(world, team.code)), reverse=True)[:23]
        # Missing observations preserve the reference instead of implying a weak country.
        observed = mean(players + [team.reference_strength] * (23 - len(players)))
        target = .6 * team.reference_strength + .4 * observed
        team.strength = clamp(.9 * team.strength + .1 * target, 1, 100)
