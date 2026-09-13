"""Maximum-weight rectangular assignment (Hungarian algorithm)."""


def maximize_assignment(scores: list[list[float]]) -> list[int]:
    """Return one distinct column per row; O(rows² × columns)."""
    if not scores:
        return []
    rows, columns = len(scores), len(scores[0])
    if rows > columns or any(len(row) != columns for row in scores):
        raise ValueError("Assignment requires a rectangular matrix with enough candidates")
    u, v = [0.0] * (rows + 1), [0.0] * (columns + 1)
    matched, previous = [0] * (columns + 1), [0] * (columns + 1)
    for row in range(1, rows + 1):
        matched[0] = row
        column = 0
        distance, used = [float("inf")] * (columns + 1), [False] * (columns + 1)
        while True:
            used[column] = True
            current = matched[column]
            delta, next_column = float("inf"), 0
            for candidate in range(1, columns + 1):
                if used[candidate]:
                    continue
                reduced = -scores[current - 1][candidate - 1] - u[current] - v[candidate]
                if reduced < distance[candidate]:
                    distance[candidate], previous[candidate] = reduced, column
                if distance[candidate] < delta:
                    delta, next_column = distance[candidate], candidate
            for candidate in range(columns + 1):
                if used[candidate]:
                    u[matched[candidate]] += delta
                    v[candidate] -= delta
                else:
                    distance[candidate] -= delta
            column = next_column
            if matched[column] == 0:
                break
        while column:
            before = previous[column]
            matched[column] = matched[before]
            column = before
    result = [0] * rows
    for column in range(1, columns + 1):
        if matched[column]:
            result[matched[column] - 1] = column - 1
    return result
