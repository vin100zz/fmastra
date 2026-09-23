"""International competition lifecycle; no club membership or finance mutations."""
from math import pow

from core.domain.clubs import Competition
from core.domain.date import Date
from core.domain.international import NationalTeam, NationalCamp, InternationalRecord
from core.domain.players import Discipline
from core.domain.world import World, JournalEntry
from core.domain.matches import TRANSIENT_EVENT_KINDS
from core.engine.match import PossessionEngine
from .human import record as add_news
from core.engine.fitness import recovered_fitness
from core.math import clamp
from core.randomness import stream
from .calendar import standings
from .cup_matches import decide_winner
from .player_states import draw_injury
from .international_calendar import (QUOTAS, edition_kind, create_edition, windows, add_match,
                                     group_fixtures, draw_final_groups)
from .international_selection import (get_player, preferences, fill_camp, camp_lineup, revise_strengths)


def initialize_international(world: World) -> None:
    if not world.config.nations or world.international.nations:
        return
    names = {name: code for code, name in world.nation_names.items()}
    for index, (name, rule) in enumerate(sorted(world.config.nations.items())):
        if not rule.active:
            continue
        code = names.get(name, f"N{index:03}")
        world.nation_names[code] = name
        nid = -1000 - index
        world.international.nations[nid] = NationalTeam(nid, code, name, rule.federation, rule.strength, rule.strength)
    active = {n.code for n in world.international.nations.values()}
    for player in world.players.values():
        if player.historical_caps or player.historical_goals:
            explicit = world.config.international.historical_nations.get(player.id)
            code = names.get(explicit, explicit) if explicit else next((n for n in player.nationalities if n in active), None)
            if explicit and (code not in active or code not in player.nationalities):
                raise ValueError(f"Invalid historical national team for player {player.id}")
            player.national_team = code
    for federation, quota in QUOTAS.items():
        if sum(n.federation == federation for n in world.international.nations.values()) < quota:
            raise ValueError(f"Not enough active nations in {federation}")
    # Never invent already-played qualifiers if a custom game starts later.
    year = max(world.config.international.first_euro, world.date.year + 2)
    while not edition_kind(world, year) or windows(year)[0][0].add_days(-3) <= world.date:
        year += 1
    create_edition(world, year)


def edition_matches(world, edition, low=1, high=99):
    return [m for m in world.international.matches.values()
            if m.season == edition.year and low <= m.round_number <= high]


def group_table(world, edition, group, finals=False, exclude=None):
    matches = edition_matches(world, edition, 11 if finals else 1, 13 if finals else 10)
    matches = [m for m in matches if m.home_id in group and m.away_id in group
               and exclude not in (m.home_id, m.away_id)]
    competition = Competition(edition.competition_id, edition.name, "", 0, group)
    return standings(competition, matches, world.config)


def best_seconds(world, edition):
    rows = []
    for group in edition.qualification_groups:
        table = group_table(world, edition, group)
        second = table[1]
        if len(group) == 6:
            second = next(row for row in group_table(world, edition, group, exclude=table[-1].club_id)
                          if row.club_id == second.club_id)
        rows.append(second)
    return sorted(rows, key=lambda r: (-r.points, -r.difference, -r.goals_for, r.club_id))


def qualify(world, edition):
    winners = [group_table(world, edition, group)[0].club_id for group in edition.qualification_groups]
    runners = best_seconds(world, edition)[:6 if edition.kind == "euro" else 4]
    edition.qualifiers = winners + [row.club_id for row in runners]
    if edition.kind == "world":
        rng = stream(world.seed, "national-external-qualification", edition.year)
        for federation, count in QUOTAS.items():
            if federation == "Europe":
                continue
            teams = [n for n in world.international.nations.values() if n.federation == federation]
            # Small Gaussian variation permits occasional upsets across a modest level gap,
            # unlike bounded noise which would permanently lock some quotas to the same teams.
            scores = {n.id: n.strength + rng.gauss(0, world.config.international.qualification_noise) for n in teams}
            edition.qualifiers += [n.id for n in sorted(teams, key=lambda n: (-scores[n.id], n.id))[:count]]
    edition.final_groups = draw_final_groups(world, edition)
    for group in edition.final_groups:
        group_fixtures(world, edition, group, [Date(edition.year, 6, day) for day in (12, 17, 22)], 11, False)
    world.journal.append(JournalEntry(world.date, "international", f"{edition.name} : les qualifiés et les groupes sont connus."))


