"""Public read models; simulation RNGs never leave this layer."""
from __future__ import annotations

from dataclasses import asdict, replace
import unicodedata

from core.domain.clubs import Competition
from core.domain.date import Date
from core.domain.world import World
from core.domain.players import Player, Position, ATTRIBUTE_NAMES
from core.domain.matches import Match, MatchResult
from core.ai.market import market_value, asking_price, can_sell
from core.engine.abilities import weighted_rating
from core.world.calendar import standings
from core.world.finances import financial_season
from core.world.cups import ROUND_NAMES


def normalized(value: str) -> str:
    return "".join(character for character in unicodedata.normalize("NFKD", value.casefold()) if not unicodedata.combining(character))


POSITION_ORDER = ["GB", "DG", "DD", "DC", "MDC", "MC", "MOC", "AILG", "AILD", "BU"]


def position_rank(position: str) -> int:
    return POSITION_ORDER.index(position) if position in POSITION_ORDER else len(POSITION_ORDER)


# The composites the match engine plays with (`attributs.composites`), by their configuration name, in the order the
# screens show them: attack, defence, then goalkeeping.
COMPOSITES = {"progression_attaque": "progression_attack", "occasion_attaque": "creation_attack", "tir": "shooting",
              "tete": "heading", "progression_defense": "progression_defense", "occasion_defense": "creation_defense",
              "arret": "saving", "sortie": "claiming"}
# What each position mostly asks of a player, after its involvement in each phase of play (implications.json) and whom
# the engine names on a shot: the composites the screens single out, the key one first. A display choice: no match reads it.
COMPOSITES_BY_POSITION = {
    "GB": ("arret", "sortie"),
    "DC": ("occasion_defense", "progression_defense", "tete"),
    "DG": ("progression_defense", "progression_attaque", "occasion_defense"),
    "DD": ("progression_defense", "progression_attaque", "occasion_defense"),
    "MDC": ("progression_defense", "progression_attaque"),
    "MC": ("progression_attaque", "progression_defense"),
    "MOC": ("occasion_attaque", "progression_attaque", "tir"),
    "AILG": ("progression_attaque", "occasion_attaque", "tir"),
    "AILD": ("progression_attaque", "occasion_attaque", "tir"),
    "BU": ("tir", "occasion_attaque", "tete")}


def composite(player: Player, key: str, cfg) -> float:
    return weighted_rating(player.attributes, getattr(cfg.attributes.composites, COMPOSITES[key]))


def position_notes(player: Player, cfg) -> dict[str, float]:
    """The player's note at each position, on the level's scale: the mean of the composites that position singles out,
    times the engine's out-of-position factor for his affinity there."""
    values = {key: composite(player, key, cfg) for key in COMPOSITES}
    penalty = cfg.attributes.out_of_position
    return {position: round(sum(values[key] for key in keys) / len(keys)
                            * (penalty.base + penalty.factor * player.affinity(Position(position))), 1)
            for position, keys in COMPOSITES_BY_POSITION.items()}


def position_affinities(player: Player) -> dict[str, int]:
    """His affinity to each position out of 20, as the engine reads it: his ratings by position, and without any his own and his secondary ones."""
    return {position.value: round(player.affinity(position) * 20) for position in Position}


def paginate(items: list, page: int, size: int = 30) -> dict:
    return {"items": items[(page - 1) * size:page * size], "total": len(items), "page": page, "page_size": size}


def season_steps(seasons, selected: int, current: int | None = None) -> dict:
    """The season shown, the ones to step to on either side of it and the list of them all, the latest first, among those
    that have something to show; `current` is the season under way, when the list may hold it."""
    listed = sorted({*seasons, selected}, reverse=True)
    return {"season": selected, "previous_season": max((year for year in listed if year < selected), default=None),
            "next_season": min((year for year in listed if year > selected), default=None),
            "seasons": listed, "current_season": current}


def club_ref(world: World, club_id: int | None) -> dict | None:
    club = world.clubs.get(club_id)
    return {"id": club.id, "name": club.name, "major_color": club.home_kit_major_color,
            "minor_color": club.home_kit_minor_color} if club else None


def selection_id(world: World, nation: str | None) -> int | None:
    """The selection of a country, where its flag leads; None when the game has none."""
    return next((team.id for team in world.international.nations.values() if team.code == nation), None)


def title(world: World, competition_id: int, season: int) -> dict:
    """What a competition's header says of its title in `season`: who won it, once it is decided, and who held it until then."""
    champions = world.champions.get(competition_id, [])
    winner = next((club_id for year, club_id in champions if year == season), None)
    holder = max(((year, club_id) for year, club_id in champions if year < season), default=(None, None))[1]
    return {"winner": club_ref(world, winner), "holder": club_ref(world, holder)}


def player_name(world: World, player_id: int | None) -> str | None:
    player = world.players.get(player_id)
    return player.name if player else world.retired.get(player_id)


