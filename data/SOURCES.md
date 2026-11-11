# Sources and licenses

The code in this repository is MIT licensed. The data in this folder is built from the sources below, and each field stays under the license of the source it came from. If you redistribute `countries.json` or `countries.csv`, keep this attribution with it.

| Fields | Source | License |
| --- | --- | --- |
| `iso2`, `iso3`, `numeric`, `name`, `common_name` | [Debian iso-codes](https://salsa.debian.org/iso-codes-team/iso-codes), `data/iso_3166-1.json` at tag v4.20.1 | [LGPL-2.1-or-later](https://salsa.debian.org/iso-codes-team/iso-codes/-/blob/v4.20.1/LICENSES/LGPL-2.1-or-later.txt) |
| `income_group`, `income_code`, `region`, `region_code` | [World Bank country API](https://api.worldbank.org/v2/country?format=json&per_page=400), fetched weekly | [CC BY 4.0](https://datacatalog.worldbank.org/public-licenses) |
| `eu_member` | [European Union, EU countries](https://european-union.europa.eu/principles-countries-history/eu-countries_en), checked on every build | [CC BY 4.0](https://european-union.europa.eu/legal-notice_en) |
| `eea_member` | [Eurostat glossary: European Economic Area](https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Glossary:European_Economic_Area_(EEA)) | [CC BY 4.0](https://european-union.europa.eu/legal-notice_en) |
| `eu_territory` | [European Commission: outermost regions](https://regions-and-cities.ec.europa.eu/policy/themes/outermost-regions) and [TFEU Article 355(4)](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:12016E355) for Åland | [CC BY 4.0](https://european-union.europa.eu/legal-notice_en) |
| `tier`, `tier_basis`, `alt_tiers` | [Moonetix Academy: Tier 1, 2 and 3 countries](https://moonetix.com/academy/glossary/tier-1-2-3-countries) and the rule in `sources/tiers.json` | MIT, like the code |

## Changes made to the source data

- **iso-codes.** Only the five fields above are kept. `common_name` falls back to `name` when iso-codes has no common name. XK (Kosovo) is added by hand: it is a user-assigned code, not part of ISO 3166-1, but GeoIP databases and ad platforms return it. Its alpha-3 `XKX` follows the World Bank.
- **World Bank.** Aggregates such as "Euro area" are dropped. Trailing spaces in region names are trimmed. Guernsey (GG) and Jersey (JE) take the values of the World Bank's "Channel Islands" economy (JG), which covers both. Economies the World Bank does not list, such as Taiwan and the French overseas departments, have `null` in these fields.
- **EU and EEA.** Flags are stored in `sources/memberships.json`. The build compares the member list on europa.eu with that file and stops if they differ, so a membership change is always reviewed by a person.

Attribution line for the World Bank fields: *The World Bank: World Bank country and lending groups, via the World Bank API, CC BY 4.0.*
