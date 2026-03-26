/**
 * Sensitivity Analysis: Per-Tract kW/Home Adjustment
 *
 * Tests whether adjusting kW peak reduction per home based on SF/MF housing
 * mix meaningfully changes territory-wide capacity numbers vs. the flat 7.0 kW.
 *
 * Assumptions:
 *   SF ER baseline: 12.5 kW, Quilt draw: 5.0 kW → reduction = 7.5 kW/home
 *   MF ER baselines tested: 6, 7.5, 9 kW → reductions = 1.0, 2.5, 4.0 kW/home
 *   Per-tract blended kW = sfPct × 7.5 + (1 - sfPct) × mfReduction
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const geojsonPath = join(__dirname, '..', 'public', 'data', 'pge-oregon', 'tracts.geojson');

const data = JSON.parse(readFileSync(geojsonPath, 'utf8'));
const tracts = data.features.map(f => f.properties);

// --- Constants ---
const FLAT_KW = 7.0;
const SF_REDUCTION = 7.5; // 12.5 - 5.0
const MF_SCENARIOS = [
  { label: 'Low MF (6 kW baseline)',  mfBaseline: 6.0, mfReduction: 1.0 },
  { label: 'Mid MF (7.5 kW baseline)', mfBaseline: 7.5, mfReduction: 2.5 },
  { label: 'High MF (9 kW baseline)',  mfBaseline: 9.0, mfReduction: 4.0 },
];

// --- Helpers ---
function fmt(n) { return n.toLocaleString('en-US', { maximumFractionDigits: 1 }); }
function pct(a, b) { return ((a - b) / b * 100).toFixed(1); }
function pad(s, w) { return String(s).padStart(w); }
function padR(s, w) { return String(s).padEnd(w); }

function blendedKW(sfPct, mfReduction) {
  const sf = sfPct / 100;
  return sf * SF_REDUCTION + (1 - sf) * mfReduction;
}

// --- Territory-wide analysis ---
console.log('='.repeat(80));
console.log('SENSITIVITY ANALYSIS: Per-Tract kW/Home Adjustment');
console.log('='.repeat(80));
console.log(`\nTracts: ${tracts.length}`);

const totalERHomes = tracts.reduce((s, t) => s + t.estimatedERHomes, 0);
const flatTotalKW = tracts.reduce((s, t) => s + t.estimatedERHomes * FLAT_KW, 0);
const flatTotalMW = flatTotalKW / 1000;

console.log(`Total ER homes: ${fmt(totalERHomes)}`);
console.log(`Flat ${FLAT_KW} kW → ${fmt(flatTotalMW)} MW freed\n`);

// Weighted avg SF pct (weighted by ER homes)
const weightedSFPct = tracts.reduce((s, t) => s + t.singleFamilyPct * t.estimatedERHomes, 0) / totalERHomes;
console.log(`Weighted avg SF% (by ER homes): ${weightedSFPct.toFixed(1)}%\n`);

// --- Scenario comparison ---
console.log('-'.repeat(80));
console.log(padR('Scenario', 30), pad('Total MW', 10), pad('vs Flat', 10), pad('% Diff', 10));
console.log('-'.repeat(80));
console.log(padR(`Flat ${FLAT_KW} kW`, 30), pad(fmt(flatTotalMW), 10), pad('—', 10), pad('—', 10));

const scenarioResults = MF_SCENARIOS.map(scenario => {
  const totalKW = tracts.reduce((s, t) => {
    const bkw = blendedKW(t.singleFamilyPct, scenario.mfReduction);
    return s + t.estimatedERHomes * bkw;
  }, 0);
  const totalMW = totalKW / 1000;
  const diff = totalMW - flatTotalMW;
  const pctDiff = pct(totalMW, flatTotalMW);

  console.log(
    padR(scenario.label, 30),
    pad(fmt(totalMW), 10),
    pad((diff >= 0 ? '+' : '') + fmt(diff), 10),
    pad(pctDiff + '%', 10)
  );

  return { ...scenario, totalMW, diff, pctDiff };
});

// --- Per-tract kW distribution ---
console.log('\n' + '='.repeat(80));
console.log('PER-TRACT BLENDED kW DISTRIBUTION (Mid MF scenario: 2.5 kW MF reduction)');
console.log('='.repeat(80));

const midScenario = MF_SCENARIOS[1]; // 2.5 kW MF reduction
const tractDetails = tracts.map(t => {
  const bkw = blendedKW(t.singleFamilyPct, midScenario.mfReduction);
  const flatCapKW = t.estimatedERHomes * FLAT_KW;
  const adjCapKW = t.estimatedERHomes * bkw;
  return {
    name: t.NAME,
    county: t.county,
    geoid: t.GEOID,
    erHomes: t.estimatedERHomes,
    sfPct: t.singleFamilyPct,
    blendedKW: bkw,
    flatCapKW,
    adjCapKW,
    diffKW: adjCapKW - flatCapKW,
  };
});

// kW distribution
const kws = tractDetails.map(t => t.blendedKW).sort((a, b) => a - b);
const p10 = kws[Math.floor(kws.length * 0.1)];
const p25 = kws[Math.floor(kws.length * 0.25)];
const p50 = kws[Math.floor(kws.length * 0.5)];
const p75 = kws[Math.floor(kws.length * 0.75)];
const p90 = kws[Math.floor(kws.length * 0.9)];

console.log(`\n  Min:  ${fmt(kws[0])} kW`);
console.log(`  P10:  ${fmt(p10)} kW`);
console.log(`  P25:  ${fmt(p25)} kW`);
console.log(`  P50:  ${fmt(p50)} kW  (median)`);
console.log(`  P75:  ${fmt(p75)} kW`);
console.log(`  P90:  ${fmt(p90)} kW`);
console.log(`  Max:  ${fmt(kws[kws.length - 1])} kW`);

// --- County breakdown ---
console.log('\n' + '='.repeat(80));
console.log('COUNTY BREAKDOWN (Mid MF scenario)');
console.log('='.repeat(80));

const counties = {};
for (const t of tractDetails) {
  if (!counties[t.county]) counties[t.county] = { tracts: 0, erHomes: 0, flatKW: 0, adjKW: 0, sfPctSum: 0 };
  const c = counties[t.county];
  c.tracts++;
  c.erHomes += t.erHomes;
  c.flatKW += t.flatCapKW;
  c.adjKW += t.adjCapKW;
  c.sfPctSum += t.sfPct * t.erHomes; // for weighted avg
}

console.log('\n' + padR('County', 14), pad('Tracts', 7), pad('ER Homes', 9), pad('Wtd SF%', 8),
  pad('Flat MW', 9), pad('Adj MW', 9), pad('Diff MW', 9), pad('% Diff', 8));
console.log('-'.repeat(80));

const sortedCounties = Object.entries(counties).sort((a, b) => b[1].erHomes - a[1].erHomes);
for (const [name, c] of sortedCounties) {
  const wtdSF = c.erHomes > 0 ? (c.sfPctSum / c.erHomes).toFixed(1) : '0';
  const flatMW = c.flatKW / 1000;
  const adjMW = c.adjKW / 1000;
  const diff = adjMW - flatMW;
  const pctD = flatMW > 0 ? pct(adjMW, flatMW) : '0';
  console.log(padR(name, 14), pad(c.tracts, 7), pad(fmt(c.erHomes), 9), pad(wtdSF + '%', 8),
    pad(fmt(flatMW), 9), pad(fmt(adjMW), 9), pad((diff >= 0 ? '+' : '') + fmt(diff), 9), pad(pctD + '%', 8));
}

// --- Top 10 tracts with largest overstatement (flat > adjusted) ---
console.log('\n' + '='.repeat(80));
console.log('TOP 10 TRACTS: Largest Overstatement by Flat 7 kW (Mid MF scenario)');
console.log('These are high-MF tracts where flat 7 kW most overstates capacity.');
console.log('='.repeat(80));

const overstatements = tractDetails
  .filter(t => t.erHomes > 0)
  .sort((a, b) => a.diffKW - b.diffKW) // most negative first = biggest overstatement
  .slice(0, 10);

console.log('\n' + padR('Tract (County)', 48), pad('ER Homes', 9), pad('SF%', 6),
  pad('Blend kW', 9), pad('Flat kW', 9), pad('Adj kW', 9), pad('Over kW', 9));
console.log('-'.repeat(100));

for (const t of overstatements) {
  const shortName = t.name.replace('Census Tract ', 'CT ').replace('; Oregon', '');
  console.log(
    padR(shortName, 48),
    pad(fmt(t.erHomes), 9),
    pad(t.sfPct.toFixed(0) + '%', 6),
    pad(t.blendedKW.toFixed(1), 9),
    pad(fmt(t.flatCapKW), 9),
    pad(fmt(t.adjCapKW), 9),
    pad(fmt(t.diffKW), 9)
  );
}

// --- Bottom line ---
console.log('\n' + '='.repeat(80));
console.log('BOTTOM LINE');
console.log('='.repeat(80));

const midResult = scenarioResults[1];
const lowResult = scenarioResults[0];
const highResult = scenarioResults[2];

console.log(`
Territory-wide impact of adjusting for SF/MF housing mix:

  Scenario range: ${lowResult.pctDiff}% to ${highResult.pctDiff}% vs flat 7 kW
  Mid scenario:   ${midResult.pctDiff}% (${(midResult.diff >= 0 ? '+' : '') + fmt(midResult.diff)} MW)

  Weighted avg SF%:  ${weightedSFPct.toFixed(1)}%
  Weighted avg kW (mid): ${(weightedSFPct/100 * SF_REDUCTION + (1 - weightedSFPct/100) * midScenario.mfReduction).toFixed(2)} kW vs flat ${FLAT_KW} kW

Key question: Is a ${Math.abs(parseFloat(midResult.pctDiff))}% territory-wide difference
material enough to justify per-tract adjustment in the PGE story?
`);