def loan_ref(world: World, player: Player) -> dict | None:
    """The loan a player is on: the club that owns him, the one he plays for, and the last day he spends there."""
    loan = player.loan
    return {"parent": club_ref(world, loan.parent_id), "club": club_ref(world, player.club_id), "end": loan.end.iso()} if loan else None


def player_row(world: World, player: Player) -> dict:
    contract = player.contract
    return {"id": player.id, "name": player.name, "position": player.position.value,
            "loan": loan_ref(world, player), "reserve": player.reserve_since is not None,
            "age": player.born.age_on(world.date), "nation": player.nation, "rating": round(player.rating, 1),
            "potential": round(player.potential, 1),
            "attributes": dict(zip(ATTRIBUTE_NAMES, player.attributes.values)),
            "composites": {key: round(composite(player, key, world.config), 1) for key in COMPOSITES},
            "key_composites": list(COMPOSITES_BY_POSITION[player.position]),
            "nationalities": list(player.nationalities),
            "nationality_names": [world.nation_names.get(code, code) for code in player.nationalities],
            "value": market_value(player, world),
            "club": club_ref(world, player.club_id), "wage": contract.weekly_wage if contract else 0,
            "contract_end": contract.end.iso() if contract else None,
            "expiring": bool(contract and world.date.months_until(contract.end) < 12),
            "fitness": player.fitness, "form": round(player.form, 3), "morale": round(player.morale, 3),
            "injured_until": player.injury.end.iso() if player.injury else None,
            "suspension": max((item.suspended_matches for item in player.discipline.values()), default=0),
            "goals": player.season_goals, "assists": player.season_assists,
            "appearances": player.appearances, "substitutes": player.substitutes, "minutes": round(player.season_minutes),
            "average": round(player.rating_sum / player.rating_count, 2) if player.rating_count else None}


def asking_quote(world: World, player: Player, settled: set[int]) -> dict:
    """The lowest fee his club accepts, as shown and offered: rounded up to three significant digits.

    None for a free agent, and for a player his club cannot let go (`transferable` false)."""
    from core.world.market import quoted_minimum
    seller = world.clubs.get(player.club_id) if player.club_id is not None else None
    if seller is None: return {"asking_price": None, "transferable": True}
    if player.id in settled or not can_sell(player, seller, world): return {"asking_price": None, "transferable": False}
    return {"asking_price": quoted_minimum(asking_price(player, seller, world)), "transferable": True}


def interested(world: World, player: Player) -> bool | None:
    """Whether a player accepts to join the human club; None for its own players and without a human club."""
    from core.world.transfer_rules import accepts_move
    club = world.clubs.get(world.controlled_club_id)
    if club is None or club.id in (player.club_id, player.owner_id): return None
    # A player on loan moves nowhere before he is back.
    return player.loan is None and accepts_move(player, club, world)


def asked_wage(world: World, player: Player) -> int | None:
    """The weekly wage he asks to join the human club, as his counter-offer quotes it; None for its own players and without a human club."""
    from core.world import talks
    club = world.clubs.get(world.controlled_club_id)
    return None if club is None or club.id in (player.club_id, player.owner_id) else talks.asked_wage(world, player)


class MarketFlags:
    """What the lists of the world tell of each player beyond his price: whether his club would let him go, for good or
    on loan, and whether he would come to the human club on loan. Read club by club and kept for the other players of a list."""

    def __init__(self, world: World) -> None:
        self.world = world
        self.surplus: dict[int, set[int]] = {}
        self.lendable: dict[int, set[int]] = {}

    def transfer_listed(self, player: Player) -> bool:
        """On the human club's transfer list, or beyond the squad an AI club needs: the players it offers around."""
        from core.ai.market import nominal_size
        from core.world.human import is_human_club, listed_price
        world, club = self.world, self.world.clubs.get(player.club_id)
        if club is None or player.loan is not None: return False
        if is_human_club(world, club.id): return listed_price(world, player.id) is not None
        if club.competition_id is None: return False
        if club.id not in self.surplus:
            weakest = sorted(club.player_ids, key=lambda pid: (world.players[pid].rating, pid))
            self.surplus[club.id] = set(weakest[:max(0, len(weakest) - nominal_size(world.config))])
        return player.id in self.surplus[club.id] and can_sell(player, club, world)

    def loan_listed(self, player: Player) -> bool:
        """A prospect his AI club is ready to lend."""
        from core.world.loans import lendable
        club = self.world.clubs.get(player.club_id)
        if club is None or player.loan is not None: return False
        if club.id not in self.lendable: self.lendable[club.id] = {item.id for item in lendable(self.world, club)}
        return player.id in self.lendable[club.id]

    def loan_interested(self, player: Player) -> bool | None:
        """Whether he would come to the human club on loan; None for its own players and without a human club."""
        from core.world.loans import accepts_loan
        club = self.world.clubs.get(self.world.controlled_club_id)
        if club is None or club.id in (player.club_id, player.owner_id): return None
        return player.club_id is not None and player.loan is None and accepts_loan(self.world, player, club)

    def row(self, player: Player) -> dict:
        return {"transfer_listed": self.transfer_listed(player), "loan_listed": self.loan_listed(player),
                "loan_interested": self.loan_interested(player)}


