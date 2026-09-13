"""Seasonal club cash accounts and durable squad movements; read-only projections."""
from core.domain.date import Date
from core.domain.world import World
from core.world.finances import financial_season
from . import views as v


def navigation(world: World, season: int | None) -> dict:
    first = world.config.world.start_date.year
    selected = world.season if season is None else season
    if not first <= selected <= world.season: raise ValueError("Saison hors de l'historique de la partie.")
    return {"season": selected, "previous_season": selected - 1 if selected > first else None,
            "next_season": selected + 1 if selected < world.season else None}


def movements(world: World, club_id: int, season: int | None, page: int) -> dict:
    nav = navigation(world, season)
    rows = v.transfers(world, club_id=club_id, season=nav["season"])
    regular = [row for row in rows if row["kind"] == "transfer"]
    sections = {
        "arrivals": [row for row in regular if row["target"] and row["target"]["id"] == club_id],
        "departures": [row for row in regular if row["source"] and row["source"]["id"] == club_id],
        **{kind: [row for row in rows if row["kind"] == kind] for kind in ("release", "retirement", "academy", "departure_unknown")},
    }
    return {**v.paginate(regular, page), **nav, "sections": sections,
            "history_since": (world.movement_history_since or world.date).iso()}


def world_movements(world: World, season: int | None, kind: str, page: int) -> dict:
    nav = navigation(world, season)
    kinds = {'transfer', 'release', 'departure_unknown'} if kind == 'transfer' else {kind}
    rows = [item for item in world.transfers if item.kind in kinds
            and (item.season if item.season is not None else financial_season(world, item.date)) == nav['season']]
    rows.sort(key=lambda item: (item.date, item.player_id), reverse=True)
    data = v.paginate(rows, page, 50)
    data['items'] = [v.transfer_row(world, row) for row in data['items']]
    return {**data, **nav, 'type': kind, 'history_since': (world.movement_history_since or world.date).iso()}


def finances(world: World, club_id: int, season: int | None) -> dict:
    nav = navigation(world, season)
    record = world.finance_history.get(club_id, {}).get(nav["season"])
    since = world.finance_history_since or world.date
    review = world.config.world.key_dates.population_review
    start = Date(nav["season"], review.month, review.day)
    totals = {key: 0 for key in ("income", "wages", "operating_costs", "transfer_income", "transfer_expenses", "rounding_income", "rounding_expenses")}
    entries = []
    if record:
        for month, amounts in record.months.items():
            period = Date(nav["season"] + (month < review.month), month, 1).iso()
            for key, label, expense in (("income", "Revenus structurels", False), ("wages", "Salaires", True),
                                        ("operating_costs", "Frais de fonctionnement", True)):
                amount = getattr(amounts, key)
                totals[key] += amount
                if amount: entries.append({"date": period, "monthly": True, "label": label, "revenue": 0 if expense else amount, "expense": amount if expense else 0})
            totals["transfer_income"] += amounts.transfer_income
            totals["transfer_expenses"] += amounts.transfer_expenses
            rounding = amounts.rounding
            totals["rounding_income"] += max(0, rounding)
            totals["rounding_expenses"] += max(0, -rounding)
            if rounding: entries.append({"date": period, "monthly": True, "label": "Régularisation des arrondis", "revenue": max(0, rounding), "expense": max(0, -rounding)})
        for index in record.transfer_indices:
            item = world.transfers[index]
            sale = item.source_id == club_id
            entries.append({"date": item.date.iso(), "monthly": False, "label": "Vente de joueur" if sale else "Achat de joueur",
                            "player_id": item.player_id, "player": v.player_name(world, item.player_id),
                            "revenue": item.fee if sale else 0, "expense": 0 if sale else item.fee})
    revenue = totals["income"] + totals["transfer_income"] + totals["rounding_income"]
    expenses = totals["wages"] + totals["operating_costs"] + totals["transfer_expenses"] + totals["rounding_expenses"]
    opening = record.opening_balance if record else None
    return {**nav, "since": since.iso(), "partial": since > start, "available": record is not None,
            "opening_balance": opening, "closing_balance": opening + revenue - expenses if opening is not None else None,
            "revenue": revenue, "expenses": expenses, "net": revenue - expenses, "totals": totals,
            "entries": sorted(entries, key=lambda row: (row["date"], row["label"]), reverse=True)}
