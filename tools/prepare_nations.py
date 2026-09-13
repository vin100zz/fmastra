"""Build a versioned internal nation dictionary from the supplied source labels.

Common football codes are used where listed; X-prefixed codes are explicitly
internal identifiers for the remaining labels, not asserted international codes.
"""
import csv
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KNOWN = dict(item.split(":", 1) for item in """France:FRA|Angleterre:ENG|Allemagne:GER|Italie:ITA|Espagne:ESP|Portugal:POR|Brésil:BRA|Argentine:ARG|Pays-Bas:NED|Belgique:BEL|Suisse:SUI|Autriche:AUT|Danemark:DEN|Suède:SWE|Norvège:NOR|Finlande:FIN|Pologne:POL|Croatie:CRO|Serbie:SRB|Slovénie:SVN|Slovaquie:SVK|Roumanie:ROU|Bulgarie:BUL|Grèce:GRE|Turquie:TUR|Ukraine:UKR|Russie:RUS|Irlande:IRL|Irlande du Nord:NIR|Écosse:SCO|Pays de Galles:WAL|Islande:ISL|Maroc:MAR|Algérie:ALG|Tunisie:TUN|Égypte:EGY|Sénégal:SEN|Cameroun:CMR|Ghana:GHA|Nigeria:NGA|Mali:MLI|Côte d'Ivoire:CIV|Afrique du Sud:RSA|États-Unis:USA|Canada:CAN|Mexique:MEX|Uruguay:URU|Paraguay:PAR|Chili:CHI|Pérou:PER|Colombie:COL|Équateur:ECU|Venezuela:VEN|Japon:JPN|Corée du Sud:KOR|Chine:CHN|Australie:AUS|Nouvelle-Zélande:NZL|Arabie saoudite:KSA|Qatar:QAT|Iran:IRN|Israël:ISR|Rép. tchèque:CZE|Hongrie:HUN|Bosnie:BIH|Monténégro:MNE|Kosovo:KVX|Albanie:ALB|Macédoine du N.:MKD|Georgie:GEO""".split("|"))


def main() -> None:
    labels = set()
    production = Counter()
    for filename in ("clubs.csv", "players.csv"):
        with (ROOT / "data" / filename).open(encoding="cp1252", newline="") as handle:
            for row in csv.DictReader(handle, delimiter=";"):
                names = tuple(item.strip() for item in row["Nation"].split("/"))
                labels.update(names)
                if filename == "players.csv": production[names[0]] += 1
    alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    unknown = [name for name in sorted(labels) if name not in KNOWN]
    codes = dict(KNOWN)
    for index, name in enumerate(unknown):
        codes[name] = "X" + alphabet[index // len(alphabet)] + alphabet[index % len(alphabet)]
    with (ROOT / "data" / "nations.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(("code", "name", "weight", "internal_code"))
        for name in sorted(labels):
            writer.writerow((codes[name], name, production[name], int(name not in KNOWN)))


if __name__ == "__main__": main()
