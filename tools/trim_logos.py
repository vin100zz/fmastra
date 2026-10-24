"""Cut the crests of the clubs and the logos of the selections to what they draw.

The PNGs arrive centred in a transparent square (400 or 200 pixels); a band sizes a crest by its own ratio (the area of a
square of 64, docs/charte-graphique.md), so the margin around the drawing goes. Pixels fainter than ALPHA count as empty.
Running it again changes nothing; the fingerprints of the selections' logos in web/nations/sources.json follow.
"""
import hashlib
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ALPHA = 8


def trim(path: Path) -> bool:
    with Image.open(path) as source:
        image = source.convert("RGBA")
    box = image.getchannel("A").point(lambda alpha: 255 if alpha >= ALPHA else 0).getbbox()
    if box is None or box == (0, 0, *image.size):
        return False
    image.crop(box).save(path, "PNG", optimize=True)
    return True


def main() -> None:
    cut = sum(trim(path) for folder in ("clubs", "nations") for path in sorted((ROOT / "web" / folder).glob("*.png")))
    manifest_path = ROOT / "web" / "nations" / "sources.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    for row in manifest["logos"]:
        row["sha256"] = hashlib.sha256((ROOT / "web" / "nations" / row["file"]).read_bytes()).hexdigest()
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{cut} images rognées")


if __name__ == "__main__": main()
