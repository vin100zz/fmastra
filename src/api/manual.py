"""The in-game manual: Markdown chapters whose figures are read from the game's own configuration.

A chapter of docs/manuel is Markdown with `{{expression}}` placeholders: arithmetic over the configuration, addressed by
the keys of config/*.json (`etats.forme.min`, `demographie.progression.courbe_age[0].facteur`), with a few helpers to
format the result. A line starting with `{{#chaque expression}}` is written once for each item of a list (the keys of an
item become names, beside `element` and `i`) or of a mapping (`cle` and `valeur`).

No figure of a game rule is typed in a chapter: recalibrating the configuration, or loading a save made with another
one, changes what the manual says."""
from __future__ import annotations

import ast
import math
import operator
import re
import unicodedata
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

PLACEHOLDER = re.compile(r"\{\{(.+?)\}\}")
REPEAT = re.compile(r"^\{\{#chaque (.+?)\}\}(.*)$")
LINK = re.compile(r"\]\(#/aide/([a-z0-9-]+)(?:/([a-z0-9-]+))?\)")
# What a placeholder shows when the configuration of an old save lacks what it reads.
MISSING = "—"
NARROW_SPACE, HARD_SPACE, MINUS = "\u202f", "\u00a0", "\u2212"
ATTRIBUTE_LABELS = {"passe": "passe", "technique": "technique", "finition": "finition", "tacle": "tacle", "jeu_tete": "jeu de tête",
                    "vision": "vision", "placement": "placement", "sang_froid": "sang-froid", "vitesse": "vitesse",
                    "endurance": "endurance", "reflexes": "réflexes", "sorties": "sorties", "relance": "relance",
                    "centre": "centres", "cpa": "coups arrêtés"}
MONTHS = ("janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre")


class ManualError(ValueError):
    """A chapter that cannot be read, or a placeholder that cannot be computed."""


@dataclass(frozen=True, slots=True)
class Chapter:
    slug: str
    title: str
    body: str


def number(value: float, decimals: int | None = None) -> str:
    """A figure as the pages write them: four significant digits at most unless `decimals` is given, no trailing zero."""
    if decimals is not None:
        value = round(value, decimals)
    elif value:
        value = round(value, max(0, 3 - math.floor(math.log10(abs(value)))))
    whole, _, fraction = f"{abs(value):.10f}".rstrip("0").partition(".")
    groups = re.sub(r"(?<=\d)(?=(\d{3})+$)", NARROW_SPACE, whole)
    return (MINUS if value < 0 else "") + groups + (f".{fraction}" if fraction else "")


def percentage(value: float, decimals: int | None = None) -> str:
    return f"{number(value * 100, decimals)}{HARD_SPACE}%"


def euros(value: float) -> str:
    """An amount to three significant digits: in €, in k€ from a thousand up, in M€ from a million up."""
    for divisor, unit in ((1, "€"), (1e3, "k€"), (1e6, "M€")):
        rounded = float(f"{value / divisor:.3g}")
        if abs(rounded) < 1000 or unit == "M€":
            return f"{number(rounded)}{HARD_SPACE}{unit}"


def weights(values: Mapping[str, float]) -> str:
    """The weights of a composite or of a position's level, heaviest first: "passe 45 %, technique 30 %"."""
    ranked = sorted(values.items(), key=lambda item: -item[1])
    return ", ".join(f"{ATTRIBUTE_LABELS.get(name, name)} {percentage(weight)}" for name, weight in ranked)


def ratings(values: Mapping[str, float]) -> str:
    """The ratings a position gives the others, highest first: "MC 16, DC 9"; `MISSING` when it gives none."""
    ranked = sorted(values.items(), key=lambda item: -item[1])
    return ", ".join(f"{name} {number(value)}" for name, value in ranked) or MISSING


def day(number: int, month: int) -> str:
    return f"{'1er' if number == 1 else number} {MONTHS[month - 1]}"


def sigmoid(value: float) -> float:
    return 1 / (1 + math.exp(-value))


def text(value: Any) -> str:
    if isinstance(value, bool): return "oui" if value else "non"
    if isinstance(value, (int, float)): return number(value)
    if isinstance(value, (list, tuple)): return ", ".join(text(item) for item in value)
    return str(value)


FUNCTIONS = {"min": min, "max": max, "abs": abs, "len": len, "sum": sum, "exp": math.exp, "log": math.log, "tanh": math.tanh,
             "sigmoide": sigmoid, "logit": lambda value: math.log(value / (1 - value)),
             "n": number, "pct": percentage, "eur": euros, "poids": weights, "notes": ratings, "liste": text, "date": day, "annee": lambda value: str(int(value)),
             "attribut": lambda name: ATTRIBUTE_LABELS[name]}
OPERATORS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv, ast.Pow: operator.pow}


