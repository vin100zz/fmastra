"""Seeded pot-balanced opponents, then eight disjoint matchdays.

Each pot forms a directed cycle. Between every pair of pots, two disjoint
perfect matchings are oriented in opposite directions. Every club consequently
has one home and one away opponent per pot. Perfect matchings of the resulting
undirected graph form matchdays without changing those home/away assignments.
"""
from random import Random


def perfect_matching(graph: dict[int, set[int]], rng: Random) -> list[tuple[int, int]] | None:
    failed = set()

    def visit(remaining: frozenset[int]) -> list[tuple[int, int]] | None:
        if not remaining:
            return []
        if remaining in failed:
            return None
        candidates = list(sorted(remaining))
        rng.shuffle(candidates)
        a = min(candidates, key=lambda cid: len(graph[cid] & remaining))
        choices = sorted(graph[a] & remaining)
        rng.shuffle(choices)
        for b in choices:
            tail = visit(remaining - {a, b})
            if tail is not None:
                return [(a, b), *tail]
        failed.add(remaining)
        return None

    return visit(frozenset(graph))


def opponents(pots: list[list[int]], nations: dict[int, str], rng: Random) -> list[tuple[int, int]]:
    edges = []
    for pot in pots:
        # An odd pot needs a cycle, not separate home/away pairings with a bye.
        order = sorted(pot)
        rng.shuffle(order)

        def cycle(path: list[int], remaining: list[int]) -> list[int] | None:
            if not remaining:
                return path if nations[path[-1]] != nations[path[0]] else None
            for cid in remaining:
                if nations[cid] != nations[path[-1]]:
                    found = cycle([*path, cid], [other for other in remaining if other != cid])
                    if found:
                        return found
            return None

        ring = cycle(order[:1], order[1:])
        if ring is None:
            raise ValueError("Too many clubs from one association in a European pot")
        edges.extend(zip(ring, ring[1:] + ring[:1]))
    for i, left in enumerate(pots):
        for right in pots[i + 1:]:
            used = set()
            for reverse in (False, True):
                graph = {cid: set() for cid in left + right}
                for a in left:
                    for b in right:
                        if nations[a] != nations[b] and (a, b) not in used:
                            graph[a].add(b)
                            graph[b].add(a)
                pairs = perfect_matching(graph, rng)
                if pairs is None:
                    raise ValueError("Cannot draw distinct foreign opponents between European pots")
                for a, b in pairs:
                    if a not in left:
                        a, b = b, a
                    used.add((a, b))
                    edges.append((b, a) if reverse else (a, b))
    return edges


def draw_matchdays(pots: list[list[int]], nations: dict[int, str], rng: Random,
                  rounds: int, attempts: int) -> list[list[tuple[int, int]]]:
    for _ in range(attempts):
        edges = opponents(pots, nations, rng)
        orientation = {frozenset(pair): pair for pair in edges}
        graph = {cid: set() for pot in pots for cid in pot}
        for a, b in edges:
            graph[a].add(b)
            graph[b].add(a)
        days = []
        for _ in range(rounds):
            pairs = perfect_matching(graph, rng)
            if pairs is None:
                break
            days.append([orientation[frozenset(pair)] for pair in pairs])
            for a, b in pairs:
                graph[a].remove(b)
                graph[b].remove(a)
        if len(days) == rounds:
            rng.shuffle(days)
            return days
    raise ValueError("Unable to schedule the European draw within the configured attempt limit")