def squad_view(world: World, player: Player) -> dict:
    """What the human club can do with a player beside buying or selling him: its reserve, and a loan either way.

    A loan names what stops it today, the durations on offer and, for a player of the club, the clubs that would take him."""
    from core.world import loans, reserves
    from core.world.human import is_human_club
    own = is_human_club(world, player.club_id) and player.loan is None
    data = {"pret": loan_ref(world, player), "en_reserve": player.reserve_since is not None,
            "obstacle_reserve": reserves.reserve_obstacle(world, player) if own and player.reserve_since is None else None,
            "sens": "sortant" if own else "entrant", "clubs": [], "durees": [], "obstacle_pret": None}
    if player.loan is not None or world.controlled_club_id is None: return data
    # Each duration is offered only if the loan can run that long: a contract too short for a season may cover half of it.
    check = loans.lender_obstacle if own else loans.borrowing_obstacle
    obstacles = {key: (end, check(world, player, end)) for key, end in sorted(loans.loan_ends(world).items(), key=lambda item: item[1])}
    data["durees"] = [{"cle": key, "fin": end.iso()} for key, (end, obstacle) in obstacles.items() if obstacle is None]
    if not obstacles: data["obstacle_pret"] = "Le mercato est fermé."
    elif not data["durees"]: data["obstacle_pret"] = next(iter(obstacles.values()))[1]
    elif own:
        data["clubs"] = [{**club_ref(world, club.id), "reputation": round(club.reputation, 1),
                          "competition": world.competitions[club.competition_id].name} for club in loans.takers(world, player)]
        if not data["clubs"]: data["obstacle_pret"] = "Aucun club ne lui offrirait assez de temps de jeu."
    return data


def talks_view(world: World, player: Player) -> dict:
    """Where the human club's talks for a player stand, and what stops a new offer."""
    from core.world.talks import talks_for, opening_obstacle, available_budget
    from core.domain.offers import FEE_TALKS, SIGNING
    talks = talks_for(world, player.id)
    rounds = world.config.management.market.negotiation_rounds
    return {"etape": talks.stage if talks else None, "indemnite": talks.fee if talks else None,
            "salaire": talks.contract.weekly_wage if talks and talks.stage == SIGNING else None,
            "contre_offre": talks.counter if talks else None, "tours_restants": rounds - (talks.rounds if talks else 0),
            "date_prevue": talks.due.iso() if talks and talks.due else None, "budget": available_budget(world, player),
            "obstacle": opening_obstacle(world, player) if talks is None or talks.stage == FEE_TALKS else None}


def incoming_offers(world: World, player_id: int) -> list[dict]:
    """The offers for a player of the human club that await its answer."""
    return [{"offre_id": offer.key, "acheteur": club_ref(world, offer.target_id), "indemnite": offer.fee,
             "salaire_propose": offer.contract.weekly_wage}
            for offer in world.offers.values() if offer.player_id == player_id and offer.source_id == world.controlled_club_id
            and offer.awaiting_review]


def sale_view(world: World, player: Player) -> dict:
    """A player of the human club: the fee asked if he is on its transfer list, whether it keeps him off the market,
    what stops offering him to the clubs, and the offers awaiting an answer."""
    from core.world.human import listed_price, untouchable
    from core.world.sales import offer_obstacle
    return {"prix_liste": listed_price(world, player.id), "intransferable": untouchable(world, player.id),
            "obstacle_proposition": offer_obstacle(world, player), "offres": incoming_offers(world, player.id)}


def international_records(world: World, player_id: int) -> list[dict]:
    """A player's international editions, each with the average of the ratings he was given in it (None before any) and
    name of the edition and the two characters of its badge (None for an edition the game no longer holds)."""
    from .international import EDITION_CODES
    editions = world.international.editions
    def badge(year: int) -> dict:
        edition = editions.get(year)
        return {"competition": edition.name if edition else None, "code": EDITION_CODES[edition.kind] if edition else None}
    return [{**asdict(row), "average": round(row.rating_sum / row.rating_count, 2) if row.rating_count else None, **badge(row.edition)}
            for row in world.international.records.values() if row.player_id == player_id]


