<?php

declare(strict_types=1);

namespace CountryTiers;

use InvalidArgumentException;

final class Tiers
{
    private const FORMATS = ['iso2', 'iso3', 'numeric'];

    /** @var list<array<string, mixed>>|null */
    private static ?array $rows = null;
    /** @var array<string, array<string, mixed>> */
    private static array $byIso2 = [];
    /** @var array<string, array<string, mixed>> */
    private static array $byIso3 = [];

    /** Load a different copy of countries.json, for example one you vendored. */
    public static function load(string $path): void
    {
        $rows = json_decode((string) file_get_contents($path), true, 8, JSON_THROW_ON_ERROR);
        self::$rows = $rows;
        self::$byIso2 = [];
        self::$byIso3 = [];
        foreach ($rows as $row) {
            self::$byIso2[$row['iso2']] = $row;
            self::$byIso3[$row['iso3']] = $row;
        }
    }

    /** @return list<array<string, mixed>> */
    public static function countries(): array
    {
        if (self::$rows === null) {
            self::load(__DIR__ . '/../data/countries.json');
        }
        return self::$rows;
    }

    /** Accepts alpha-2 or alpha-3 in any case, and "UK" for GB. */
    public static function lookup(mixed $code): ?array
    {
        if (!is_string($code)) {
            return null;
        }
        self::countries();
        $c = strtoupper(trim($code));
        if ($c === 'UK') {
            $c = 'GB';
        }
        return match (strlen($c)) {
            2 => self::$byIso2[$c] ?? null,
            3 => self::$byIso3[$c] ?? null,
            default => null,
        };
    }

    public static function tierOf(mixed $code): ?int
    {
        return self::lookup($code)['tier'] ?? null;
    }

    /** @return list<string> */
    public static function countriesInTier(mixed $tier): array
    {
        self::checkTier($tier);
        $out = [];
        foreach (self::countries() as $row) {
            if ($row['tier'] === $tier) {
                $out[] = $row['iso2'];
            }
        }
        return $out;
    }

    /** @param array{territories?: bool} $options */
    public static function isEU(mixed $code, array $options = []): bool
    {
        $row = self::lookup($code);
        if ($row === null) {
            return false;
        }
        return ($options['territories'] ?? false) ? $row['eu_territory'] : $row['eu_member'];
    }

    public static function isEEA(mixed $code): bool
    {
        return self::lookup($code)['eea_member'] ?? false;
    }

    public static function incomeGroup(mixed $code): ?string
    {
        return self::lookup($code)['income_group'] ?? null;
    }

    /**
     * @param int|list<int> $tiers
     * @param array{exclude?: list<string>, include?: list<string>, alternates?: bool, format?: string} $options
     * @return list<string>
     */
    public static function geoTargets(int|array $tiers, array $options = []): array
    {
        $wanted = is_array($tiers) ? array_values($tiers) : [$tiers];
        foreach ($wanted as $tier) {
            self::checkTier($tier);
        }
        $format = $options['format'] ?? 'iso2';
        if (!in_array($format, self::FORMATS, true)) {
            throw new InvalidArgumentException('format must be one of ' . implode(', ', self::FORMATS));
        }
        $excluded = self::resolveAll($options['exclude'] ?? [], 'exclude');
        $picked = array_fill_keys(self::resolveAll($options['include'] ?? [], 'include'), true);
        $alternates = $options['alternates'] ?? false;

        foreach (self::countries() as $row) {
            $inTier = in_array($row['tier'], $wanted, true)
                || ($alternates && array_intersect($row['alt_tiers'], $wanted) !== []);
            if ($inTier) {
                $picked[$row['iso2']] = true;
            }
        }
        foreach ($excluded as $code) {
            unset($picked[$code]);
        }

        $out = [];
        foreach (array_keys($picked) as $code) {
            $value = self::$byIso2[(string) $code][$format];
            if ($value !== null) {
                $out[] = $value;
            }
        }
        sort($out, SORT_STRING);
        return $out;
    }

    private static function checkTier(mixed $tier): void
    {
        if (!in_array($tier, [1, 2, 3], true)) {
            throw new InvalidArgumentException('tier must be 1, 2 or 3, got ' . json_encode($tier));
        }
    }

    /**
     * @param list<string> $codes
     * @return list<string>
     */
    private static function resolveAll(array $codes, string $label): array
    {
        $out = [];
        foreach ($codes as $code) {
            $row = self::lookup($code);
            if ($row === null) {
                throw new InvalidArgumentException("unknown country code in $label: " . json_encode($code));
            }
            $out[] = $row['iso2'];
        }
        return $out;
    }
}
