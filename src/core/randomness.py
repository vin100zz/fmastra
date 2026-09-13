"""Stable stream derivation, unaffected by process hash randomization."""
from hashlib import sha256
from random import Random


def derived_seed(seed: int, *parts: object) -> int:
    payload = "\0".join(str(part) for part in (seed, *parts)).encode("utf-8")
    return int.from_bytes(sha256(payload).digest(), "big")


def stream(seed: int, *parts: object) -> Random:
    return Random(derived_seed(seed, *parts))