def player_morale(world: World, player: Player) -> dict:
    """The morale outlook of one player, as the squad list gives it for each player of a club."""
    from core.world.contracts import games_by_club, position_ranks
    from core.world.transfer_rules import season_arrivals
    club = world.clubs.get(player.club_id)
    if club is None: return {"morale_target": None, "morale_cause": None, "wage_satisfaction": None, "playing_time_satisfaction": None}
    played = season_arrivals(world, club.id).get(player.id, (games_by_club(world)[club.id], player.season_minutes))
    return morale_outlook(world, player, club, position_ranks(world, club)[player.id], *played)


def player_detail(world: World, player: Player) -> dict:
    from core.world.transfer_rules import recent_arrival_ids
    result = player_row(world, player)
    result.update(asking_quote(world, player, recent_arrival_ids(world)))
    result.update(player_morale(world, player))
    result.update(MarketFlags(world).row(player))
    result["greed"] = player.greed
    # What the lists of the world tell a recruiter, for the preview beside them.
    result.update({"interested": interested(world, player), "wage_demand": asked_wage(world, player)})
    # The bounds form keeps, for the page to draw it between them.
    result["form_bounds"] = [world.config.states.form.min, world.config.states.form.max]
    result.update({"born": player.born.iso(),
                   "national_team": player.national_team,
                   "national_team_id": next((team.id for team in world.international.nations.values() if team.code == player.national_team), None),
                   "international_caps": player.international_caps, "international_goals": player.international_goals,
                   "historical_caps": player.historical_caps, "historical_goals": player.historical_goals,
                   "international_records": international_records(world, player.id),
                   "secondary_positions": list(player.secondary_positions),
                   # Weight of each attribute in the rating of his main position: the page orders and marks attributes with it.
                   "attribute_weights": dict(world.config.attributes.overall[player.position]),
                   "attributes_imported": player.source_current_ability is not None,
                   "position_ratings": player.position_ratings,
                   "position_notes": position_notes(player, world.config),
                   # The page names what each composite weighs and, for the position picked on its pitch, which ones count there.
                   "composite_weights": {key: dict(getattr(world.config.attributes.composites, name)) for key, name in COMPOSITES.items()},
                   "composites_by_position": {position: list(keys) for position, keys in COMPOSITES_BY_POSITION.items()},
                   "form": player.form, "morale": player.morale, "value": market_value(player, world),
                   "discipline": [{"competition": world.competitions[cid].name, **asdict(item)} for cid, item in player.discipline.items()]
                       + [{"competition": edition.name, **asdict(item)} for edition in world.international.editions.values()
                          if (item := player.international_discipline.get(edition.competition_id)) is not None]})
    return result


def match_row(world: World, match: Match) -> dict:
    if match.id in world.international.matches:
        from .international import international_match_row
        return international_match_row(world, match)
    from core.world.europe import aggregate_score, round_label
    competition = world.competitions[match.competition_id]
    return {"id": match.id, "date": match.date.iso(), "round": match.round_number,
            "season": match.season, "competition_id": match.competition_id,
            "competition": competition.name, "aggregate": aggregate_score(world, match),
            "first_leg_id": match.first_leg_id,
            "home": club_ref(world, match.home_id), "away": club_ref(world, match.away_id),
            "score": [match.result.home_goals, match.result.away_goals] if match.result else None,
            "penalties": match.result.penalties if match.result else None,
            "winner_id": match.result.winner_id if match.result else None,
            "neutral": match.neutral,
            "round_label": (round_label(world, match.round_number) if competition.kind == "europe" else
                            ROUND_NAMES[match.round_number - 1] if competition.kind == "cup"
                            else f"Journée {match.round_number}")}


def table(world: World, competition_id: int, season: int | None = None) -> list[dict]:
    competition = world.competitions[competition_id]
    if competition.kind == "cup":
        return []
    matches = ([world.matches[mid] for mid in competition.match_ids] if season is None else
               [match for match in world.matches.values() if match.season == season and match.competition_id == competition_id])
    if season is not None:
        competition = replace(competition, club_ids=sorted({cid for match in matches for cid in (match.home_id, match.away_id)}))
    count = world.config.world.promotion_relegation.club_count
    if competition.kind == "europe":
        rules = world.config.world.europe
        return [{**asdict(row), "club": club_ref(world, row.club_id), "difference": row.difference,
                 "rank": index + 1, "form": row.form[-5:],
                 "movement": "direct" if index < rules.direct_places else
                             "playoff" if index < rules.direct_places + rules.playoff_places else "eliminated"}
                for index, row in enumerate(standings(competition, matches, world.config))]
    european_places = 0
    if competition.level == 1:
        from core.world.europe import resolve_european_quotas
        quotas = resolve_european_quotas(world, season if season is not None else world.season)
        european_places = sum(quotas.get(competition.nation, (0, 0, 0)))
    return [{**asdict(row), "club": club_ref(world, row.club_id), "difference": row.difference, "rank": index + 1, "form": row.form[-5:],
             "movement": ("champion" if competition.level == 1 and index == 0 else
                          "europe" if competition.level == 1 and index < european_places else
                          "promotion" if competition.level > 1 and index < count else
                          "relegation" if index >= len(competition.club_ids) - count else None)}
            for index, row in enumerate(standings(competition, matches, world.config))]


