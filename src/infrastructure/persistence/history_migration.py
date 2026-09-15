"""Recover only historical facts actually retained by older saves."""
from dataclasses import replace
from core.domain.world import World, TransferRecord
from core.world.finances import financial_season


def recover_birthdates(world: World, source_path) -> None:
    """Backfill facts only when the CSV is exactly the original import source."""
    import csv
    from hashlib import sha256
    from io import StringIO
    from core.domain.date import Date
    missing = {row.player_id for row in world.transfers if row.born is None and row.player_id in world.retired}
    if not missing or not source_path.is_file(): return
    raw = source_path.read_bytes()
    if sha256(raw).hexdigest() != world.source_hashes.get('players.csv'): return
    reader = csv.DictReader(StringIO(raw.decode(world.config.import_settings.source_format.encoding)), delimiter=';')
    if not {'UID', 'DateOfBirth'} <= set(reader.fieldnames or []): return
    birthdays = {int(row['UID']): Date.parse(row['DateOfBirth']) for row in reader if int(row['UID']) in missing}
    world.transfers = [replace(row, born=birthdays[row.player_id]) if row.born is None and row.player_id in birthdays else row
                       for row in world.transfers]


def upgrade_history(world: World) -> None:
    if world.finance_history_since is None: world.finance_history_since = world.date
    if world.movement_history_since is not None: return
    world.movement_history_since = min((entry.date for entry in world.journal), default=world.date)
    reasons = {(entry.date, entry.player_id, entry.club_id): entry.kind for entry in world.journal
               if entry.kind in ("release", "retirement")}
    review = world.config.world.key_dates.population_review
    records = []
    for item in world.transfers:
        kind = reasons.get((item.date, item.player_id, item.source_id), "departure_unknown") if item.target_id is None else item.kind
        year = financial_season(world, item.date)
        if kind in ("release", "retirement", "departure_unknown") and (item.date.month, item.date.day) == (review.month, review.day): year -= 1
        records.append(replace(item, kind=kind, season=year))
    existing = {(item.date, item.player_id, item.target_id, item.kind) for item in records}
    for entry in world.journal:
        if entry.kind == "academy" and entry.club_id is not None and (entry.date, entry.player_id, entry.club_id, "academy") not in existing:
            records.append(TransferRecord(entry.date, entry.player_id, None, entry.club_id, 0, "academy", financial_season(world, entry.date)))
            existing.add((entry.date, entry.player_id, entry.club_id, "academy"))
    world.transfers = sorted(records, key=lambda item: item.date)
