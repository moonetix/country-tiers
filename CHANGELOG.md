# Changelog

Changes to the tier list, the fields and the helpers are recorded here. Weekly refreshes of upstream data (for example a World Bank income reclassification) are not; see the history of `data/` for those.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/). A tier change for any country is at least a minor version, because it changes what geo-targets built from this data include.

## [1.0.0] - 2026-11-11

### Added

- 250 countries and territories: every ISO 3166-1 code plus XK.
- Tiers from the Moonetix Academy reference article: 20 in Tier 1, 73 in Tier 2, 157 in Tier 3, with `tier_basis` and `alt_tiers` for countries networks disagree on.
- ISO alpha-2, alpha-3, numeric and English names from Debian iso-codes 4.20.1.
- World Bank income group and region.
- `eu_member`, `eu_territory` and `eea_member`.
- `data/countries.json`, `countries.csv`, `tier1.txt`, `tier2.txt`, `tier3.txt`, `countries.schema.json` and `sources.json`.
- Helpers with the same behavior in JavaScript (ESM with type definitions), PHP 8 and Python 3: `tierOf`, `countriesInTier`, `isEU`, `isEEA`, `incomeGroup`, `geoTargets`, `lookup`.
- Shared test vectors in `test/vectors.json`.
- Build script, weekly refresh workflow and CI workflow.

[1.0.0]: https://github.com/moonetix/country-tiers/releases/tag/v1.0.0
