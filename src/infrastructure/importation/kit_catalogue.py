"""Live club appearance from the CSV, cached until the file changes."""
import csv
from pathlib import Path
from threading import Lock

from .readers import kit_components


class KitCatalogue:
    def __init__(self, path: Path):
        self.path = path
        self.lock = Lock()
        self.signature = None
        self.rows: dict[int, dict] = {}
        self.revision = 0

    def snapshot(self) -> tuple[int, dict[int, dict]]:
        with self.lock:
            try:
                stat = self.path.stat()
                signature = (stat.st_mtime_ns, stat.st_size, stat.st_ino)
                if signature == self.signature:
                    return self.revision, self.rows
                with self.path.open(encoding="utf-8-sig", newline="") as handle:
                    reader = csv.DictReader(handle, delimiter=";")
                    if not {"UID", "HomeKitID", "HomeKitMajorColorRGB"} <= set(reader.fieldnames or ()):
                        return self.revision, self.rows
                    rows = {}
                    for row in reader:
                        # A partially written row is retried on the next request.
                        if None in row or any(value is None for value in row.values()):
                            return self.revision, self.rows
                        if not row["UID"]:
                            continue
                        uid = int(row["UID"])
                        if uid in rows:
                            return self.revision, self.rows
                        rows[uid] = kit_components(row, include_home=True)
                if self.path.stat().st_mtime_ns != stat.st_mtime_ns:
                    return self.revision, self.rows
            except (OSError, UnicodeError, ValueError, csv.Error):
                # Editors may temporarily replace or truncate the file while saving.
                return self.revision, self.rows
            if rows != self.rows:
                self.rows = rows
                self.revision += 1
            self.signature = signature
            return self.revision, self.rows
