"""Uniform nation display: a short code plus a flag for every nation code the game data uses.

Most nations in ``data/nations.csv`` only carry an internal placeholder code (``X00``, ``X2Z``, ...)
rather than a real football federation code, and neither is an ISO 3166-1 alpha-2 code, which the
vendored flag-icons SVGs (``web/flags/<iso2>.svg``) are keyed by. This module derives a stable
3-letter display code for every nation (reusing the real federation code where one exists) and a
best-effort ISO alpha-2 code from a hand-maintained lookup, for the frontend to build the flag's
URL from. A handful of contested or non-ISO entries (Crimée, Pays Basque, Zanzibar, the former
R.D.A.) are left without a flag rather than guessing.
"""
from __future__ import annotations

import unicodedata

# Nation code -> ISO 3166-1 alpha-2, for flag emoji. Home nations (ENG/SCO/WAL/NIR) fall back to
# the United Kingdom flag since their own subdivision flags are not reliably supported everywhere.
ISO_ALPHA2: dict[str, str] = {
    "RSA": "ZA", "ALB": "AL", "ALG": "DZ", "GER": "DE", "ENG": "GB", "KSA": "SA", "ARG": "AR",
    "AUS": "AU", "AUT": "AT", "BEL": "BE", "BIH": "BA", "BRA": "BR", "BUL": "BG", "CMR": "CM",
    "CAN": "CA", "CHI": "CL", "CHN": "CN", "COL": "CO", "KOR": "KR", "CRO": "HR", "CIV": "CI",
    "DEN": "DK", "ESP": "ES", "FIN": "FI", "FRA": "FR", "GHA": "GH", "GRE": "GR", "HUN": "HU",
    "IRN": "IR", "IRL": "IE", "NIR": "GB", "ISL": "IS", "ISR": "IL", "ITA": "IT", "JPN": "JP",
    "KVX": "XK", "MKD": "MK", "MLI": "ML", "MAR": "MA", "MEX": "MX", "MNE": "ME", "NGA": "NG",
    "NOR": "NO", "NZL": "NZ", "PAR": "PY", "WAL": "GB", "NED": "NL", "POL": "PL", "POR": "PT",
    "PER": "PE", "QAT": "QA", "ROU": "RO", "RUS": "RU", "CZE": "CZ", "SRB": "RS", "SVK": "SK",
    "SVN": "SI", "SUI": "CH", "SWE": "SE", "SEN": "SN", "TUN": "TN", "TUR": "TR", "UKR": "UA",
    "URU": "UY", "VEN": "VE", "SCO": "GB", "EGY": "EG", "ECU": "EC", "USA": "US", "GDR": "DE",
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
        display = _abbreviate(name, taken)
        taken.add(display)
        table[code] = {"name": name, "display_code": display, "flag": flag_code(code)}
    return table