TOP_SQUAD = 16


def top_average(values) -> float | None:
    """Mean of the TOP_SQUAD best values; a smaller squad averages all it has."""
    best = sorted(values, reverse=True)[:TOP_SQUAD]
    return round(sum(best) / len(best), 1) if best else None


def squad_strength(world: World, club_id: int) -> dict:
    players = [world.players[pid] for pid in world.clubs[club_id].player_ids]
    return {"top_rating": top_average(player.rating for player in players),
            "top_potential": top_average(player.potential for player in players)}


def league_standings(world: World, competition_id: int | None, cache: dict | None = None) -> dict[int, dict]:
    """The standing of each club of a league, by club; `cache` keeps them for the other clubs of a list."""
    if competition_id is None: return {}
    if cache is None: cache = {}
    if competition_id not in cache:
        cache[competition_id] = {row["club_id"]: row for row in table(world, competition_id)}
    return cache[competition_id]


def reserved_budgets(world: World) -> dict[int, int]:
    """What each club's pending offers hold back from its transfer budget."""
    reserved: dict[int, int] = {}
    for offer in world.offers.values():
        reserved[offer.target_id] = reserved.get(offer.target_id, 0) + offer.ceiling
    return reserved


def squad_profile(world: World, club_id: int) -> dict:
    """Mean age and summed market value of a squad; None and 0 without any player."""
    players = [world.players[pid] for pid in world.clubs[club_id].player_ids]
    return {"average_age": round(sum(player.born.age_on(world.date) for player in players) / len(players), 1) if players else None,
            "squad_value": sum(market_value(player, world) for player in players)}


def club_detail(world: World, club_id: int, standings: dict | None = None, reserved: dict[int, int] | None = None) -> dict:
    club = world.clubs[club_id]
    standing = league_standings(world, club.competition_id, standings).get(club.id)
    if reserved is None: reserved = reserved_budgets(world)
    held = dict(world.reputation_history.get(club.id, []))
    return {"id": club.id, "name": club.name, "nation_code": club.nation, "nation": world.nation_names.get(club.nation, club.nation),
            "nation_id": selection_id(world, club.nation),
            "competition_id": club.competition_id, "competition": world.competitions[club.competition_id].name if club.competition_id else None,
            "active": club.competition_id is not None, "capacity": club.capacity, "reputation": round(club.reputation, 1),
            # How far the review that opened the season moved it; None before a second season.
            "reputation_change": round(held[world.season] - held[world.season - 1], 1)
                                 if world.season in held and world.season - 1 in held else None,
            "academy": round(club.academy, 1), "training_facilities": club.training_facilities,
            "youth_recruitment": club.youth_recruitment,
            "formation": club.formation, "squad_size": len(club.player_ids), **squad_strength(world, club_id), "standing": standing,
            **squad_profile(world, club_id),
            # The budget left for a bid, and the wages against their cap (weekly, like every wage of the API).
            "available_budget": max(0, club.transfer_budget - reserved.get(club.id, 0)),
            "wage_bill": club.wage_bill, "wage_cap": club.wage_cap,
            "major_color": club.home_kit_major_color, "minor_color": club.home_kit_minor_color,
            "third_color": club.home_kit_third_color}


def finance_summary(world: World, club_id: int) -> dict:
    club = world.clubs[club_id]
    from core.world.budgets import cap_range
    from core.world.human import is_human_club
    data = {name: getattr(club, name) for name in ("balance", "income", "transfer_budget", "wage_bill", "wage_cap", "wage_shift", "season_spent", "season_sales")}
    data["reserved_transfer_budget"] = sum(offer.ceiling for offer in world.offers.values() if offer.target_id == club_id)
    data["reserved_wages"] = sum(offer.contract.weekly_wage for offer in world.offers.values() if offer.target_id == club_id)
    # The wage caps the human club can set by moving its budgets, lowest and highest (weekly, like every wage of the API).
    data["wage_cap_range"] = list(cap_range(world, club)) if is_human_club(world, club_id) else None
    return data


def transfers(world: World, club_id: int | None = None, player_id: int | None = None, season: int | None = None) -> list[dict]:
    rows = [item for item in world.transfers if (club_id is None or club_id in (item.source_id, item.target_id))
            and (player_id is None or item.player_id == player_id)
            and (season is None or (item.season if item.season is not None else financial_season(world, item.date)) == season)]
    return [transfer_row(world, row) for row in reversed(rows)]


