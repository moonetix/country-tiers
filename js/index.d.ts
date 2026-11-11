export type Tier = 1 | 2 | 3;

export type IncomeGroup = 'High income' | 'Upper middle income' | 'Lower middle income' | 'Low income';

export interface Country {
  /** ISO 3166-1 alpha-2. XK (Kosovo) is user-assigned, see iso_status. */
  iso2: string;
  /** ISO 3166-1 alpha-3. */
  iso3: string;
  /** ISO 3166-1 numeric, zero-padded. Null for XK. */
  numeric: string | null;
  name: string;
  common_name: string;
  iso_status: 'official' | 'user-assigned';
  tier: Tier;
  tier_basis: 'named' | 'rule';
  /** Other tiers some networks commonly use for this country. */
  alt_tiers: Tier[];
  income_group: IncomeGroup | null;
  income_code: 'HIC' | 'UMC' | 'LMC' | 'LIC' | null;
  region: string | null;
  region_code: string | null;
  eu_member: boolean;
  eu_territory: boolean;
  eea_member: boolean;
}

export interface GeoTargetOptions {
  /** Codes to drop from the result. Unknown codes throw. */
  exclude?: string[];
  /** Codes to add regardless of tier. Unknown codes throw. */
  include?: string[];
  /** Also take countries that some networks place in the requested tiers. */
  alternates?: boolean;
  /** Output code format. Countries without a numeric code are skipped for "numeric". */
  format?: 'iso2' | 'iso3' | 'numeric';
}

export declare const countries: readonly Country[];

/** Accepts alpha-2 or alpha-3 in any case, and "UK" for GB. */
export declare function lookup(code: string): Country | null;
export declare function tierOf(code: string): Tier | null;
/** Throws RangeError for anything other than 1, 2 or 3. */
export declare function countriesInTier(tier: Tier): string[];
export declare function isEU(code: string, options?: { territories?: boolean }): boolean;
export declare function isEEA(code: string): boolean;
export declare function incomeGroup(code: string): IncomeGroup | null;
export declare function geoTargets(tiers: Tier | Tier[], options?: GeoTargetOptions): string[];
