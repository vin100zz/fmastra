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


# A selection's kit, by the nation's name in ``config/nations.json``: the colour of its home shirt, then its second colour.
# They are a display choice, as a club's are: the header of a selection's page and its shirts on a pitch read them.
KIT_COLORS: dict[str, tuple[str, str]] = {
    # Europe
    "Albanie": ("#e41e20", "#111111"), "Allemagne": ("#ffffff", "#111111"), "Andorre": ("#d0103a", "#fedf00"),
    "Angleterre": ("#ffffff", "#0b1f4b"), "Arménie": ("#d90012", "#f2a800"), "Autriche": ("#ed2939", "#ffffff"),
    "Azerbaïdjan": ("#0092bc", "#e4002b"), "Belgique": ("#e30613", "#111111"), "Biélorussie": ("#c8313e", "#007c30"),
    "Bosnie-Herzégovine": ("#002395", "#fecb00"), "Bulgarie": ("#ffffff", "#00966e"), "Chypre": ("#0033a0", "#ffffff"),
    "Croatie": ("#ed1c24", "#ffffff"), "Danemark": ("#c8102e", "#ffffff"), "Espagne": ("#c60b1e", "#ffc400"),
    "Estonie": ("#0072ce", "#111111"), "Finlande": ("#ffffff", "#003580"), "France": ("#1f3f94", "#ffffff"),
    "Gibraltar": ("#da000c", "#ffffff"), "Grèce": ("#ffffff", "#0d5eaf"), "Géorgie": ("#ffffff", "#e8112d"),
    "Hongrie": ("#ce2939", "#477050"), "Irlande": ("#169b62", "#ffffff"), "Irlande du Nord": ("#007a3d", "#ffffff"),
    "Islande": ("#02529c", "#dc1e35"), "Israël": ("#0038b8", "#ffffff"), "Italie": ("#1560bd", "#ffffff"),
    "Kazakhstan": ("#00afca", "#fec50c"), "Kosovo": ("#244aa5", "#d0a650"), "Lettonie": ("#9e3039", "#ffffff"),
    "Liechtenstein": ("#002b7f", "#ce1126"), "Lituanie": ("#fdb913", "#006a44"), "Luxembourg": ("#ed2939", "#00a1de"),
    "Macédoine du Nord": ("#d20000", "#ffe600"), "Malte": ("#cf142b", "#ffffff"), "Moldavie": ("#0046ae", "#ffd200"),
    "Monténégro": ("#c40308", "#d3ae3b"), "Norvège": ("#ba0c2f", "#00205b"), "Pays de Galles": ("#c8102e", "#00ab39"),
    "Pays-Bas": ("#f36c21", "#ffffff"), "Pologne": ("#ffffff", "#dc143c"), "Portugal": ("#c8102e", "#046a38"),
    "Roumanie": ("#fcd116", "#002b7f"), "Russie": ("#d52b1e", "#ffffff"), "République tchèque": ("#d7141a", "#11457e"),
    "Saint-Marin": ("#5eb6e4", "#ffffff"), "Serbie": ("#c6363c", "#0c4076"), "Slovaquie": ("#0b4ea2", "#ffffff"),
    "Slovénie": ("#ffffff", "#005da4"), "Suisse": ("#da291c", "#ffffff"), "Suède": ("#fecc02", "#006aa7"),
    "Turquie": ("#e30a17", "#ffffff"), "Ukraine": ("#ffd500", "#005bbb"), "Écosse": ("#0a2240", "#ffffff"),
    "Îles Féroé": ("#ffffff", "#0065bd"),
    # Amérique du Sud
    "Argentine": ("#75aadb", "#ffffff"), "Bolivie": ("#007934", "#ffffff"), "Brésil": ("#ffdf00", "#009c3b"),
    "Chili": ("#d52b1e", "#0039a6"), "Colombie": ("#fcd116", "#003893"), "Guyana": ("#fcd116", "#009e49"),
    "Paraguay": ("#d52b1e", "#ffffff"), "Pérou": ("#ffffff", "#d91023"), "Suriname": ("#ffffff", "#377e3f"),
    "Uruguay": ("#5cbfeb", "#111111"), "Venezuela": ("#6f1d35", "#ffcc00"), "Équateur": ("#ffd100", "#0072ce"),
    # Amérique du Nord, Amérique centrale et Caraïbes
    "Anguilla": ("#00a3e0", "#f47b20"), "Antigua-et-Barbuda": ("#fcd116", "#111111"), "Aruba": ("#f9d616", "#418fde"),
    "Bahamas": ("#ffc72c", "#00778b"), "Barbade": ("#ffc726", "#00267f"), "Bermudes": ("#00205b", "#e4002b"),
    "Bélize": ("#003f87", "#ce1126"), "Canada": ("#d80621", "#ffffff"), "Costa Rica": ("#ce1126", "#002b7f"),
    "Cuba": ("#cf142b", "#002a8f"), "Curaçao": ("#002b7f", "#f9e814"), "Dominique": ("#006b3f", "#fcd116"),
    "Grenade": ("#007a5e", "#fcd116"), "Guatemala": ("#ffffff", "#4997d0"), "Haïti": ("#00209f", "#d21034"),
    "Honduras": ("#ffffff", "#0073cf"), "Jamaïque": ("#fed100", "#009b3a"), "Mexique": ("#006847", "#ce1126"),
    "Montserrat": ("#007a5e", "#ffffff"), "Nicaragua": ("#0067c6", "#ffffff"), "Panama": ("#da121a", "#072357"),
    "Porto Rico": ("#ed1c24", "#0050f0"), "République dominicaine": ("#002d62", "#ce1126"),
    "Saint-Kitts et Névis": ("#ce1126", "#009e49"), "Saint-Vincent": ("#fcd116", "#009e60"),
    "Sainte-Lucie": ("#65cfff", "#fcd116"), "Salvador": ("#0f47af", "#ffffff"), "Trinité-et-Tobago": ("#ce1126", "#111111"),
    "États-Unis": ("#ffffff", "#0a3161"), "Îles Caïmans": ("#c8102e", "#00247d"),
    "Îles Turks-et-Caïcos": ("#002868", "#fcd116"), "Îles Vierges": ("#006a4e", "#fcd116"),
    "Îles Vierges US": ("#ffd100", "#0033a0"),
    # Afrique
    "Afrique du Sud": ("#ffb81c", "#007749"), "Algérie": ("#ffffff", "#006233"), "Angola": ("#cc092f", "#111111"),
    "Botswana": ("#75aadb", "#111111"), "Burkina Faso": ("#009e49", "#ef2b2d"), "Burundi": ("#ce1126", "#1eb53a"),
    "Bénin": ("#fcd116", "#008751"), "Cameroun": ("#007a5e", "#ce1126"), "Comores": ("#009639", "#ffffff"),
    "Congo": ("#dc241f", "#fbde4a"), "Côte d'Ivoire": ("#f77f00", "#009e60"), "Djibouti": ("#6ab2e7", "#12ad2b"),
    "Eswatini": ("#3e5eb9", "#ffd900"), "Gabon": ("#fcd116", "#3a75c4"), "Gambie": ("#ce1126", "#0c1c8c"),
    "Ghana": ("#ffffff", "#111111"), "Guinée": ("#ce1126", "#fcd116"), "Guinée Équatoriale": ("#e32118", "#3e9a00"),
    "Guinée-Bissau": ("#ce1126", "#009e49"), "Kenya": ("#bb0000", "#006600"), "Lesotho": ("#00209f", "#009543"),
    "Liberia": ("#bf0a30", "#002868"), "Libye": ("#e70013", "#239e46"), "Madagascar": ("#007e3a", "#fc3d32"),
    "Malawi": ("#ce1126", "#111111"), "Mali": ("#fcd116", "#14b53a"), "Maroc": ("#c1272d", "#006233"),
    "Mauritanie": ("#00a95c", "#ffd700"), "Mozambique": ("#d21034", "#111111"), "Namibie": ("#d21034", "#003580"),
    "Niger": ("#e05206", "#0db02b"), "Nigeria": ("#008751", "#ffffff"), "Ouganda": ("#fcdc04", "#d90000"),
    "Rwanda": ("#00a1de", "#fad201"), "République centrafricaine": ("#003082", "#ffce00"),
    "République démocratique du Congo": ("#007fff", "#ce1021"), "Seychelles": ("#d62828", "#003f87"),
    "Sierra Leone": ("#1eb53a", "#0072c6"), "Somalie": ("#4189dd", "#ffffff"), "Soudan": ("#d21034", "#007229"),
    "Soudan du Sud": ("#0f47af", "#fcdd09"), "São Tomé-et-Príncipe": ("#12ad2b", "#ffce00"),
    "Sénégal": ("#ffffff", "#00853f"), "Tanzanie": ("#00a3dd", "#1eb53a"), "Tchad": ("#002664", "#fecb00"),
    "Togo": ("#ffce00", "#006a4e"), "Tunisie": ("#e70013", "#ffffff"), "Zambie": ("#198a00", "#ef7d00"),
    "Zimbabwe": ("#ffd200", "#006400"), "Égypte": ("#ce1126", "#111111"), "Érythrée": ("#4189dd", "#ea0437"),
    "Éthiopie": ("#078930", "#fcdd09"), "Île Maurice": ("#ea2839", "#1a206d"), "Îles du Cap-Vert": ("#003893", "#cf2027"),
    # Asie
    "Afghanistan": ("#d32011", "#111111"), "Arabie saoudite": ("#006c35", "#ffffff"), "Australie": ("#ffcd00", "#00843d"),
    "Bahreïn": ("#ce1126", "#ffffff"), "Bangladesh": ("#006a4e", "#f42a41"), "Bhoutan": ("#ff4e12", "#ffd520"),
    "Birmanie": ("#ea2839", "#ffffff"), "Cambodge": ("#032ea1", "#e00025"), "Chine": ("#de2910", "#ffde00"),
    "Corée du Nord": ("#ed1c27", "#ffffff"), "Corée du Sud": ("#cd2e3a", "#0047a0"), "Guam": ("#00297b", "#c62139"),
    "Hong Kong (RP de Chine)": ("#de2910", "#ffffff"), "Inde": ("#0f6cb7", "#ff9933"), "Indonésie": ("#ce1126", "#ffffff"),
    "Irak": ("#007a3d", "#ffffff"), "Iran": ("#ffffff", "#da0000"), "Japon": ("#1b3fa0", "#ffffff"),
    "Jordanie": ("#ce1126", "#ffffff"), "Kirghizistan": ("#e8112d", "#ffef00"), "Koweït": ("#0055a4", "#ffffff"),
    "Laos": ("#ce1126", "#002868"), "Liban": ("#ed1c24", "#ffffff"), "Macao (RP de Chine)": ("#00785e", "#ffffff"),
    "Malaisie": ("#ffcc00", "#111111"), "Maldives": ("#d21034", "#007e3a"), "Mongolie": ("#015197", "#c4272f"),
    "Népal": ("#dc143c", "#003893"), "Oman": ("#db161b", "#ffffff"), "Ouzbékistan": ("#ffffff", "#0099b5"),
    "Pakistan": ("#01411c", "#ffffff"), "Palestine": ("#ce1126", "#111111"), "Philippines": ("#0038a8", "#ce1126"),
    "Qatar": ("#8a1538", "#ffffff"), "Singapour": ("#ed2939", "#ffffff"), "Sri Lanka": ("#ffb700", "#8d153a"),
    "Sultanat de Brunei": ("#f7e017", "#111111"), "Syrie": ("#ce1126", "#ffffff"), "Tadjikistan": ("#cc0000", "#006600"),
    "Taipei chinois (RP de Chine)": ("#000095", "#ffffff"), "Thaïlande": ("#00247d", "#a51931"),
    "Timor Oriental": ("#dc241f", "#ffc726"), "Turkménistan": ("#00843d", "#ffffff"), "Vietnam": ("#da251d", "#ffcd00"),
    "Yémen": ("#ce1126", "#ffffff"), "Émirats arabes unis": ("#ffffff", "#c8102e"),
    # Océanie
    "Nouvelle-Calédonie": ("#e4002b", "#7a7a7a"), "Nouvelle-Zélande": ("#ffffff", "#111111"),
    "Papouasie-Nouvelle-Guinée": ("#ce1126", "#fcd116"), "Samoa": ("#002b7f", "#ce1126"),
    "Samoa américaines": ("#000066", "#bd1021"), "Tahiti": ("#e2001a", "#ffffff"), "Vanuatu": ("#fdce12", "#111111"),
    "Îles Cook": ("#007a3d", "#ffffff"), "Îles Fidji": ("#ffffff", "#68bfe5"), "Îles Salomon": ("#215b33", "#fcd116"),
    "Îles Tonga": ("#c10000", "#ffffff"),
}


