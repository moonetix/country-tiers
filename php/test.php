<?php

declare(strict_types=1);

require __DIR__ . '/CountryTiers.php';

use CountryTiers\Tiers;

$vectors = json_decode((string) file_get_contents(__DIR__ . '/../test/vectors.json'), true, 16, JSON_THROW_ON_ERROR);
$passed = 0;
$failed = 0;

foreach ($vectors['cases'] as $case) {
    $label = $case['fn'] . '(' . implode(', ', array_map(fn ($a) => json_encode($a), $case['args'])) . ')';
    try {
        $got = Tiers::{$case['fn']}(...$case['args']);
        $ok = !isset($case['error']) && $got === $case['expect'];
        $detail = isset($case['error']) ? 'expected an exception' : 'got ' . json_encode($got);
    } catch (InvalidArgumentException $e) {
        $ok = isset($case['error']);
        $detail = $e->getMessage();
    }
    if ($ok) {
        $passed++;
    } else {
        $failed++;
        echo "FAIL  $label: $detail\n";
    }
}

$first = Tiers::countriesInTier(1);
$first[] = 'ZZ';
if (in_array('ZZ', Tiers::countriesInTier(1), true)) {
    $failed++;
    echo "FAIL  countriesInTier returns shared state\n";
} else {
    $passed++;
}

echo "$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);
