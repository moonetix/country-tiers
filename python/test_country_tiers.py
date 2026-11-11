import json
import unittest
from pathlib import Path

import country_tiers

VECTORS = json.loads((Path(__file__).resolve().parent.parent / "test" / "vectors.json").read_text("utf-8"))

FUNCTIONS = {
    "tierOf": country_tiers.tier_of,
    "countriesInTier": country_tiers.countries_in_tier,
    "isEU": country_tiers.is_eu,
    "isEEA": country_tiers.is_eea,
    "incomeGroup": country_tiers.income_group,
    "geoTargets": country_tiers.geo_targets,
}


def call(fn, args):
    # Vectors pass options as a trailing object; Python takes them as keyword arguments.
    if args and isinstance(args[-1], dict):
        return FUNCTIONS[fn](*args[:-1], **args[-1])
    return FUNCTIONS[fn](*args)


class SharedVectors(unittest.TestCase):
    def test_vectors(self):
        for case in VECTORS["cases"]:
            with self.subTest(fn=case["fn"], args=case["args"]):
                if case.get("error"):
                    with self.assertRaises(ValueError):
                        call(case["fn"], case["args"])
                else:
                    self.assertEqual(call(case["fn"], case["args"]), case["expect"])

    def test_returns_fresh_list(self):
        first = country_tiers.countries_in_tier(1)
        first.append("ZZ")
        self.assertNotIn("ZZ", country_tiers.countries_in_tier(1))

    def test_bool_is_not_a_tier(self):
        with self.assertRaises(ValueError):
            country_tiers.countries_in_tier(True)


if __name__ == "__main__":
    unittest.main()