def evaluate(expression: str, scope: Mapping[str, Any]) -> Any:
    """The value of an expression: figures, names of `scope`, `a.b` and `a[0]` lookups, arithmetic and the helpers above."""
    try:
        return _value(ast.parse(expression.strip(), mode="eval").body, scope)
    except ManualError:
        raise
    except (SyntaxError, ArithmeticError, LookupError, TypeError, ValueError) as error:
        raise ManualError(f"{expression.strip()}: {error}") from error


def _value(node: ast.expr, scope: Mapping[str, Any]) -> Any:
    match node:
        case ast.Constant(value=int() | float() | str() as value):
            return value
        case ast.Name(id=name):
            if name not in scope: raise ManualError(f"Unknown name: {name}")
            return scope[name]
        case ast.Attribute(value=owner, attr=key):
            return _item(_value(owner, scope), key)
        case ast.Subscript(value=owner, slice=key):
            return _item(_value(owner, scope), _value(key, scope))
        case ast.BinOp(left=left, op=op, right=right) if type(op) in OPERATORS:
            return OPERATORS[type(op)](_value(left, scope), _value(right, scope))
        case ast.UnaryOp(op=ast.USub(), operand=operand):
            return -_value(operand, scope)
        case ast.Call(func=ast.Name(id=name), args=arguments, keywords=[]) if name in FUNCTIONS:
            return FUNCTIONS[name](*(_value(argument, scope) for argument in arguments))
    raise ManualError(f"Unsupported expression: {ast.unparse(node)}")


def _item(owner: Any, key: Any) -> Any:
    if isinstance(owner, Mapping) and key in owner: return owner[key]
    if isinstance(owner, Sequence) and not isinstance(owner, str) and isinstance(key, int) and -len(owner) <= key < len(owner):
        return owner[key]
    raise ManualError(f"Nothing at {key!r}")


def _scopes(items: Any, scope: Mapping[str, Any]) -> Iterator[Mapping[str, Any]]:
    if isinstance(items, Mapping):
        for key, value in items.items():
            yield {**scope, "cle": key, "valeur": value}
    elif isinstance(items, Sequence) and not isinstance(items, str):
        for index, item in enumerate(items):
            yield {**scope, **(item if isinstance(item, Mapping) else {}), "element": item, "i": index}
    else:
        raise ManualError("Only a list or a mapping can be repeated")


def render(body: str, scope: Mapping[str, Any], strict: bool = False) -> str:
    """The chapter with its placeholders computed. `strict` raises on the first one that cannot be; otherwise it reads `MISSING`
    (and a repeated line is left out): the configuration embedded in an old save may lack what a chapter written since reads."""
    def fill(line: str, local: Mapping[str, Any]) -> str:
        def replace(match: re.Match) -> str:
            try:
                return text(evaluate(match[1], local))
            except ManualError:
                if strict: raise
                return MISSING
        return PLACEHOLDER.sub(replace, line)

    lines = []
    for line in body.splitlines():
        repeat = REPEAT.match(line)
        if repeat is None:
            lines.append(fill(line, scope))
            continue
        try:
            lines.extend([fill(repeat[2], local) for local in _scopes(evaluate(repeat[1], scope), scope)])
        except ManualError:
            if strict: raise
    return "\n".join(lines)


def configuration_scope(payload: Mapping[str, Any]) -> dict[str, Any]:
    """The configuration as chapters address it: the keys of its files, `import` being a reserved word in an expression."""
    return {("importation" if key == "import" else key): value for key, value in payload.items()}


def slug(title: str) -> str:
    plain = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", plain.lower()).strip("-")


def sections(body: str) -> list[dict]:
    """The `##` headings of a chapter, each with the address the page gives it."""
    return [{"id": slug(line[3:]), "title": line[3:].strip()} for line in body.splitlines() if line.startswith("## ")]


def read_chapters(directory: Path) -> list[Chapter]:
    """The chapters in the order of their file names, `NN-slug.md`; the first line of each is its title."""
    chapters = []
    for path in sorted(directory.glob("*.md")):
        title, _, body = path.read_text("utf-8").partition("\n")
        if not title.startswith("# ") or "-" not in path.stem:
            raise ManualError(f"{path.name}: expected NN-slug.md opening with its '# ' title")
        chapters.append(Chapter(path.stem.split("-", 1)[1], title[2:].strip(), body.strip()))
    return chapters


def manual_view(directory: Path, payload: Mapping[str, Any], chapter_slug: str | None = None) -> dict:
    """The page of the manual: every chapter for its menu, and the one asked for (the first by default) written out."""
    chapters = read_chapters(directory)
    chapter = next((item for item in chapters if chapter_slug in (None, item.slug)), None)
    if chapter is None: raise KeyError(chapter_slug)
    body = render(chapter.body, configuration_scope(payload))
    return {"pages": [{"slug": item.slug, "title": item.title} for item in chapters],
            "page": {"slug": chapter.slug, "title": chapter.title, "sections": sections(body), "markdown": body}}
