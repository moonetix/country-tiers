"""Tier 1, 2 and 3 countries with ISO codes, World Bank income groups and EU/EEA flags.

Standard library only. Reads ../data/countries.json next to this file unless
you call load() with another path.
"""

import json
from pathlib import Path

__all__ = [
    "load",
    "countries",
    "lookup",
    "tier_of",
    "countries_in_tier",
    "is_eu",
    "is_eea",
    "income_group",
    "geo_targets",
]

_FORMATS = ("iso2", "iso3", "numeric")
_rows = None
_by_iso2 = {}
_by_iso3 = {}


def load(path):
    """Load a different copy of countries.json, for example one you vendored."""
    global _rows, _by_iso2, _by_iso3
    with open(path, encoding="utf-8") as fh:
        rows = json.load(fh)
    _rows = rows
    _by_iso2 = {r["iso2"]: r for r in rows}
    _by_iso3 = {r["iso3"]: r for r in rows}


def countries():
    if _rows is None:
        load(Path(__file__).resolve().parent.parent / "data" / "countries.json")
    return _rows


def lookup(code):
    """Accepts alpha-2 or alpha-3 in any case, and "UK" for GB."""
    if not isinstance(code, str):
        return None
    countries()
    c = code.strip().upper()
    if c == "UK":
        c = "GB"
    if len(c) == 2:
        return _by_iso2.get(c)
    if len(c) == 3:
        return _by_iso3.get(c)
    return None


def tier_of(code):
    row = lookup(code)
    return row["tier"] if row else None


def _check_tier(tier):
    # bool is a subclass of int, so True would otherwise pass as tier 1.
    if type(tier) is not int or tier not in (1, 2, 3):
        raise ValueError(f"tier must be 1, 2 or 3, got {tier!r}")
    return tier


def countries_in_tier(tier):
    _check_tier(tier)
    return [r["iso2"] for r in countries() if r["tier"] == tier]


def is_eu(code, territories=False):
    row = lookup(code)
    if not row:
        return False
    return row["eu_territory"] if territories else row["eu_member"]


def is_eea(code):
    row = lookup(code)
    return row["eea_member"] if row else False


def income_group(code):
    row = lookup(code)
    return row["income_group"] if row else None


def _resolve_all(codes, label):
    out = []
    for code in codes:
        row = lookup(code)
        if not row:
            raise ValueError(f"unknown country code in {label}: {code!r}")
        out.append(row["iso2"])
    return out


def geo_targets(tiers, exclude=(), include=(), alternates=False, format="iso2"):
    wanted = [_check_tier(t) for t in (tiers if isinstance(tiers, (list, tuple, set)) else [tiers])]
    if format not in _FORMATS:
        raise ValueError(f"format must be one of {', '.join(_FORMATS)}")
    excluded = set(_resolve_all(exclude, "exclude"))
    picked = set(_resolve_all(include, "include"))

    for r in countries():
        in_tier = r["tier"] in wanted or (alternates and any(t in wanted for t in r["alt_tiers"]))
        if in_tier:
            picked.add(r["iso2"])
    picked -= excluded

    values = (_by_iso2[code][format] for code in picked)
    return sorted(v for v in values if v is not None)
