"""Uniform nation display: a short code plus a flag for every nation code the game data uses.

Most nations in ``data/nations.csv`` only carry an internal placeholder code (``X00``, ``X2Z``, ...)
rather than a real football federation code, and neither is an ISO 3166-1 alpha-2 code, which the
vendored flag-icons SVGs (``web/flags/<iso2>.svg``) are keyed by. This module derives a stable
3-letter display code for every nation (reusing the real federation code where one exists) and a
best-effort flag-icons code (ISO alpha-2, or ``gb-eng``/``gb-sct``/``gb-wls``/``gb-nir`` for the
home nations) from a hand-maintained lookup, for the frontend to build the flag's URL from. A handful of contested or non-ISO entries (Crimée, Pays Basque, Zanzibar, the former
R.D.A.) are left without a flag rather than guessing.
"""
from __future__ import annotations

import unicodedata
from pathlib import Path
from types import SimpleNamespace

from infrastructure.importation.kit_catalogue import KitCatalogue
from .kits import kit_url

# Nation code -> flag-icons code (ISO 3166-1 alpha-2, or the ISO 3166-2 style ``GB-ENG`` for the home
# nations, which have their own SVGs in ``web/flags``). "X1B" (Grande-Bretagne) keeps the plain GB flag.
ISO_ALPHA2: dict[str, str] = {
    "RSA": "ZA", "ALB": "AL", "ALG": "DZ", "GER": "DE", "ENG": "GB-ENG", "KSA": "SA", "ARG": "AR",
    "AUS": "AU", "AUT": "AT", "BEL": "BE", "BIH": "BA", "BRA": "BR", "BUL": "BG", "CMR": "CM",
    "CAN": "CA", "CHI": "CL", "CHN": "CN", "COL": "CO", "KOR": "KR", "CRO": "HR", "CIV": "CI",
    "DEN": "DK", "ESP": "ES", "FIN": "FI", "FRA": "FR", "GHA": "GH", "GRE": "GR", "HUN": "HU",
    "IRN": "IR", "IRL": "IE", "NIR": "GB-NIR", "ISL": "IS", "ISR": "IL", "ITA": "IT", "JPN": "JP",
    "KVX": "XK", "MKD": "MK", "MLI": "ML", "MAR": "MA", "MEX": "MX", "MNE": "ME", "NGA": "NG",
    "NOR": "NO", "NZL": "NZ", "PAR": "PY", "WAL": "GB-WLS", "NED": "NL", "POL": "PL", "POR": "PT",
    "PER": "PE", "QAT": "QA", "ROU": "RO", "RUS": "RU", "CZE": "CZ", "SRB": "RS", "SVK": "SK",
    "SVN": "SI", "SUI": "CH", "SWE": "SE", "SEN": "SN", "TUN": "TN", "TUR": "TR", "UKR": "UA",
    "URU": "UY", "VEN": "VE", "SCO": "GB-SCT", "EGY": "EG", "ECU": "EC", "USA": "US", "GDR": "DE",
    "X00": "AF", "X01": "AD", "X02": "AO", "X03": "AI", "X04": "AG", "X05": "AM", "X06": "AW",
    "X07": "AZ", "X08": "BS", "X09": "BH", "X0A": "BD", "X0B": "BB", "X0C": "BM", "X0D": "BT",
    "X0E": "MM", "X0F": "BY", "X0G": "BO", "X0H": "BQ", "X0I": "BW", "X0J": "BN", "X0K": "BF",
    "X0L": "BI", "X0M": "BZ", "X0N": "BJ", "X0O": "KH", "X0P": "CV", "X0Q": "KY", "X0R": "CF",
    "X0S": "CY", "X0T": "KM", "X0U": "CG", "X0V": "CK", "X0W": "KP", "X0X": "CR", "X0Z": "CU",
    "X10": "CW", "X11": "DJ", "X12": "DM", "X13": "AE", "X14": "EE", "X15": "SZ", "X16": "FJ",
    "X17": "FO", "X18": "GA", "X19": "GM", "X1A": "GI", "X1B": "GB", "X1C": "GD", "X1D": "GP",
    "X1E": "GU", "X1F": "GT", "X1G": "GN", "X1H": "GQ", "X1I": "GW", "X1J": "GY", "X1K": "GF",
    "X1L": "GE", "X1M": "HT", "X1N": "HN", "X1O": "HK", "X1P": "IN", "X1Q": "ID", "X1R": "IQ",
    "X1S": "JM", "X1T": "JO", "X1U": "KZ", "X1V": "KE", "X1W": "KG", "X1X": "KI", "X1Y": "KW",
    "X1Z": "RE", "X20": "LA", "X21": "LS", "X22": "LV", "X23": "LB", "X24": "LR", "X25": "LY",
    "X26": "LI", "X27": "LT", "X28": "LU", "X29": "MO", "X2A": "MG", "X2B": "MY", "X2C": "MW",
    "X2D": "MV", "X2E": "MT", "X2F": "MP", "X2G": "MQ", "X2H": "MR", "X2I": "YT", "X2J": "FM",
    "X2K": "MD", "X2L": "MC", "X2M": "MN", "X2N": "MS", "X2O": "MZ", "X2P": "NA", "X2Q": "NI",
    "X2R": "NE", "X2S": "NC", "X2T": "NP", "X2U": "OM", "X2V": "UG", "X2W": "UZ", "X2X": "PK",
    "X2Y": "PS", "X2Z": "PA", "X30": "PG", "X32": "PH", "X33": "PR", "X34": "CD", "X36": "RW",
    "X37": "DO", "X38": "BL", "X39": "KN", "X3A": "SM", "X3B": "MF", "X3C": "SX", "X3D": "PM",
    "X3E": "VC", "X3F": "LC", "X3G": "SB", "X3H": "SV", "X3I": "WS", "X3J": "AS", "X3K": "SC",
    "X3L": "SL", "X3M": "SG", "X3N": "SO", "X3O": "SD", "X3P": "SS", "X3Q": "LK", "X3R": "SR",
    "X3S": "SY", "X3T": "ST", "X3U": "TJ", "X3V": "PF", "X3W": "TW", "X3X": "TZ", "X3Y": "TD",
    "X3Z": "TH", "X40": "TL", "X41": "TG", "X42": "TO", "X43": "TT", "X44": "TM", "X45": "TC",
    "X46": "TV", "X47": "VU", "X48": "VN", "X49": "YE", "X4A": "ZM", "X4C": "ZW", "X4D": "ER",
    "X4E": "ET", "X4F": "MU", "X4G": "VG", "X4H": "VI", "X4I": "WF",
}


