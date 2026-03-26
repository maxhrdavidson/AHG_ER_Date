# SF vs. MF Peak Reduction Assumptions

## Summary

Per-home peak kW reduction varies by housing type. We use a blended per-tract value based on single-family (SF) vs. multi-family (MF) housing mix from Census data (ACS B25024).

| Housing Type | Typical Size | ER Baseline (kW) | Quilt Draw (kW) | Peak Reduction (kW) |
|---|---|---|---|---|
| **Single-family** | ~1,850 sqft | 15.0 | 6.0 | **9.0** |
| **Multi-family** | ~950 sqft | 9.0 | 3.6 | **5.4** |

**Reduction formula:** ER baseline × 60%, derived from Quilt COP 2.5 vs. ER COP 1.0 at Portland's ~23°F design temperature.

**Per-tract blended kW** = `(singleFamilyPct/100) × 9.0 + (1 − singleFamilyPct/100) × 5.4`

**Territory-wide weighted average:** 7.5 kW/home (59.3% SF weighted by ER homes), consistent with the number communicated to PGE.

## Design Conditions

- **Location:** Portland, OR (IECC Zone 4C)
- **ASHRAE 99.6% heating design temperature:** 23°F (Portland City Code 27.05)
- **Indoor design temperature:** 68°F
- **Design delta-T:** 45°F
- **HDD:** ~4,400–4,800

## Single-Family: 15 kW ER Baseline

**Home size:** ~1,850 sqft median for Oregon (FRED/Realtor.com, Dec 2025). Portland suburban counties (Washington, Clackamas) skew slightly larger.

**Heating load derivation:**
- Standard baseboard sizing rule: 10 W/sqft → 18.5 kW installed capacity
- ASHRAE/industry rules of thumb for Zone 4: 35–45 BTU/sqft → 18–24 kW for 1,850 sqft
- Diversity factor of ~0.8 (not all baseboards run at full capacity simultaneously) → **~15 kW diversified peak**
- Cross-check: 15 kW electric furnace (51,000 BTU) is the standard sizing recommendation for 1,400–2,000 sqft homes in moderate climates (EnergySage, AC Direct)

**15 kW is a conservative estimate.** Older, poorly insulated homes (pre-1980, common in Portland) could peak at 18–22 kW. Using the lower end avoids overstating capacity freed.

## Multi-Family: 9 kW ER Baseline

**Unit size:** ~950 sqft for a typical Portland 2BR apartment (RentCafe, ApartmentAdvisor).

**Heating load derivation:**
- MF units benefit from shared walls (15–25% less exposed surface area), so BTU/sqft is lower than SF
- 30–35 BTU/sqft for average MF → 28,500–33,250 BTU/hr → 8.4–9.7 kW
- 10 W/sqft baseboard rule → 9.5 kW
- 10 kW electric furnace (34,000 BTU) is sized for homes under 1,200 sqft (EnergySage)
- Central estimate: **9 kW**

## COP-Based Reduction (60%)

At Portland's design temperature (~23°F / ~15°F at coldest), Quilt achieves COP 2.5 vs. electric resistance COP 1.0. This means Quilt uses 40% of the electricity for the same heating output, yielding a **60% peak demand reduction** regardless of home size:

- Reduction = ER baseline × (1 − 1/COP) = ER baseline × (1 − 1/2.5) = ER baseline × 0.6
- SF: 15.0 × 0.6 = **9.0 kW**
- MF: 9.0 × 0.6 = **5.4 kW**

## Weighted Average Validation

The territory is 59.3% SF weighted by ER homes (from Census ACS data across 529 PGE Oregon tracts).

`0.593 × 9.0 + 0.407 × 5.4 = 5.34 + 2.20 = 7.5 kW`

This matches the 7.5 kW/home figure communicated to PGE.

## Per-Tract Range

- 100% SF tract: 9.0 kW/home
- 100% MF tract: 5.4 kW/home
- Typical range across 529 tracts: ~5.7–8.2 kW/home

## Key Sources

1. **Portland City Code 27.05** — 23°F winter design temperature, 4,792 HDD
2. **FRED / Realtor.com (MEDSQUFEEOR)** — Oregon median home size 1,839 sqft (Dec 2025)
3. **InspectApedia** — 45–50 BTU/sqft for IECC Zone 4
4. **The Furnace Outlet** — 30–35 BTU/sqft for Zone 4 (newer construction)
5. **EnergySage** — Electric furnace sizing: 15–20 kW typical for 1,400–2,000 sqft
6. **ACEEE (Nov 2024)** — Texas ER homes average ~9 kW peak demand (milder climate)
7. **Center for Energy & Environment (Minnesota)** — ER heating: ~9 kW peak, HP saves ~4 kW (60%+)
8. **RentCafe / ApartmentAdvisor** — Portland 2BR apartments: 919–992 sqft
9. **Angi / baseboard sizing** — 10 watts/sqft standard sizing rule

## Sensitivity Analysis

A standalone script (`scripts/sensitivity-kw-analysis.mjs`) tested three MF scenarios. The analysis confirmed that per-tract adjustment matters — territory-wide numbers shift 5–30% depending on MF assumptions, and high-MF tracts (e.g., central Portland) are most affected. The final MF=5.4 kW assumption produces a modest ~5% reduction vs. the old flat 7.0 kW, while adding credibility through per-tract specificity.

---

*Last updated: Feb 6, 2026*
