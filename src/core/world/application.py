"""The only entry point for applying decisions to an existing world."""
from core.domain.date import Date, readable_duration
from core.domain.players import Discipline, Loan
from core.domain.clubs import ClubStatus
from core.domain.world import World, JournalEntry, NewsLine, TransferRecord, SeasonRecord, MovementSnapshot
from core.domain.matches import MatchResult, stored_events
from .finances import book_cash, book_daily_cash
from .human import record as add_news, report
from .transfer_rules import recent_arrival_ids
from .events import (WorldEvent, PlayerChanged, MatchPlayed, PlayerSigned, PlayerReleased, PlayerGenerated,
                     FinancePosted, BudgetRenewed, BudgetShifted, ReputationRevised, DivisionsChanged, SeasonOpened, DateAdvanced,
                     OffersUpdated, RenewalProposed, ReserveChanged, LoanStarted, LoanEnded)


def movement_snapshot(world: World, player) -> MovementSnapshot:
    """Who a player is on the day of a movement that the screens tell later on: a promotion, a retirement."""
    from .estimates import estimate_potential
    from core.ai.market import market_value
    estimate = estimate_potential(player, world.date, world.seed, world.config)
    contract = player.contract
    return MovementSnapshot(player.born, player.nationalities, player.position, player.rating, estimate.lower, estimate.upper,
                            contract.weekly_wage if contract else 0, market_value(player, world), contract.end if contract else None,
                            player.fitness, player.potential)


