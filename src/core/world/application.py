"""The only entry point for applying decisions to an existing world."""
from core.domain.players import Discipline
from core.domain.clubs import ClubStatus
from core.domain.world import World, JournalEntry, TransferRecord, SeasonRecord, MovementSnapshot
from core.domain.matches import MatchResult, stored_events
from .finances import book_cash, book_daily_cash
from .human import record as add_news
from .transfer_rules import recent_arrival_ids
from .events import (WorldEvent, PlayerChanged, MatchPlayed, PlayerSigned, PlayerReleased, PlayerGenerated,
                     FinancePosted, BudgetRenewed, ReputationRevised, DivisionsChanged, SeasonOpened, DateAdvanced,
                     OffersUpdated, RenewalProposed)


def apply(world: World, event: WorldEvent) -> bool:
    if isinstance(event, OffersUpdated):
        world.offers = {offer.key: offer for offer in event.offers}
    elif isinstance(event, RenewalProposed):
        proposal = event.proposal
        world.pending_renewals[proposal.player_id] = proposal
        player = world.players[proposal.player_id]
        add_news(world, "renewal_proposed", f"{player.name} est prêt à prolonger à {proposal.contract.weekly_wage} €/semaine.",
              proposal.club_id, proposal.player_id)
    elif isinstance(event, DateAdvanced):
        if event.date < world.date: raise ValueError("Game time cannot move backwards")
        world.date = event.date
    elif isinstance(event, PlayerChanged):
        player = world.players[event.player_id]
        for name in ("attributes", "rating", "fitness", "form", "morale"):
            value = getattr(event, name)
            if value is not None: setattr(player, name, value)
        if event.healed: player.injury = None
        if event.injury is not None:
            player.injury = event.injury
            text = f"{player.name} indisponible jusqu'au {event.injury.end.iso()}."
            world.journal.append(JournalEntry(world.date, "injury", text, player.club_id, player.id))
            add_news(world, "injury", text, player.club_id, player.id)
        if event.healed:
            add_news(world, "injury_end", f"{player.name} est de nouveau disponible.", player.club_id, player.id)
        if event.reset_month: player.monthly_minutes = 0
    elif isinstance(event, MatchPlayed):
        _apply_match(world, event)
    elif isinstance(event, PlayerSigned):
        return _apply_signing(world, event)
    elif isinstance(event, PlayerReleased):
        player = world.players[event.player_id]
        source = player.club_id
        if source is not None:
            club = world.clubs[source]
            club.player_ids.remove(player.id)
            club.wage_bill -= player.contract.weekly_wage
        player.club_id, player.contract = None, None
        if event.retirement:
            from core.domain.international import InternationalCareer
            world.international.retired_careers[player.id] = InternationalCareer(
                player.national_team, player.international_caps, player.international_goals,
                player.historical_caps, player.historical_goals)
            world.retired[player.id] = player.name
            del world.players[player.id]
        kind = "retirement" if event.retirement else "release"
        world.transfers.append(TransferRecord(world.date, player.id, source, None, 0, kind, world.season, born=player.born))
        text = f"{player.name} : {'fin de carrière' if event.retirement else 'fin de contrat'}."
        world.journal.append(JournalEntry(world.date, kind, text, source, player.id))
        add_news(world, kind, text, source, player.id)
        world.pending_renewals.pop(event.player_id, None)
    elif isinstance(event, PlayerGenerated):
        player = event.player
        if player.id in world.players or player.id in world.retired: raise ValueError("Reused player ID")
        if player.club_id is not None:
            club = world.clubs[player.club_id]
            if len(club.player_ids) >= world.config.management.guardrails.max_squad or club.wage_bill + player.contract.weekly_wage > club.wage_cap:
                return False
            club.player_ids.append(player.id)
            club.wage_bill += player.contract.weekly_wage
        world.players[player.id] = player
        world.next_id = max(world.next_id, player.id + 1)
        world.trajectories[player.id] = [(world.season, player.rating)]
        if player.club_id is not None:
            from .estimates import estimate_potential
            from core.ai.market import market_value
            estimate = estimate_potential(player, world.date, world.seed, world.config)
            snapshot = MovementSnapshot(player.born, player.nationalities, player.position, player.rating,
                                        estimate.lower, estimate.upper, player.contract.weekly_wage,
                                        market_value(player, world), player.contract.end, player.fitness, player.potential)
            world.transfers.append(TransferRecord(world.date, player.id, None, player.club_id, 0, "academy", world.season,
                                                 born=player.born, snapshot=snapshot))
        if player.club_id and world.clubs[player.club_id].competition_id:
            text = f"{player.name} rejoint le centre de formation."
            world.journal.append(JournalEntry(world.date, "academy", text, player.club_id, player.id))
            add_news(world, "academy", text, player.club_id, player.id)
    elif isinstance(event, FinancePosted):
        club = world.clubs[event.club_id]
        book_daily_cash(world, club, event.change)
        club.balance += event.change
        club.accounting_remainder = event.remainder
    elif isinstance(event, BudgetRenewed):
        club = world.clubs[event.club_id]
        club.income, club.wage_cap, club.transfer_budget = event.income, event.wage_cap, event.transfer_budget
        if event.funding_factor is not None: club.funding_factor = event.funding_factor
        club.previous_rank = event.rank
        club.season_spent = club.season_sales = 0
    elif isinstance(event, ReputationRevised):
        world.clubs[event.club_id].reputation = event.reputation
    elif isinstance(event, DivisionsChanged):
        for movement in event.movements:
            if movement.source_id is not None:
                world.competitions[movement.source_id].club_ids.remove(movement.club_id)
        for movement in event.movements:
            club = world.clubs[movement.club_id]
            club.competition_id, club.division_id = movement.target_id, movement.division_id
            club.status = ClubStatus.ACTIVE if movement.target_id is not None else ClubStatus.DORMANT
            target = world.competitions.get(movement.target_id)
            source = world.competitions.get(movement.source_id)
            if target is not None:
                target.club_ids.append(club.id)
            promoted = target is not None and (source is None or target.level < source.level)
            destination = target.name if target else "division non simulée"
            kind = "promotion" if promoted else "relegation"
            action = "promu" if promoted else "relégué"
            text = f"{club.name} est {action} en {destination}."
            world.journal.append(JournalEntry(world.date, kind, text, club.id))
            add_news(world, kind, text, club.id)
        for competition in world.competitions.values():
            competition.club_ids.sort()
    elif isinstance(event, SeasonOpened):
        previous = world.season
        world.season = event.year
        world.last_annual_review = event.year
        for competition_id, winner in event.champions.items():
            world.champions.setdefault(competition_id, []).append((previous, winner))
        for competition in world.competitions.values(): competition.match_ids = []
        for match in event.matches:
            world.matches[match.id] = match
            world.competitions[match.competition_id].match_ids.append(match.id)
            world.next_id = max(world.next_id, match.id + 1)
        for match in world.matches.values():
            if match.season < event.year and match.result and match.result.engine != "archived":
                match.result = _archived(match.result)
        for club in world.clubs.values():
            world.reputation_history.setdefault(club.id, []).append((event.year, club.reputation))
        for player in world.players.values():
            world.trajectories.setdefault(player.id, []).append((event.year, player.rating))
            player.season_minutes = player.season_goals = player.season_assists = player.appearances = player.substitutes = 0
            player.rating_sum = player.rating_count = 0
            for discipline in player.discipline.values():
                discipline.yellows = 0
                discipline.served_thresholds.clear()
        # Daily UI journal is bounded; durable scores, transfers and histories are separate.
        world.journal[:] = [entry for entry in world.journal if entry.date.year >= event.year - 1]
        world.journal.append(JournalEntry(world.date, "season", f"Ouverture de la saison {event.year}/{event.year + 1}."))
        if world.controlled_club_id is not None:
            add_news(world, "season", f"Ouverture de la saison {event.year}/{event.year + 1}.", world.controlled_club_id)
    else:
        raise TypeError(f"Unrecognized world event: {type(event)}")
    return True


