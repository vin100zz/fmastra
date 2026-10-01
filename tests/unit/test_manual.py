from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.app import create_app
from api.manual import (LINK, MISSING, ManualError, configuration_scope, euros, evaluate, manual_view, number, percentage,
                        read_chapters, render, sections, slug)
from infrastructure.config.loader import config_payload

ROOT = Path(__file__).resolve().parents[2]
MANUAL = ROOT / "docs" / "manuel"
SCOPE = {"etats": {"forme": {"min": 0.7, "max": 1.3}}, "courbe": [{"age": 16, "ratio": 0.4}, {"age": 17, "ratio": 0.45}],
         "postes": {"GB": {"reflexes": 0.4, "jeu_tete": 0.6}}, "classes": [[1, 35], [35, 50]]}


def test_figures_are_written_the_french_way_without_float_noise():
    assert number(5400) == "5\u202f400" and number(14404) == "14\u202f404"
    assert number(0.0042) == "0,0042" and number(0.58 * 100) == "58" and number(-0.4) == "\u22120,4"
    assert number(38.4615) == "38,46" and number(38.4615, 1) == "38,5" and number(12345.678) == "12\u202f346"
    assert percentage(0.05) == "5\u00a0%" and percentage(0.0003, 2) == "0,03\u00a0%"
    assert euros(900 * 52 / 12) == "3\u202f900\u00a0€" and euros(2_800_000) == "2,8\u00a0M€" and euros(-5_000_000) == "\u22125\u00a0M€"


def test_an_expression_reads_the_configuration_and_computes_on_it():
    assert evaluate("etats.forme.max - etats.forme.min", SCOPE) == pytest.approx(0.6)
    assert evaluate("courbe[-1].ratio * 2", SCOPE) == 0.9 and evaluate("postes['GB'].reflexes", SCOPE) == 0.4
    assert evaluate("pct(sigmoide(0), 0)", SCOPE) == "50\u00a0%" and evaluate("date(1, 7)", SCOPE) == "1er juillet"
    assert evaluate("poids(postes.GB)", SCOPE) == "jeu de tête 60\u00a0%, réflexes 40\u00a0%"
    assert evaluate("n(min(1, 0.04 * 5 ** 1.9), 2)", SCOPE) == "0,85"
    kinship = {"parentes": {"DC": {"MC": 6.0, "MDC": 9.0}, "GB": {}}}
    assert evaluate("notes(parentes.DC)", kinship) == "MDC 9, MC 6" and evaluate("notes(parentes.GB)", kinship) == MISSING


@pytest.mark.parametrize("expression", ["inconnu", "etats.absent", "courbe[5]", "1 / 0", "etats.forme.min +", "__import__('os')",
                                        "etats.keys()", "lambda: 1", "[c for c in courbe]", "etats.forme.min < 1", "print(1)"])
def test_an_expression_outside_the_small_language_is_refused(expression):
    with pytest.raises(ManualError):
        evaluate(expression, SCOPE)


def test_a_repeated_line_is_written_for_each_item_of_a_list_or_a_mapping():
    body = "| Âge | Ratio |\n{{#chaque courbe}}| {{age}} ans | {{pct(ratio, 0)}} | {{i}} |\n{{#chaque postes}}- {{cle}} : {{poids(valeur)}}\n{{#chaque classes}}{{element[0] * 2}} à {{element[1] * 2}}"
    assert render(body, SCOPE).splitlines() == [
        "| Âge | Ratio |", "| 16 ans | 40\u00a0% | 0 |", "| 17 ans | 45\u00a0% | 1 |",
        "- GB : jeu de tête 60\u00a0%, réflexes 40\u00a0%", "2 à 70", "70 à 100"]


def test_what_an_old_configuration_lacks_reads_as_missing_unless_strict():
    body = "Forme de {{etats.forme.min}} à {{etats.forme.plafond}}.\n{{#chaque etats.absent}}| {{cle}} |\nFin."
    assert render(body, SCOPE) == f"Forme de 0,7 à {MISSING}.\nFin."
    with pytest.raises(ManualError):
        render(body, SCOPE, strict=True)


def test_sections_are_the_second_level_headings_with_plain_addresses():
    assert slug("La force d'une équipe dans une zone") == "la-force-d-une-equipe-dans-une-zone"
    assert sections("## Le moral\ntexte\n### Détail\n## Blessés & suspendus") == [
        {"id": "le-moral", "title": "Le moral"}, {"id": "blesses-suspendus", "title": "Blessés & suspendus"}]


def rendered_chapters(config) -> dict[str, tuple[str, str]]:
    scope = configuration_scope(config_payload(config))
    return {chapter.slug: (chapter.title, render(chapter.body, scope, strict=True)) for chapter in read_chapters(MANUAL)}


def test_every_figure_of_every_chapter_is_computed_from_the_configuration(config):
    """A renamed or removed configuration key breaks here: the chapter reading it must follow the rule it describes."""
    chapters = rendered_chapters(config)
    assert len(chapters) == len(read_chapters(MANUAL)) >= 10
    for title, body in chapters.values():
        assert title and "{{" not in body and "}}" not in body


def test_links_between_chapters_point_to_an_existing_chapter_and_section(config):
    chapters = rendered_chapters(config)
    ids = {key: [section["id"] for section in sections(body)] for key, (_, body) in chapters.items()}
    for key, anchors in ids.items():
        assert len(set(anchors)) == len(anchors), f"{key}: two sections share an address"
    links = [(key, match[1], match[2]) for key, (_, body) in chapters.items() for match in LINK.finditer(body)]
    assert links
    for source, chapter, section in links:
        assert chapter in ids, f"{source}: unknown chapter {chapter}"
        assert section is None or section in ids[chapter], f"{source}: unknown section {chapter}/{section}"
    # A link to the manual written any other way would escape this check.
    assert sum(body.count("#/aide/") for _, body in chapters.values()) == len(links)


def test_the_page_lists_every_chapter_and_writes_the_one_asked_for(config):
    payload = config_payload(config)
    first = manual_view(MANUAL, payload)
    assert [page["slug"] for page in first["pages"]][:3] == ["monde", "joueurs", "match"]
    assert first["page"]["slug"] == "monde" and first["page"]["sections"]
    states = manual_view(MANUAL, payload, "etats")["page"]
    assert states["title"] == "Forme, moral et condition physique" and states["markdown"].startswith("## Le multiplicateur")
    assert {"la-forme", "le-moral", "la-condition-physique"} <= {section["id"] for section in states["sections"]}
    with pytest.raises(KeyError):
        manual_view(MANUAL, payload, "inconnu")


def test_the_manual_opens_before_any_game_exists(tmp_path):
    with TestClient(create_app(ROOT, tmp_path)) as client:
        assert client.get("/api/monde/etat").json()["exists"] is False
        data = client.get("/api/manuel/match").json()
        assert data["page"]["title"] == "Le moteur de match" and len(data["pages"]) >= 10
        assert client.get("/api/manuel").json()["page"]["slug"] == "monde"
        assert client.get("/api/manuel/inconnu").status_code == 404