def apply(world: World, event: WorldEvent) -> bool:
    if isinstance(event, OffersUpdated):
        world.offers = {offer.key: offer for offer in event.offers}
    elif isinstance(event, RenewalProposed):
        proposal = event.proposal
        world.pending_renewals[proposal.player_id] = proposal
        from .news import renewal_lines
        add_news(world, "renewal_proposed", "", proposal.club_id, proposal.player_id,
                 lines=renewal_lines(world.players[proposal.player_id].contract, proposal.contract))
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
            text = f"{player.name} indisponible jusqu'au {event.injury.end.day_month()}"
            world.journal.append(JournalEntry(world.date, "injury", text, player.club_id, player.id))
            report(world, "injury", NewsLine(player_id=player.id, until=event.injury.end), player.club_id)
        if event.healed:
            report(world, "injury_end", NewsLine(player_id=player.id), player.club_id)
        if event.reset_month:  # The monthly progression.
            player.monthly_minutes = 0
            player.reserve_days = 0
            world.record_level(player)
    elif isinstance(event, MatchPlayed):
        _apply_match(world, event)
    elif isinstance(event, PlayerSigned):
        return _apply_signing(world, event)
    elif isinstance(event, PlayerReleased):
        player = world.players[event.player_id]
        source = player.club_id
        # A retired player leaves the world: his retirement keeps who he was, as a promotion does.
        snapshot = movement_snapshot(world, player) if event.retirement else None
        if source is not None:
            world.clubs[source].player_ids.remove(player.id)
            if player.loan is not None: world.clubs[source].borrowed_ids.remove(player.id)
            # A player on loan leaves the club that owns him and pays him.
            source = player.owner_id
            club = world.clubs[source]
            club.wage_bill -= player.contract.weekly_wage
            if player.loan is not None: club.loaned_ids.remove(player.id)
        player.club_id, player.contract, player.loan = None, None, None
        _leave_reserve(player)
        if event.retirement:
            from core.domain.international import InternationalCareer
            world.international.retired_careers[player.id] = InternationalCareer(
                player.national_team, player.international_caps, player.international_goals,
                player.historical_caps, player.historical_goals)
            world.retired[player.id] = player.name
            del world.players[player.id]
        kind = "retirement" if event.retirement else "release"
        world.transfers.append(TransferRecord(world.date, player.id, source, None, 0, kind, world.season, born=player.born, snapshot=snapshot))
        text = f"{player.name} : {'fin de carrière' if event.retirement else 'fin de contrat'}"
        world.journal.append(JournalEntry(world.date, kind, text, source, player.id))
        report(world, kind, NewsLine(player_id=player.id), source)
        world.pending_renewals.pop(event.player_id, None)
        world.refused_renewals.pop(event.player_id, None)
        _off_sale(world, player.id)
    elif isinstance(event, PlayerGenerated):
        player = event.player
        if player.id in world.players or player.id in world.retired: raise ValueError("Reused player ID")
        if player.club_id is not None:
            from core.ai.market import short_of_players, wage_room
            club = world.clubs[player.club_id]
            if club.squad_size >= world.config.management.guardrails.max_squad: return False
            missing = player.contract.weekly_wage - wage_room(club, world.config, 1)
            if missing > 0:
                # A club that plays fields its minimum squad whatever its wages: its cap gives way to the academy wage.
                if club.competition_id is None or not short_of_players([world.players[pid] for pid in club.player_ids], world.config):
                    return False
                club.wage_cap += missing
            club.player_ids.append(player.id)
            club.wage_bill += player.contract.weekly_wage
        world.players[player.id] = player
        world.next_id = max(world.next_id, player.id + 1)
        world.record_level(player)
        if player.club_id is not None:
            world.transfers.append(TransferRecord(world.date, player.id, None, player.club_id, 0, "academy", world.season,
                                                 born=player.born, snapshot=movement_snapshot(world, player)))
        if player.club_id and world.clubs[player.club_id].competition_id:
            text = f"{player.name} rejoint le centre de formation"
            world.journal.append(JournalEntry(world.date, "academy", text, player.club_id, player.id))
            report(world, "academy", NewsLine(player_id=player.id), player.club_id)
    elif isinstance(event, ReserveChanged):
        player = world.players[event.player_id]
        if event.reserve:
            if player.reserve_since is None: player.reserve_since = world.date
        else:
            _leave_reserve(player, world.date)
    elif isinstance(event, LoanStarted):
        return _start_loan(world, event)
    elif isinstance(event, LoanEnded):
        _end_loan(world, event)
    elif isinstance(event, FinancePosted):
        club = world.clubs[event.club_id]
        book_daily_cash(world, club, event.change, event.investment, event.unseen_wages)
        club.balance += event.change
        club.accounting_remainder = event.remainder
    elif isinstance(event, BudgetRenewed):
        club = world.clubs[event.club_id]
        club.income, club.wage_cap, club.transfer_budget = event.income, event.wage_cap, event.transfer_budget
        club.wage_shift = event.wage_shift
        club.prize_income = dict(event.prizes or {})
        if event.funding_factor is not None: club.funding_factor = event.funding_factor
        club.previous_rank = event.rank
        club.season_spent = club.season_sales = 0
    elif isinstance(event, BudgetShifted):
        club = world.clubs[event.club_id]
        moved = event.weekly * world.config.management.budgets.weeks_per_year
        reserved = [offer for offer in world.offers.values() if offer.target_id == club.id]
        # Each side gives what it has free: the cap stays over the wages paid and reserved, the budget over the fees reserved.
        if event.weekly < 0 and club.wage_cap + event.weekly < club.wage_bill + sum(offer.contract.weekly_wage for offer in reserved): return False
        if event.weekly > 0 and club.transfer_budget - moved < sum(offer.ceiling for offer in reserved): return False
        # A share between two budgets: no cash moves.
        club.wage_cap += event.weekly
        club.transfer_budget -= moved
        club.wage_shift += event.weekly
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
            text = f"{club.name} est {action} en {destination}"
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
        # What the season made of each player's value outlives it, until the next one says enough.
        from core.ai.market import season_performance
        busiest = {club.id: max((world.players[pid].season_minutes for pid in club.player_ids), default=0)
                   for club in world.clubs.values() if club.competition_id is not None}
        for player in world.players.values():
            played = busiest.get(player.club_id, 0)
            player.past_performance = season_performance(player, played, world.config) if played else 1.0
            player.season_minutes = player.season_goals = player.season_assists = player.appearances = player.substitutes = 0
            player.rating_sum = player.rating_count = 0
            for discipline in player.discipline.values():
                discipline.yellows = 0
                discipline.served_thresholds.clear()
        # Daily UI journal is bounded; durable scores, transfers and histories are separate.
        world.journal[:] = [entry for entry in world.journal if entry.date.year >= event.year - 1]
        world.journal.append(JournalEntry(world.date, "season", f"Ouverture de la saison {event.year}/{event.year + 1}."))
        if world.controlled_club_id is not None:
            add_news(world, "season", f"Ouverture de la saison {event.year}/{event.year + 1}", world.controlled_club_id)
    else:
        raise TypeError(f"Unrecognized world event: {type(event)}")
    return True


def _apply_signing(world: World, event: PlayerSigned) -> bool:
    player = world.players.get(event.player_id)
    if player is None or player.club_id != event.source_id: return False
    # A player on loan neither moves nor signs again before he is back.
    if player.loan is not None: return False
    club = world.clubs[event.target_id]
    guard = world.config.management.guardrails
    from core.ai.market import wage_room
    old_wage = player.contract.weekly_wage if event.renewal and player.contract else 0
    # What he earns already is committed: a dormant club over what its unseen squad leaves can still extend him at no more.
    if event.contract.weekly_wage - old_wage > max(0, wage_room(club, world.config, 0 if event.renewal else 1)): return False
    if event.renewal:
        if event.source_id != event.target_id: return False
        club.wage_bill += event.contract.weekly_wage - old_wage
        player.contract = event.contract
        # A demand turned down was about the contract he had.
        world.refused_renewals.pop(player.id, None)
        return True
    if event.source_id == event.target_id or club.squad_size >= guard.max_squad: return False
    if player.id in recent_arrival_ids(world): return False
    reservations = [offer for offer in world.offers.values() if offer.target_id == club.id and offer.player_id != player.id]
    reserved_money = sum(offer.ceiling for offer in reservations)
    if event.fee + reserved_money > club.transfer_budget or club.balance - event.fee - reserved_money < guard.min_balance: return False
    if club.squad_size + len(reservations) >= guard.max_squad: return False
    if event.contract.weekly_wage + sum(offer.contract.weekly_wage for offer in reservations) > wage_room(club, world.config, 1 + len(reservations)): return False
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
    _leave_reserve(player)
    club.player_ids.append(player.id)
    club.wage_bill += event.contract.weekly_wage
    if event.fee: book_cash(world, club, transfer_index=len(world.transfers), transfer_expenses=event.fee)
    club.balance -= event.fee
    club.transfer_budget -= event.fee
    club.season_spent += event.fee
    world.transfers.append(TransferRecord(world.date, player.id, event.source_id, club.id, event.fee, "transfer", world.season))
    text = f"{player.name} rejoint {club.name}"
    world.journal.append(JournalEntry(world.date, "transfer", text, club.id, player.id))
    add_news(world, "transfer", text, club.id, player.id, lines=(NewsLine(club_id=club.id),))
    if event.source_id is not None:
        add_news(world, "transfer", text, event.source_id, player.id, lines=(NewsLine(club_id=club.id),))
    world.pending_renewals.pop(player.id, None)
    world.refused_renewals.pop(player.id, None)
    _off_sale(world, player.id)
    return True


