"""Export the full RGB collection and CSV-colored examples using the application renderer.

Run from the repository: PYTHONPATH=src python tools/export_outfits.py
"""
import csv
import html
from pathlib import Path
from types import SimpleNamespace
from zipfile import ZipFile, ZIP_DEFLATED

from api.kit_images import PATTERN_COUNT, render_outfit
from api.kits import NEUTRAL, PATTERNS, _palette
from infrastructure.importation.readers import kit_components

ROOT = Path(__file__).resolve().parents[1]


def write_png(path: Path, data: bytes):
    if path.exists() and path.read_bytes() == data:
        return
    # Replace complete files instead of truncating PNGs that a viewer may be reading.
    temporary = path.with_suffix(".png.tmp")
    temporary.write_bytes(data)
    temporary.replace(path)


def export():
    target = ROOT / "web/kits/outfits"
    target.mkdir(parents=True, exist_ok=True)
    primary = ("#FF0000", "#00FF00", "#0000FF")
    cards = []
    for code in range(1, PATTERN_COUNT + 1):
        filename = f"KIT_{code}.png"
        write_png(target / filename, render_outfit(code, primary, primary, primary))
        cards.append(f'<figure><a href="{filename}"><img loading="lazy" src="{filename}" alt="Pattern {code}"></a><figcaption>Pattern {code}</figcaption></figure>')
    examples = []
    with (ROOT / "data/clubs.csv").open(encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source, delimiter=";"):
            if row["UID"] not in ("868", "866", "858"):
                continue
            club = SimpleNamespace(**kit_components(row), home_kit_id=int(row["HomeKitID"] or 0),
                **{f"home_kit_{color}_color": row[f"HomeKit{color.title()}ColorRGB"] for color in ("major", "minor", "third")})
            for side, label in (("home", "Domicile"), ("away", "Extérieur")):
                shirt = _palette(club, f"{side}_kit", NEUTRAL)
                filename = f'{row["UID"]}-{side}.png'
                write_png(target / filename, render_outfit(PATTERNS.get(getattr(club, f"{side}_kit_id"), 1), shirt,
                    _palette(club, f"{side}_shorts", shirt[0]), _palette(club, f"{side}_socks", shirt[0]),
                    club_id=int(row["UID"])))
                examples.append(f'<figure><a href="{filename}"><img src="{filename}" alt="{label}"></a><figcaption>{html.escape(row["ShortName"])} · {label}</figcaption></figure>')
                if row["UID"] == "868":
                    write_png(ROOT / f"web/kits/components/example-{side}.png", (target / filename).read_bytes())
    page = '''<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Tenues complètes — PATTERN_COUNT patterns</title><style>
body{font:16px system-ui;background:#e8edf2;color:#1b2735;margin:32px}h1{margin-bottom:8px}
section{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px;margin:24px 0 40px}
figure{margin:0;padding:16px;text-align:center;background:white;border-radius:12px}img{width:160px;height:362.5px;object-fit:contain}figcaption{margin-top:12px}
</style><h1>Tenues complètes</h1><p>Maillot, short et chaussettes. Cliquez sur une tenue pour ouvrir son PNG transparent.</p>
<h2>Domicile et extérieur · couleurs de clubs.csv</h2><section>''' + "".join(examples) + '''</section>
<h2>PATTERN_COUNT templates RGB</h2><p>Rouge : couleur principale. Vert : secondaire. Bleu : troisième couleur du maillot. Le short et les chaussettes utilisent les deux zones de vos templates.</p><section>''' + "".join(cards) + "</section></html>"
    page = page.replace("PATTERN_COUNT", str(PATTERN_COUNT))
    (target / "index.html").write_text(page, encoding="utf-8")
    (ROOT / "reports").mkdir(exist_ok=True)
    with ZipFile(ROOT / "reports/kit-outfits-rgb.zip", "w", ZIP_DEFLATED) as archive:
        for path in sorted(target.iterdir()):
            archive.write(path, path.name)
    print(f"Exported {PATTERN_COUNT} RGB outfits and {len(examples)} club examples to {target}")


if __name__ == "__main__":
    export()