def kit_colors(name: str) -> dict[str, str | None]:
    """The two colours of a selection's kit, under the keys a club's carry; none for a nation the table does not list."""
    major, minor = KIT_COLORS.get(name, (None, None))
    return {"major_color": major, "minor_color": minor}


# The header of a competition that has no country, by the two characters of its badge: its colour, its second one, and the
# ground it stands on when its band is not filled with its own colour (the night blue the three European cups share, the
# black under the World Cup's gold). A display choice, as a kit is.
COMPETITION_COLORS: dict[str, tuple[str, str | None, str | None]] = {
    "C1": ("#2447e6", None, "#0a0b5c"), "C3": ("#f26522", None, "#0a0b5c"), "C4": ("#16be28", None, "#0a0b5c"),
    "EU": ("#003399", "#ffcc00", None), "CM": ("#d4a72c", None, "#111418"),
}


def competition_colors(code: str | None, nation: str | None = None) -> dict[str, str | None]:
    """The colours of a competition's header, under the keys a club's carry, and the ground it stands on: its own by its
    badge; for a league or a national cup, the kit of the selection of its country, named `nation`."""
    major, minor, ground = COMPETITION_COLORS.get(code or "", (None, None, None))
    if major is None and nation:
        return {**kit_colors(nation), "ground_color": None}
    return {"major_color": major, "minor_color": minor, "ground_color": ground}


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