def _apply_signing(world: World, event: PlayerSigned) -> bool:
    player = world.players.get(event.player_id)
    if player is None or player.club_id != event.source_id: return False
    club = world.clubs[event.target_id]
    guard = world.config.management.guardrails
    old_wage = player.contract.weekly_wage if event.renewal and player.contract else 0
    if club.wage_bill - old_wage + event.contract.weekly_wage > club.wage_cap: return False
    if event.renewal:
        if event.source_id != event.target_id: return False
        club.wage_bill += event.contract.weekly_wage - old_wage
        player.contract = event.contract
        return True
    if event.source_id == event.target_id or len(club.player_ids) >= guard.max_squad: return False
    if player.id in recent_arrival_ids(world): return False
    reservations = [offer for offer in world.offers.values() if offer.target_id == club.id and offer.player_id != player.id]
    reserved_money = sum(offer.ceiling for offer in reservations)
    if event.fee + reserved_money > club.transfer_budget or club.balance - event.fee - reserved_money < guard.min_balance: return False
    if len(club.player_ids) + len(reservations) >= guard.max_squad: return False
    if club.wage_bill + event.contract.weekly_wage + sum(offer.contract.weekly_wage for offer in reservations) > club.wage_cap: return False
    if event.source_id is not None:
        seller = world.clubs[event.source_id]
        if seller.competition_id is not None:
            if len(seller.player_ids) <= guard.min_squad: return False
            if player.position == "GB" and sum(world.players[pid].position == "GB" for pid in seller.player_ids) <= guard.min_goalkeepers: return False
        seller.player_ids.remove(player.id)
        seller.wage_bill -= player.contract.weekly_wage
        if event.fee: book_cash(world, seller, transfer_index=len(world.transfers), transfer_income=event.fee)
        seller.balance += event.fee
        seller.transfer_budget += event.fee
        seller.season_sales += event.fee
    player.club_id, player.contract = club.id, event.contract
    club.player_ids.append(player.id)
    club.wage_bill += event.contract.weekly_wage
    if event.fee: book_cash(world, club, transfer_index=len(world.transfers), transfer_expenses=event.fee)
    club.balance -= event.fee
    club.transfer_budget -= event.fee
    club.season_spent += event.fee
    world.transfers.append(TransferRecord(world.date, player.id, event.source_id, club.id, event.fee, "transfer", world.season))
    text = f"{player.name} rejoint {club.name}."
    world.journal.append(JournalEntry(world.date, "transfer", text, club.id, player.id))
    add_news(world, "transfer", text, club.id, player.id)
    if event.source_id is not None:
        add_news(world, "transfer", text, event.source_id, player.id)
    world.pending_renewals.pop(player.id, None)
    return True