def transfer_row(world: World, row) -> dict:
    player = world.players.get(row.player_id)
    born = row.born or (player.born if player else None)
    if born is None:
        born = next((item.born for item in world.transfers if item.player_id == row.player_id and item.born), None)
    # Position, level and value are the player's today: a movement keeps none of them (None once he has retired).
    return {"date": row.date.iso(), "player_id": row.player_id, "player": player_name(world, row.player_id),
            "source": club_ref(world, row.source_id), "target": club_ref(world, row.target_id), "fee": row.fee, "kind": row.kind,
            "age": born.age_on(row.date) if born else None,
            "position": player.position.value if player else None,
            "nationalities": list(player.nationalities) if player else [],
            "rating": round(player.rating, 1) if player else None,
            "value": market_value(player, world) if player else None}


def academy_player_row(world: World, row) -> dict:
    snapshot = row.snapshot
    if snapshot:
        potential = snapshot.potential
        if potential is None and row.player_id in world.players:
            # Snapshots archived before the exact value was stored; a player's potential never changes.
            potential = world.players[row.player_id].potential
        return {"id": row.player_id, "name": player_name(world, row.player_id), "age": snapshot.born.age_on(row.date),
                "position": snapshot.position, "nationalities": snapshot.nationalities,
                "nationality_names": [world.nation_names.get(code, code) for code in snapshot.nationalities],
                "rating": snapshot.rating, "potential": None if potential is None else round(potential, 1),
                "wage": snapshot.weekly_wage, "value": snapshot.value, "contract_end": snapshot.contract_end.iso() if snapshot.contract_end else None,
                "club": club_ref(world, row.target_id), "fitness": snapshot.fitness, "data_at": "promotion"}
    if row.player_id in world.players:
        return {**player_row(world, world.players[row.player_id]), "data_at": "current"}
    return {"id": row.player_id, "name": player_name(world, row.player_id), "nationalities": [], "data_at": "unknown"}


def club_season_stats(world: World, club_id: int, player_ids) -> dict[int, dict]:
    """Current-season statistics of these players for this club only, whatever they did elsewhere."""
    stats = {pid: dict(appearances=0, substitutes=0, minutes=0, goals=0, assists=0, yellows=0, reds=0, rating_sum=0, rating_count=0)
             for pid in player_ids}
    for record in world.records.values():
        if record.season != world.season or record.club_id != club_id or record.player_id not in stats: continue
        row = stats[record.player_id]
        row['appearances'] += record.matches
        row['substitutes'] += record.substitutes
        for key in ('minutes', 'goals', 'assists', 'yellows', 'reds', 'rating_sum', 'rating_count'):
            row[key] += getattr(record, key)
    for row in stats.values():
        row['average'] = round(row.pop('rating_sum') / max(1, row.pop('rating_count')), 2)
        row['minutes'] = round(row['minutes'])
    return stats


def morale_outlook(world: World, player: Player, club, rank: int, games: int, minutes: float) -> dict:
    """Where his morale drifts week after week, what holds it down most (`salaire`, `temps_de_jeu`, `ambition` or
    `intransferable`, None when nothing much does), and how content he is with his wage and his minutes, out of 1."""
    from core.world.contracts import contentment, morale_cause
    if player.contract is None: return {"morale_target": None, "morale_cause": None, "wage_satisfaction": None, "playing_time_satisfaction": None}
    mood, moral = contentment(world, player, club, rank, games, minutes), world.config.states.moral
    return {"morale_target": round(min(moral.max, max(moral.min, mood.morale_target)), 3), "morale_cause": morale_cause(world, mood),
            "wage_satisfaction": round(mood.wage, 3), "playing_time_satisfaction": round(mood.playing_time, 3)}


def squad_rows(world: World, club_id: int) -> list[dict]:
    from core.world.contracts import games_by_club, position_ranks
    from core.world.transfer_rules import season_arrivals
    club = world.clubs[club_id]
    stats = club_season_stats(world, club_id, [*club.player_ids, *club.loaned_ids])
    ranks, games, arrivals = position_ranks(world, club), games_by_club(world)[club_id], season_arrivals(world, club_id)
    players = [world.players[pid] for pid in club.player_ids]
    rows = [{**player_row(world, player), **stats[player.id], "away": False,
             **morale_outlook(world, player, club, ranks[player.id], *arrivals.get(player.id, (games, player.season_minutes)))}
            for player in players]
    # The players the club has lent stay in its list (`away`), with what they did for it this season and their mood where they are.
    return rows + [{**player_row(world, player), **stats[player.id], "away": True, **player_morale(world, player)}
                   for player in (world.players[pid] for pid in club.loaned_ids)]


def club_league(world: World, club_id: int | None) -> Competition | None:
    club = world.clubs.get(club_id)
    return world.competitions[club.competition_id] if club and club.competition_id else None