def flag_code(code: str) -> str:
    iso2 = ISO_ALPHA2.get(code)
    return iso2.lower() if iso2 else ""


# A selection's kits, by the nation's code, read from ``data/nations.csv`` as a club's are from ``clubs.csv``: an edit of the
# file shows at the next request, in a game under way too. They are a display choice, which the save does not keep: the
# header of a selection's page, its shirts on a pitch and its outfits read them.
NATION_KITS = KitCatalogue(Path(__file__).resolve().parents[2] / "data" / "nations.csv", key="code", parse=str)


def nation_kit(code: str | None) -> dict:
    """The garments of a selection's kits, under the names a club's carry; none for a nation the file gives no kit."""
    return NATION_KITS.snapshot()[1].get(code or "", {})


def kit_colors(code: str | None) -> dict[str, str | None]:
    """The colours of a selection's home shirt and its pattern, under the keys a club's carry; none without a kit."""
    kit = nation_kit(code)
    return {"major_color": kit.get("home_kit_major_color"), "minor_color": kit.get("home_kit_minor_color"),
            "third_color": kit.get("home_kit_third_color"), "kit_id": kit.get("home_kit_id")}


def kit_outfits(code: str | None) -> dict[str, str | None]:
    """The pictures of a selection's two outfits, its logo on the chest; none without a home shirt."""
    kit = nation_kit(code)
    if not kit.get("home_kit_major_color"):
        return {"kit_url": None, "away_kit_url": None}
    garments = SimpleNamespace(**kit)
    return {"kit_url": kit_url(garments, nation=code), "away_kit_url": kit_url(garments, "away", nation=code)}


# The header of a competition that has no country, by the two characters of its badge: its colour, its second one, and the
# ground it stands on when its band is not filled with its own colour (the night blue the three European cups share, the
# black under the World Cup's gold, the navy under the Nations League's cyan). A display choice, as a kit is.
COMPETITION_COLORS: dict[str, tuple[str, str | None, str | None]] = {
    "C1": ("#2447e6", None, "#0a0b5c"), "C3": ("#f26522", None, "#0a0b5c"), "C4": ("#16be28", None, "#0a0b5c"),
    "EU": ("#003399", "#ffcc00", None), "CM": ("#d4a72c", None, "#111418"), "LN": ("#00a6d6", None, "#0b1e3f"),
}


def competition_colors(code: str | None, nation: str | None = None) -> dict[str, str | None]:
    """The colours of a competition's header, under the keys a club's carry, and the ground it stands on: its own by its
    badge; for a league or a national cup, the kit of the selection of its country, by its code `nation`."""
    major, minor, ground = COMPETITION_COLORS.get(code or "", (None, None, None))
    if major is None and nation:
        kit = kit_colors(nation)
        return {"major_color": kit["major_color"], "minor_color": kit["minor_color"], "ground_color": None}
    return {"major_color": major, "minor_color": minor, "ground_color": ground}