def progress_international(world: World) -> None:
    for edition in world.international.editions.values():
        if edition.winner_id is not None:
            continue
        qualifiers = edition_matches(world, edition, 1, 10)
        if not edition.final_groups:
            if qualifiers and all(m.result for m in qualifiers):
                qualify(world, edition)
            continue
        finals = edition_matches(world, edition, 11)
        current = max(m.round_number for m in finals)
        last = [m for m in finals if m.round_number == current]
        if any(m.result is None for m in finals if m.round_number <= current):
            continue
        if current == 13:
            tables = [group_table(world, edition, group, True) for group in edition.final_groups]
            pairs = []
            for parity in (0, 1):
                for index in range(0, len(tables), 2):
                    a, b = (tables[index], tables[index + 1]) if parity == 0 else (tables[index + 1], tables[index])
                    pairs.append((a[0].club_id, b[1].club_id))
        elif len(last) == 1:
            result = last[0].result
            edition.winner_id = result.winner_id
            edition.runner_up_id = last[0].away_id if result.winner_id == last[0].home_id else last[0].home_id
            world.journal.append(JournalEntry(world.date, "international_winner",
                                 f"{world.international.nations[edition.winner_id].name} remporte {edition.name}."))
            continue
        else:
            winners = [m.result.winner_id for m in sorted(last, key=lambda m: m.id)]
            pairs = list(zip(winners[::2], winners[1::2]))
        day = Date(edition.year, 6, 27).add_days((current - 13) * 5)
        for home, away in pairs:
            add_match(world, edition, current + 1, day, home, away, True)


def _release_camps(world):
    state = world.international
    for nid, camp in list(state.camps.items()):
        edition = state.editions[camp.edition]
        future = any(m.result is None and nid in (m.home_id, m.away_id)
                     for m in edition_matches(world, edition, 11))
        if world.date > camp.end or (camp.finals and camp.first_match_played and not future):
            state.last_camps[nid] = camp
            del state.camps[nid]
    protected = {pid for camp in state.camps.values() for pid in camp.player_ids}
    from .application import apply
    from .events import PlayerReleased
    for pid in state.deferred_retirements[:]:
        if pid not in protected:
            if pid in world.players:
                apply(world, PlayerReleased(pid, True))
            state.deferred_retirements.remove(pid)


def prepare_international_day(world: World) -> None:
    state = world.international
    if not state.nations:
        return
    if (world.date.month, world.date.day) == (8, 1):
        year = world.date.year + 2
        if edition_kind(world, year) and year not in state.editions:
            revise_strengths(world, year)
            create_edition(world, year)
    _release_camps(world)
    for pid, player in list(state.temporary.items()):
        edition = state.editions[state.temporary_editions[pid]]
        if edition.winner_id is not None:
            # Identities/stats are already snapshotted; release campaign-only objects.
            if not any(pid in c.player_ids for c in state.camps.values()):
                del state.temporary[pid]
                del state.temporary_editions[pid]
            continue
        if player.injury and player.injury.end <= world.date:
            player.injury = None
            player.fitness = world.config.states.fitness.injury_return_fitness
        elif not player.injury:
            player.fitness = recovered_fitness(player, player.born.age_on(world.date), world.config)
    openings = []
    for edition in state.editions.values():
        if edition.winner_id is not None:
            continue
        for first, last in windows(edition.year):
            if world.date == first.add_days(-3):
                openings += [NationalCamp(nid, edition.year, world.date, last.add_days(2), False)
                             for group in edition.qualification_groups for nid in group]
        if world.date == Date(edition.year, 6, 8) and edition.qualifiers:
            # Qualification yellow totals reset; outstanding bans still have to be served.
            for player in [*world.players.values(), *state.temporary.values()]:
                discipline = player.international_discipline.get(edition.competition_id)
                if discipline:
                    discipline.yellows = 0
                    discipline.served_thresholds.clear()
            openings += [NationalCamp(nid, edition.year, world.date, Date(edition.year, 7, 14), True)
                         for nid in edition.qualifiers]
    replacements = [c for c in state.camps.values() if (not c.finals or not c.first_match_played)
                    and any(get_player(world, pid).injury and get_player(world, pid).injury.end > world.date for pid in c.player_ids)]
    if openings or replacements:
        choices = preferences(world)
        for camp in openings:
            state.camps[camp.nation_id] = camp
            fill_camp(world, camp, choices)
        for camp in replacements:
            fill_camp(world, camp, choices, retain=True)


