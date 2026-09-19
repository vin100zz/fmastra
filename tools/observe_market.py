"""Compare market changes on an isolated saved-world summer, without saving it.

By default only negotiations and transfers run: no matches, ageing, expiring
contracts, renewals or annual finance reset. --full-season runs every phase for
one year. Neither mode proves long-term economic equilibrium. Use identical
save snapshots and seeds for before/after runs.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import importlib.util
import json
from pathlib import Path
from random import Random
import sys
from time import perf_counter

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from core.domain.date import Date
from core.world.market import open_offers, settle_offers
from core.world.validation import validate_world
from core.world.finances import annual_funding_factor, structural_income
from core.world.simulation import advance_day
from infrastructure.persistence.store import SaveStore


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--save", type=Path, default=ROOT / "saves/autosave.json.gz")
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--seeds", type=int, nargs="+", default=[2025, 42, 73])
    parser.add_argument("--baseline-dir", type=Path, help="Directory containing archived ai_market.py and world_market.py")
    parser.add_argument("--full-season", action="store_true", help="Run all world phases for one year from the saved date")
    parser.add_argument("--through-next-summer", action="store_true", help="Include the complete following summer after the annual review")
    args = parser.parse_args()
    if args.through_next_summer and not args.full_season:
        parser.error("--through-next-summer requires --full-season")
    settle, open_market = settle_offers, open_offers
    if args.baseline_dir:
        def module(name, filename):
            spec = importlib.util.spec_from_file_location(name, args.baseline_dir / filename)
            result = importlib.util.module_from_spec(spec)
            sys.modules[name] = result
            spec.loader.exec_module(result)
            return result
        ai = module("core.ai.market_before", "ai_market.py")
        market = module("core.world.market_before", "world_market.py")
        market.propose_transfers, market.seller_accepts = ai.propose_transfers, ai.seller_accepts
        from core.ai.controller import AIController
        AIController.evaluate_needs = lambda self, club, players: ai.needs_for(club, players, self.cfg)
        settle = market.settle_offers
        open_market = lambda world, opened, rejected: market.open_offers(world, opened)
        import core.world.simulation as simulation
        simulation.settle_offers, simulation.open_offers = settle, open_market
        # Previous economics kept the initial funding factor indefinitely.
        simulation.annual_funding_factor = lambda club, cfg, base: club.funding_factor
    save_hash = hashlib.sha256(args.save.read_bytes()).hexdigest()
    results = []
    for seed in args.seeds:
        started = perf_counter()
        world = SaveStore(args.save.parent).load(args.save.name.removesuffix(".json.gz"))
        original_date = world.date.iso()
        window = world.config.world.market.summer
        year = world.date.year + int((world.date.month, world.date.day) > (window.start_month, window.start_day))
        start = Date(year, window.start_month, window.start_day)
        end = Date(year, window.end_month, window.end_day)
        if args.full_season:
            start, end = world.date.add_days(1), world.date.add_years(1)
            if args.through_next_summer:
                end = Date(end.year, window.end_month, window.end_day)
        world.rngs["market"] = Random(seed)
        world.offers.clear()
        active = {club.id for club in world.active_clubs()}
        initial_wages = sum(world.clubs[cid].wage_bill for cid in active)
        initial_cash = sum(club.balance for club in world.clubs.values())
        initial_count = len(world.transfers)
        initial_positions = {player.id: player.position for player in world.players.values()}
        tracked = next(club.id for club in world.clubs.values() if club.name == "Real Madrid")
        club = world.clubs[tracked]
        base = structural_income(club, world.config, club.previous_rank)
        revised_factor = annual_funding_factor(club, world.config, base)
        annual_wages = club.wage_bill * world.config.management.budgets.weeks_per_year
        cost_share = world.config.management.budgets.accounting.other_cost_share
        funding_projection = {"rank_held_constant": club.previous_rank,
            "old_factor": club.funding_factor, "new_factor": revised_factor,
            "old_annual_income": round(base * club.funding_factor), "new_annual_income": round(base * revised_factor),
            "old_operating_surplus": round(base * club.funding_factor * (1-cost_share)) - annual_wages,
            "new_operating_surplus": round(base * revised_factor * (1-cost_share)) - annual_wages,
            "cash_unchanged": club.balance}
        max_positions = 0
        for offset in range(end.ordinal() - start.ordinal() + 1):
            if args.full_season:
                advance_day(world)
            else:
                world.date = start.add_days(offset)
                for _ in range(world.config.world.market.rounds_per_day):
                    rejected = settle(world, True)
                    open_market(world, True, rejected)
            positions = {world.players[o.player_id].position for o in world.offers.values() if o.target_id == tracked}
            max_positions = max(max_positions, len(positions))
            if offset % 20 == 0:
                print(f"seed={seed} day={offset} date={world.date.iso()} movements={len(world.transfers)-initial_count}", flush=True)
        if not args.full_season:
            world.date = end.add_days(1)
            settle(world, False)
        validate_world(world)
        if not args.full_season: assert sum(club.balance for club in world.clubs.values()) == initial_cash
        moves = [t for t in world.transfers[initial_count:] if t.kind == "transfer"]
        incoming = Counter(t.target_id for t in moves if t.target_id in active)
        distribution = Counter(incoming[cid] for cid in active)
        real_moves = [t for t in moves if t.target_id == tracked]
        real = world.clubs[tracked]
        def player_row(move):
            player = world.players.get(move.player_id)
            return {"name": player.name if player else world.retired.get(move.player_id, str(move.player_id)),
                    "position": player.position if player else initial_positions.get(move.player_id),
                    "fee": move.fee, "date": move.date.iso()}
        summer_start = Date(end.year, window.start_month, window.start_day)
        summer_moves = [move for move in moves if summer_start <= move.date <= end and move.target_id in active]
        summer_counts = Counter(move.target_id for move in summer_moves)
        result = {
            "seed": seed, "source_date": original_date, "start": start.iso(), "end": end.iso(),
            "clubs": len(active), "arrivals": sum(incoming.values()),
            "arrivals_per_club": sum(incoming.values()) / len(active),
            "clubs_without_arrivals": distribution[0], "arrival_distribution": dict(sorted(distribution.items())),
            "fees_paid_by_active_clubs": sum(t.fee for t in moves if t.target_id in active),
            "initial_weekly_wages": initial_wages,
            "final_weekly_wages": sum(world.clubs[cid].wage_bill for cid in active),
            "real_madrid": {"arrivals": len(real_moves), "spent": sum(t.fee for t in real_moves),
                "remaining_budget": real.transfer_budget, "squad": len(real.player_ids),
                "max_simultaneous_positions": max_positions,
                "players": [player_row(move) for move in real_moves]},
            "last_summer": {"start": summer_start.iso(), "end": end.iso(),
                "arrivals": len(summer_moves), "arrivals_per_club": len(summer_moves) / len(active),
                "clubs_without_arrivals": sum(summer_counts[cid] == 0 for cid in active),
                "distribution": dict(sorted(Counter(summer_counts[cid] for cid in active).items())),
                "real_arrivals": sum(move.target_id == tracked for move in summer_moves),
                "real_spent": sum(move.fee for move in summer_moves if move.target_id == tracked),
                "fees_paid": sum(move.fee for move in summer_moves)},
            "real_funding_projection_at_source_date": funding_projection,
            "real_final_finances": {"income": real.income, "weekly_wages": real.wage_bill,
                "wage_cap": real.wage_cap, "balance": real.balance, "funding_factor": real.funding_factor},
            "seconds": perf_counter() - started,
        }
        last_move = {}
        for move in moves:
            if move.player_id in last_move:
                assert move.date.ordinal() - last_move[move.player_id] >= world.config.management.market.arrival_stability_days
            last_move[move.player_id] = move.date.ordinal()
        results.append(result)
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps({"save_sha256": save_hash,
            "mode": "full_season" if args.full_season else "market_only_frozen_background",
            "baseline_dir": str(args.baseline_dir) if args.baseline_dir else None,
            "results": results}, indent=2, ensure_ascii=False), "utf-8")
        print(json.dumps(result, ensure_ascii=True), flush=True)
        del world
    assert hashlib.sha256(args.save.read_bytes()).hexdigest() == save_hash, "Source save changed during observation"


if __name__ == "__main__":
    main()