def _archived(result: MatchResult) -> MatchResult:
    """Score only, plus the knockout outcome that bracket and qualification checks still read."""
    return MatchResult(result.home_goals, result.away_goals, "archived", status=result.status,
                       penalties=result.penalties, winner_id=result.winner_id)


def _apply_match(world: World, event: MatchPlayed) -> None:
    match = world.matches[event.match_id]
    if match.result is not None: raise ValueError("A match cannot be applied twice")
    match.result = event.result
    # Full engine logs made up most of a save; the views only list the kinds that remain.
    event.result.events = stored_events(event.result.events)
    for club_id in (match.home_id, match.away_id):
        for pid in world.clubs[club_id].player_ids:
            discipline = world.players[pid].discipline.get(match.competition_id)
            if discipline and discipline.suspended_matches > 0:
                discipline.suspended_matches -= 1
                if discipline.suspended_matches == 0:
                    add_news(world, "suspension_end", f"{world.players[pid].name} n'est plus suspendu.", club_id, pid)
    starters = {pid for pid, _ in event.result.home_lineup + event.result.away_lineup}
    for pid, stats in event.result.player_stats.items():
        if pid in event.result.temporary_players:
            continue
        player = world.players[pid]
        player.fitness = stats.final_fitness
        player.monthly_minutes += stats.minutes
        player.season_minutes += stats.minutes
        player.season_goals += stats.goals
        player.season_assists += stats.assists
        player.appearances += int(stats.minutes > 0)
        player.substitutes += int(stats.minutes > 0 and pid not in starters)
        if stats.rating is not None:
            player.rating_sum += stats.rating
            player.rating_count += 1
            player.form = event.forms[pid]
        discipline = player.discipline.setdefault(match.competition_id, Discipline())
        discipline.yellows += stats.yellows
        discipline.suspended_matches += event.suspensions.get(pid, 0)
        if event.suspensions.get(pid, 0):
            add_news(world, "suspension", f"{player.name} est suspendu {event.suspensions[pid]} match(s).", player.club_id, pid, match.id)
        for threshold in world.config.states.suspensions.yellow_thresholds:
            if discipline.yellows >= threshold.yellows and threshold.yellows not in discipline.served_thresholds:
                discipline.served_thresholds.append(threshold.yellows)
        if pid in event.injuries:
            player.injury = event.injuries[pid]
            text = f"{player.name} se blesse en match."
            world.journal.append(JournalEntry(world.date, "injury", text, player.club_id, pid, match.id))
            add_news(world, "injury", text, player.club_id, pid, match.id)
        key = f"{match.season}:{pid}:{player.club_id}:{match.competition_id}"
        record = world.records.setdefault(key, SeasonRecord(match.season, pid, player.club_id, match.competition_id))
        record.minutes += stats.minutes
        record.matches += int(stats.minutes > 0)
        record.substitutes += int(stats.minutes > 0 and pid not in starters)
        record.goals += stats.goals
        record.assists += stats.assists
        record.yellows += stats.yellows
        record.reds += int(stats.red)
        if stats.rating is not None:
            record.rating_sum += stats.rating
            record.rating_count += 1
    result_text = f"{world.clubs[match.home_id].name} {event.result.home_goals}–{event.result.away_goals} {world.clubs[match.away_id].name}"
    world.journal.append(JournalEntry(world.date, "result", result_text, match.home_id, match_id=match.id))
    for club_id in (match.home_id, match.away_id):
        add_news(world, "result", result_text, club_id, match_id=match.id)