def apply_international_result(world, edition, match, result, lineups):
    state, cfg = world.international, world.config
    rng = stream(world.seed, "international-consequences", match.id)
    result.events = [e for e in result.events if e.kind not in TRANSIENT_EVENT_KINDS]
    for nid in (match.home_id, match.away_id):
        # A ban is served even when the player is not called up.
        code = state.nations[nid].code
        for player in [*world.players.values(), *state.temporary.values()]:
            if player.national_team == code:
                discipline = player.international_discipline.get(edition.competition_id)
                if discipline and discipline.suspended_matches:
                    discipline.suspended_matches -= 1
        state.camps[nid].first_match_played = True
    team_of = {p.id: lineup.club_id for lineup in lineups for p in [*(s.player for s in lineup.slots), *lineup.bench]}
    for pid, stats in result.player_stats.items():
        player = get_player(world, pid)
        if stats.minutes <= 0:
            continue
        nid = team_of[pid]
        code = state.nations[nid].code
        if player.national_team not in (None, code):
            raise ValueError("A player cannot represent two nations")
        player.national_team = code
        player.international_caps += 1
        player.international_goals += stats.goals
        player.fitness = stats.final_fitness
        player.monthly_minutes += stats.minutes
        if stats.rating is not None:
            rules = cfg.states.form
            target = 1 + rules.rating_sensitivity * (stats.rating - rules.reference_rating)
            player.form = clamp(player.form + rules.convergence_speed * (target - player.form)
                                + rng.gauss(0, rules.noise), rules.min, rules.max)
        key = f"{edition.year}:{pid}"
        record = state.records.setdefault(key, InternationalRecord(pid, player.name, nid, edition.year))
        record.matches += 1
        record.goals += stats.goals
        record.assists += stats.assists
        record.minutes += stats.minutes
        discipline = player.international_discipline.setdefault(edition.competition_id, Discipline())
        discipline.yellows += stats.yellows
        durations = []
        rules = cfg.states.suspensions
        if stats.red:
            durations.append(rng.randint(rules.red_min_matches, rules.red_max_matches) if stats.direct_red else rules.second_yellow_matches)
        for threshold in rules.yellow_thresholds:
            if discipline.yellows >= threshold.yellows and threshold.yellows not in discipline.served_thresholds:
                durations.append(threshold.matches)
                discipline.served_thresholds.append(threshold.yellows)
        discipline.suspended_matches += max(durations, default=0)
    for event in result.events:
        if event.kind == "injury":
            player = get_player(world, event.player_id)
            player.injury = draw_injury(world.date, cfg, rng)
            if player.id >= 0:
                text = f"{player.name} se blesse en sélection, indisponible jusqu’au {player.injury.end.iso()}."
                world.journal.append(JournalEntry(world.date, "injury", text, player.club_id, player.id))
                add_news(world, "injury", text, player.club_id, player.id)
    home, away = state.nations[match.home_id], state.nations[match.away_id]
    expected = 1 / (1 + pow(10, (away.strength - home.strength) / 25))
    actual = 1 if result.home_goals > result.away_goals else 0 if result.home_goals < result.away_goals else .5
    change = .8 * (actual - expected)
    home.strength = clamp(home.strength + change, 1, 100)
    away.strength = clamp(away.strength - change, 1, 100)
    match.result = result


def play_international_day(world: World) -> None:
    for match in sorted(world.international.matches.values(), key=lambda m: m.id):
        if match.date != world.date or match.result:
            continue
        edition = world.international.editions[match.season]
        lineups = [camp_lineup(world, edition, nid) for nid in (match.home_id, match.away_id)]
        result = PossessionEngine().simulate(*lineups, world.config,
                    stream(world.seed, "international-match", match.id), neutral=match.neutral)
        result.temporary_players = {p.id: p.name for lineup in lineups
                                    for p in [*(slot.player for slot in lineup.slots), *lineup.bench] if p.id < 0}
        if match.round_number >= 14:
            decide_winner(world, match, result, lineups)
        apply_international_result(world, edition, match, result, lineups)
    progress_international(world)
    _release_camps(world)