def level_history(world: World, player_id: int) -> list[dict]:
    """The player's level out of 200 month by month, oldest first, each with the club he played for that month (the one he
    ended it at if he moved, None without a club); seasons played before the history became monthly have a single point,
    at their opening."""
    moves = sorted((row for row in world.transfers if row.player_id == player_id), key=lambda row: row.date)
    player = world.players.get(player_id)
    # Before his earliest known movement he was where it took him from; without any, he never left his club.
    club_id = moves[0].source_id if moves else player.club_id if player else None
    points, done = [], 0
    for start, levels in world.trajectories.get(player_id, []):
        for index, level in enumerate(levels, start):
            year, month = divmod(index, 12)
            while done < len(moves) and (moves[done].date.year, moves[done].date.month) <= (year, month + 1):
                club_id, done = moves[done].target_id, done + 1
            points.append({"year": year, "month": month + 1, "season": financial_season(world, Date(year, month + 1, 1)), "level": level,
                           "club": club_ref(world, club_id)})
    return points


def played_leagues(world: World, keys: set[tuple[int, int]]) -> dict[tuple[int, int], Competition]:
    """The league each of these (season, club) played, read from its matches: a club changes division over the seasons.
    Nothing for a season it spent outside the simulated leagues."""
    seasons, found = {season for season, _ in keys}, {}
    for match in world.matches.values():
        if match.season not in seasons: continue
        for club_id in (match.home_id, match.away_id):
            if (match.season, club_id) in keys and world.competitions[match.competition_id].kind == "league":
                found[(match.season, club_id)] = world.competitions[match.competition_id]
    return found


def competition_badge(competition: Competition) -> dict:
    """What the page draws the badge of a competition from."""
    return {"id": competition.id, "name": competition.name, "kind": competition.kind, "code": competition.code,
            "nation": competition.nation, "level": competition.level}


def career_league(world: World, club_id: int | None, levels: dict, season: int, played: dict) -> tuple[str | None, str | None, dict | None]:
    """What a club's league reads as in the career row of a season, with its nation and what its badge is drawn from: the
    name of the simulated league it played that season (`played`, see `played_leagues`; the one it is in for the season
    under way); outside them "D" and the level of the club's division (`levels`, see `division_levels`). A club that has
    entered the simulated leagues since came from the reserve pool of their nation. The source gives no level to the
    other divisions: such a club plays one level under the deepest known one of its nation, hence in the top flight of a
    nation without any simulated league."""
    club = world.clubs.get(club_id)
    if club is None: return None, None, None
    today = club_league(world, club_id)
    league = played.get((season, club_id)) or (today if season == world.season else None)
    if league: return league.name, league.nation, competition_badge(league)
    if today:
        nation = today.nation
        level = max(known for country, known in levels.values() if country == nation)
    elif club.division_id in levels:
        nation, level = levels[club.division_id]
    else:
        nation = club.cup_nation or club.nation
        level = max((known for country, known in levels.values() if country == nation), default=0) + 1
    return f"D{level}", nation, {"name": f"D{level}", "kind": "league", "code": None, "nation": nation, "level": level}


def held_seasons(world: World, player_id: int, moves: list) -> list[tuple[int, int]]:
    """Each season a player opened at a club, as (season, club), from the one he entered the game in (the first point of
    his level history) to the one under way; `moves` are his movements, oldest first. A season whose first half saw him
    leave is not counted for the club he left: a summer move reads at the club he joined."""
    runs, player = world.trajectories.get(player_id), world.players.get(player_id)
    if not runs: return []
    year, month = divmod(runs[0][0], 12)
    opening = world.config.world.key_dates.population_review.month
    # Before his earliest known movement he was where it took him from; without any, he never left his club.
    club_id, done, held = moves[0].source_id if moves else player.club_id if player else None, 0, []
    for season in range(financial_season(world, Date(year, month + 1, 1)), world.season + 1):
        while done < len(moves) and moves[done].season < season:
            club_id, done = moves[done].target_id, done + 1
        left = moves[done].date if done < len(moves) and moves[done].season == season else None
        if club_id is not None and (left is None or (left.year - season) * 12 + left.month - opening >= 6):
            held.append((season, club_id))
    return held