# The codes the federations go by, for the nations the source file lists under a code of its own (X0R for the Central
# African Republic): without them, a code would be made from the name and read « REP ».
FIFA_CODES = {
    "X00": "AFG", "X01": "AND", "X02": "ANG", "X03": "AIA", "X04": "ATG", "X05": "ARM", "X06": "ARU", "X07": "AZE", "X08": "BAH", "X09": "BHR",
    "X0A": "BAN", "X0B": "BRB", "X0C": "BER", "X0D": "BHU", "X0E": "MYA", "X0F": "BLR", "X0G": "BOL", "X0H": "BOE", "X0I": "BOT", "X0J": "BRU",
    "X0K": "BFA", "X0L": "BDI", "X0M": "BLZ", "X0N": "BEN", "X0O": "CAM", "X0P": "CPV", "X0Q": "CAY", "X0R": "CTA", "X0S": "CYP", "X0T": "COM",
    "X0U": "CGO", "X0V": "COK", "X0W": "PRK", "X0X": "CRC", "X0Z": "CUB", "X10": "CUW", "X11": "DJI", "X12": "DMA", "X13": "UAE", "X14": "EST",
    "X15": "SWZ", "X16": "FIJ", "X17": "FRO", "X18": "GAB", "X19": "GAM", "X1A": "GIB", "X1B": "GBR", "X1C": "GRN", "X1D": "GPE", "X1E": "GUM",
    "X1F": "GUA", "X1G": "GUI", "X1H": "EQG", "X1I": "GNB", "X1J": "GUY", "X1K": "GUF", "X1L": "GEO", "X1M": "HAI", "X1N": "HON", "X1O": "HKG",
    "X1P": "IND", "X1Q": "IDN", "X1R": "IRQ", "X1S": "JAM", "X1T": "JOR", "X1U": "KAZ", "X1V": "KEN", "X1W": "KGZ", "X1X": "KIR", "X1Y": "KUW",
    "X1Z": "REU", "X20": "LAO", "X21": "LES", "X22": "LVA", "X23": "LBN", "X24": "LBR", "X25": "LBY", "X26": "LIE", "X27": "LTU", "X28": "LUX",
    "X29": "MAC", "X2A": "MAD", "X2B": "MAS", "X2C": "MWI", "X2D": "MDV", "X2E": "MLT", "X2F": "NMI", "X2G": "MTQ", "X2H": "MTN", "X2I": "MYT",
    "X2J": "FSM", "X2K": "MDA", "X2L": "MCO", "X2M": "MNG", "X2N": "MSR", "X2O": "MOZ", "X2P": "NAM", "X2Q": "NCA", "X2R": "NIG", "X2S": "NCL",
    "X2T": "NEP", "X2U": "OMA", "X2V": "UGA", "X2W": "UZB", "X2X": "PAK", "X2Y": "PLE", "X2Z": "PAN", "X30": "PNG", "X32": "PHI", "X33": "PUR",
    "X34": "COD", "X35": "GDR", "X36": "RWA", "X37": "DOM", "X38": "BLM", "X39": "SKN", "X3A": "SMR", "X3B": "SMN", "X3C": "SXM", "X3D": "SPM",
    "X3E": "VIN", "X3F": "LCA", "X3G": "SOL", "X3H": "SLV", "X3I": "SAM", "X3J": "ASA", "X3K": "SEY", "X3L": "SLE", "X3M": "SIN", "X3N": "SOM",
    "X3O": "SDN", "X3P": "SSD", "X3Q": "SRI", "X3R": "SUR", "X3S": "SYR", "X3T": "STP", "X3U": "TJK", "X3V": "TAH", "X3W": "TPE", "X3X": "TAN",
    "X3Y": "CHA", "X3Z": "THA", "X40": "TLS", "X41": "TOG", "X42": "TGA", "X43": "TRI", "X44": "TKM", "X45": "TCA", "X46": "TUV", "X47": "VAN",
    "X48": "VIE", "X49": "YEM", "X4A": "ZAM", "X4B": "ZAN", "X4C": "ZIM", "X4D": "ERI", "X4E": "ETH", "X4F": "MRI", "X4G": "VGB", "X4H": "VIR",
    "X4I": "WLF",
}


def _letters(name: str) -> str:
    stripped = unicodedata.normalize("NFKD", name)
    return "".join(character for character in stripped.upper() if character.isalpha())


def _abbreviate(name: str, taken: set[str]) -> str:
    letters = _letters(name) or "ZZZ"
    for start in range(max(1, len(letters) - 2)):
        candidate = letters[start:start + 3]
        if len(candidate) == 3 and candidate not in taken:
            return candidate
    base = letters[0]
    index = 0
    while True:
        candidate = f"{base}{index:02d}"
        if candidate not in taken:
            return candidate
        index += 1


def build_nation_table(nation_names: dict[str, str]) -> dict[str, dict]:
    """One entry per nation code: a stable 3-letter display code (real codes are kept as-is) and a flag."""
    real_codes = {code for code in nation_names if len(code) == 3 and code.isalpha()}
    taken = set(real_codes)
    table = {code: {"name": nation_names[code], "display_code": code, "flag": flag_code(code)} for code in real_codes}
    for code, name in sorted(nation_names.items()):
        if code in table:
            continue
        display = FIFA_CODES[code] if FIFA_CODES.get(code) not in (None, *taken) else _abbreviate(name, taken)
        taken.add(display)
        table[code] = {"name": name, "display_code": display, "flag": flag_code(code)}
    return table