def _leave_reserve(player, today: Date | None = None) -> None:
    """Back in a first team. Called back by his club (`today` given), the days of the month he spent in its reserve
    still count for his progression; leaving the club, they are lost."""
    if today is None:
        player.reserve_days = 0
    elif player.reserve_since is not None:
        player.reserve_days += today.ordinal() - max(player.reserve_since, Date(today.year, today.month, 1)).ordinal()
    player.reserve_since = None


def _start_loan(world: World, event: LoanStarted) -> bool:
    player = world.players.get(event.player_id)
    if player is None or player.club_id is None or player.loan is not None or player.club_id == event.target_id: return False
    owner, club = world.clubs[player.club_id], world.clubs[event.target_id]
    if player.contract.end <= event.end: return False
    owner.player_ids.remove(player.id)
    owner.loaned_ids.append(player.id)
    club.player_ids.append(player.id)
    club.borrowed_ids.append(player.id)
    player.club_id, player.loan = club.id, Loan(owner.id, world.date, event.end)
    _leave_reserve(player)
    world.transfers.append(TransferRecord(world.date, player.id, owner.id, club.id, 0, "loan", world.season))
    text = f"{player.name} est prêté à {club.name} jusqu'au {event.end.day_month()} {event.end.year}"
    world.journal.append(JournalEntry(world.date, "loan", text, club.id, player.id))
    for club_id in (owner.id, club.id): add_news(world, "loan", text, club_id, player.id, lines=(NewsLine(club_id=club.id),))
    # His owner no longer sells him nor extends his contract while he is away.
    world.pending_renewals.pop(player.id, None)
    _off_sale(world, player.id, away=True)
    world.offers = {key: offer for key, offer in world.offers.items() if offer.player_id != player.id}
    return True


def _end_loan(world: World, event: LoanEnded) -> None:
    player = world.players[event.player_id]
    club, owner = world.clubs[player.club_id], world.clubs[player.loan.parent_id]
    club.player_ids.remove(player.id)
    club.borrowed_ids.remove(player.id)
    owner.loaned_ids.remove(player.id)
    owner.player_ids.append(player.id)
    player.club_id, player.loan = owner.id, None
    world.transfers.append(TransferRecord(world.date, player.id, club.id, owner.id, 0, "loan_return", world.season))
    text = f"{player.name} revient de son prêt à {club.name}"
    for club_id in (owner.id, club.id): add_news(world, "loan_return", text, club_id, player.id, lines=(NewsLine(club_id=club.id),))


def _off_sale(world: World, player_id: int, away: bool = False) -> None:
    """A player who left his club is no longer on its transfer list nor waiting to be offered again, and what it
    decided about the offers for him no longer stands. Lent (`away`), he stays not for sale if it declared him so."""
    world.transfer_list.pop(player_id, None)
    world.offered_until.pop(player_id, None)
    world.turned_away.pop(player_id, None)
    if not away: world.not_for_sale.pop(player_id, None)


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
            report(world, "suspension", NewsLine(player_id=pid, amount=event.suspensions[pid]), player.club_id, match_id=match.id)
        for threshold in world.config.states.suspensions.yellow_thresholds:
            if discipline.yellows >= threshold.yellows and threshold.yellows not in discipline.served_thresholds:
                discipline.served_thresholds.append(threshold.yellows)
        if pid in event.injuries:
            player.injury = event.injuries[pid]
            text = f"{player.name} se blesse en match ({readable_duration(player.injury.end.ordinal() - world.date.ordinal())})"
            world.journal.append(JournalEntry(world.date, "injury", text, player.club_id, pid, match.id))
            report(world, "injury", NewsLine(player_id=pid, until=player.injury.end), player.club_id, match_id=match.id)
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