def career(world: World, player_id: int) -> dict:
    from core.world.reputation import division_levels
    levels = division_levels(world.config)
    player_records =[row for row in world.records.values() if row.player_id == player_id]
    rows = {}
    def row_of(season: int, club_id: int) -> dict:
        return rows.setdefault((season, club_id), {"season": season, "club": club_ref(world, club_id),
                                                   "competitions": {}, "matches": 0, "substitutes": 0, "goals": 0, "assists": 0,
                                                   "rating_sum": 0, "rating_count": 0})
    for record in player_records:
        row = row_of(record.season, record.club_id)
        competition = world.competitions[record.competition_id]
        # A row names the league division and the European cup code; national cups stay in the totals only.
        label = competition.name if competition.kind == "league" else competition.code if competition.kind == "europe" else None
        if label: row["competitions"][label] = competition
        if competition.kind == "league": row["nation"] = competition.nation
        for field in ("matches", "substitutes", "goals", "assists", "rating_sum", "rating_count"):
            row[field] += getattr(record, field)
    moves = sorted((row for row in world.transfers if row.player_id == player_id and row.season is not None), key=lambda row: row.date)
    fees: dict[tuple[int, int], int] = {}
    order: dict[tuple[int, int], tuple[int, bool]] = {}
    targeted = {move.target_id for move in moves if move.target_id is not None}
    loans = {(move.season, move.target_id) for move in moves if move.kind == "loan"}
    for move in moves:
        if move.target_id is not None:
            key = (move.season, move.target_id)
            fees[key] = fees.get(key, 0) + move.fee
            order[key] = (move.date.ordinal(), True)
        # A source club never reached as a target is where the player was before the earliest tracked transfer.
        if move.source_id is not None and move.source_id not in targeted:
            order.setdefault((move.season, move.source_id), (move.date.ordinal(), False))
    # A club he joined or sat a whole season at has its row, even without a match.
    for key in (*order, *held_seasons(world, player_id, moves)): row_of(*key)
    played = played_leagues(world, set(rows))
    for (season, club_id), row in rows.items():
        labels = row.pop("competitions")
        # The league comes first, the one he played in or else his club's that season (a club outside the simulated leagues,
        # a season of cup matches only or without a match), then the European cup.
        league, nation, badge = career_league(world, club_id, levels, season, played)
        leagues = {label: competition for label, competition in labels.items() if competition.kind == "league"}
        european = {label: competition for label, competition in labels.items() if competition.kind == "europe"}
        row["competition"] = " · ".join([*(leagues or ([league] if league else [])), *european]) or None
        # The same, as the badges the page draws: the league, then the European cups.
        row["competition_badges"] = [*([competition_badge(item) for item in leagues.values()] or ([badge] if badge else [])),
                                     *(competition_badge(item) for item in european.values())]
        row["competition_nation"] = row.pop("nation", None) or nation
        count = row.pop("rating_count")
        total = row.pop("rating_sum")
        row["average"] = round(total / count, 2) if count else None
    items = [{**rows[key], "fee": fees.get(key), "loan": key in loans}
             for key in sorted(rows, key=lambda key: (key[0], order.get(key, (-1, False))), reverse=True)]
    rating_count = sum(row.rating_count for row in player_records)
    totals = {"fee": sum(fees.values()), "matches": sum(row.matches for row in player_records),
              "goals": sum(row.goals for row in player_records), "assists": sum(row.assists for row in player_records),
              "average": round(sum(row.rating_sum for row in player_records) / rating_count, 2) if rating_count else None}
    return {"items": items, "totals": totals}


def match_player_name(world: World, result: MatchResult, player_id: int | None) -> str | None:
    return result.temporary_players.get(player_id) or player_name(world, player_id)


def lineup_rows(world: World, result: MatchResult, side: str) -> list[dict]:
    """The starting eleven of one side, with the positions and ratings of that match."""
    return [{"id": pid, "name": match_player_name(world, result, pid), "position": position,
             "temporary": pid in result.temporary_players,
             "stats": asdict(result.player_stats[pid]) if pid in result.player_stats else None}
            for pid, position in getattr(result, f"{side}_lineup")]


def match_detail(world: World, match: Match) -> dict:
    data = match_row(world, match)
    data["capacity"] = None if match.neutral or match.id in world.international.matches else world.clubs[match.home_id].capacity
    if match.id in world.international.matches:
        # A selection wears its kit as a club does: the report's band and its shirts read the same keys.
        from .nations import kit_colors
        for side in ("home", "away"):
            data[side] = {**data[side], **kit_colors(data[side]["name"])}
    result = match.result
    if result is None:
        data["result"] = None
        return data
    detail = {"engine": result.engine, "status": result.status, "duration": result.duration,
              "home_stats": asdict(result.home_stats) if result.home_stats else None,
              "away_stats": asdict(result.away_stats) if result.away_stats else None}
    detail["events"] = [{**asdict(event), "player": match_player_name(world, result, event.player_id),
                         "secondary": match_player_name(world, result, event.secondary_id),
                         "temporary": event.player_id in result.temporary_players,
                         "secondary_temporary": event.secondary_id in result.temporary_players} for event in result.events]
    for side in ("home", "away"):
        bench = getattr(result, f"{side}_bench")
        detail[f"{side}_lineup"] = lineup_rows(world, result, side)
        detail[f"{side}_bench"] = [{"id": pid, "name": match_player_name(world, result, pid), "temporary": pid in result.temporary_players,
                                      "stats": asdict(result.player_stats[pid]) if pid in result.player_stats else None} for pid in bench]
    data["result"] = detail
    return data
