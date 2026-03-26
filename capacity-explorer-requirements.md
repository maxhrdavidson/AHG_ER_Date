# Quilt Capacity Explorer — Product Requirements Document

*Version 1.0 · February 2026*

---

## Product Vision

The Capacity Explorer is an interactive web application that Quilt uses in meetings with utilities and hyperscalers to demonstrate the addressable market for heat pump deployment in a specific utility territory. It replaces static pitch deck slides with a live, data-driven tool that lets the audience explore their own territory — seeing exactly where electric resistance homes are concentrated, how large the opportunity is, and what a pilot program would deliver in terms of peak capacity freed, homeowner savings, and community benefits.

The tool should feel like a professional utility planning application — the kind of thing PGE's own resource planning team would use — not a startup demo. It needs to be visually polished, fast, and substantive enough that a utility executive leaves the meeting thinking "I've never seen a vendor show me my own territory like that."

### Why This Matters

Today, Quilt presents the opportunity to utilities using slide decks with static numbers. When someone asks "what about the Beaverton area?" or "what if we only did 500 homes?", there's no way to answer in real time. This tool solves that by making the data explorable during the conversation. It also signals to utilities and hyperscalers that Quilt is a sophisticated, tech-forward partner — not just another HVAC company.

### Target Users

1. **Utility executives** (resource planning, customer programs, regulatory affairs) — in live meeting presentations led by Quilt
2. **Hyperscaler energy teams** (Google, Meta, Amazon) — to show the opportunity in territories where they have or plan data centers
3. **Quilt team** (Bill, Ad Hoc Group) — as a preparation and analysis tool before meetings

### First Use: Portland General Electric

The first territory to be fully built out should be PGE's service territory in Oregon. PGE meeting is targeted for the week of February 11, 2026. The tool must be functional and impressive for this meeting, even if some features are still being refined.

---

## Product Goals

1. **Show the addressable market geographically.** A utility executive should be able to see, on a map, exactly where electric resistance heating is concentrated in their territory — at the census tract level. This is something most utilities cannot easily see in their own systems.

2. **Size the opportunity.** For any selected area (county, collection of tracts, or full territory), dynamically calculate: total households, estimated electric resistance homes, potential peak MW freed, potential annual energy savings, and estimated homeowner bill savings.

3. **Model pilot program economics.** Let the user adjust pilot size and see how program costs, capacity freed, cost per kW, and community benefits change. Include comparisons to alternative capacity sources.

4. **Answer questions conversationally.** An AI chat panel lets the audience ask natural language questions about the territory data, program economics, or Quilt technology — grounded in the actual data loaded into the tool.

5. **Work for multiple territories.** While PGE is the first build, the architecture should make it straightforward to add new territories (Entergy/Arkansas, Dominion/Virginia, Duke/North Carolina, etc.) by loading new data files without code changes.

---

## Application Architecture

### Technology Stack

- **Frontend framework:** React (with TypeScript preferred)
- **Map library:** Mapbox GL JS or Leaflet with Mapbox tiles (Mapbox preferred for visual polish and performance with GeoJSON layers)
- **Charting:** Recharts or D3.js
- **AI chat:** Anthropic Claude API (claude-sonnet-4-20250514) — called from a lightweight backend or serverless function
- **Styling:** Tailwind CSS
- **Data storage:** Static JSON files per territory (no database needed for MVP)
- **Deployment:** Vercel, Netlify, or similar static hosting with serverless API route for Claude calls

### Application Structure

```
capacity-explorer/
├── public/
│   └── data/
│       ├── territories/
│       │   ├── pge-oregon/
│       │   │   ├── tracts.geojson          # Census tract boundaries with heating data
│       │   │   ├── demographics.json        # Tract-level ACS data
│       │   │   ├── territory-config.json    # Territory metadata, rates, climate
│       │   │   └── landmarks.json           # Data centers, substations, POIs
│       │   └── entergy-arkansas/            # Future territory (same structure)
│       └── reference/
│           └── quilt-specs.json             # Quilt product specifications
├── src/
│   ├── components/
│   │   ├── Map/                             # Territory map with layers
│   │   ├── MarketSizing/                    # Dynamic market sizing panel
│   │   ├── ProgramSimulator/                # Pilot economics simulator
│   │   ├── Chat/                            # AI chat panel
│   │   ├── TerritorySelector/               # Territory dropdown/switcher
│   │   └── Layout/                          # App shell, navigation
│   ├── hooks/                               # Data loading, calculations
│   ├── utils/                               # Calculation engines
│   └── context/                             # Territory data context
├── api/                                     # Serverless function for Claude API
└── scripts/
    └── data-prep/                           # Scripts to pull and process Census data
```

---

## Data Requirements

### Primary Data: Census ACS (American Community Survey)

All data should be pulled at the **census tract** level for the target territory. Use the most recent ACS 5-Year Estimates available (2019-2023 or 2020-2024 depending on release timing). Data is free via the Census Bureau API (api.census.gov — requires a free API key).

**Required ACS Tables:**

| Table | Name | What It Provides | Key Variables |
|-------|------|------------------|---------------|
| B25040 | House Heating Fuel | Number of homes by heating fuel type per tract | Electricity, utility gas, bottled gas, fuel oil, coal, wood, solar, other, no fuel |
| B25034 | Year Structure Built | Housing age distribution per tract | Pre-1940 through 2020+ in bands |
| B25003 | Tenure | Owner-occupied vs renter-occupied per tract | Owner count, renter count |
| B19013 | Median Household Income | Income per tract | Median income (dollars) |
| B25024 | Units in Structure | Building type distribution per tract | 1-unit detached, 1-unit attached, 2-unit, 3-4 unit, 5-9, 10-19, 20-49, 50+, mobile home |
| B25001 | Housing Units | Total housing unit count per tract | Total units |
| B25002 | Occupancy Status | Occupied vs vacant per tract | Occupied, vacant |

**Important note on B25040 (Heating Fuel):** This table tells us how many homes in each tract use "electricity" as their primary heating fuel. It does NOT distinguish between electric resistance and heat pumps. However, in areas with low existing heat pump penetration (which is most of Oregon outside of newer construction), the vast majority of electric-heated homes are using resistance heating. The tool should acknowledge this assumption and allow for a configurable adjustment factor (e.g., "estimated 85% of electric-heated homes use resistance heating" — adjustable per territory based on regional RECS data or utility knowledge).

**Geographic Boundaries:**

Census tract boundary files (TIGER/Line shapefiles, available as GeoJSON from Census Bureau) for all tracts within the target territory. For PGE, this means tracts within the following Oregon counties that overlap PGE's service territory:

- Washington County (primary — includes Hillsboro, Beaverton)
- Multnomah County (Portland metro)
- Clackamas County (south Portland metro)
- Marion County (Salem area)
- Yamhill County
- Polk County
- Columbia County (partial)

Note: Census tract boundaries do not perfectly align with utility service territory boundaries. For the MVP, use county-level inclusion (all tracts in the counties listed above). A future enhancement could clip tracts to the actual PGE service territory boundary if obtainable.

### Secondary Data: Energy & Climate

**EIA Utility Data (Form 861):**

| Data Point | Source | Use |
|------------|--------|-----|
| Average residential electricity rate | EIA Form 861 or state PUC | Calculate homeowner savings |
| Total residential customers | EIA Form 861 | Validate market size |
| Utility peak demand | EIA Form 861 or utility IRP | Context for capacity impact |

For PGE specifically: average residential rate is approximately $0.125/kWh (verify from latest EIA data or PGE rate schedule). PGE reports approximately 900,000 residential customers.

**Climate Data:**

| Data Point | Source | Use |
|------------|--------|-----|
| Heating Degree Days (annual) | NOAA Climate Normals or ENERGY STAR County Guide | Validate heating demand |
| ASHRAE design day temperature | ASHRAE Fundamentals or ENERGY STAR County Guide | Peak load calculations |
| Average winter low temperature | NOAA Climate Normals | Quilt COP estimation |

For Portland/Hillsboro area: approximately 4,400 HDD (base 65°F), ASHRAE 99% design temperature approximately 23°F.

### Reference Data: Quilt Product Specifications

These values should be stored in a reference JSON file and used throughout the calculations:

```json
{
  "quilt_specs": {
    "max_draw_kw": 5.4,
    "typical_er_draw_kw": 12.5,
    "peak_reduction_per_home_kw": 7.5,
    "cop_at_17f": 2.5,
    "cop_at_47f": 4.0,
    "hspf2": 12,
    "seer2": 25,
    "min_operating_temp_f": -15,
    "backup_resistance": false,
    "demand_response_capable": true
  },
  "program_economics": {
    "list_price_4zone_package": 7193,
    "avg_packages_per_home": 1,
    "base_gross_margin": 0.30,
    "hyperscaler_discount": 0.10,
    "installation_cost_per_home": 5000,
    "customer_acquisition_cost_per_home": 2000,
    "total_program_cost_per_home": 18000,
    "warranty_cost_per_2zone": 108,
    "cloud_cost_per_2zone": 30
  },
  "comparison_benchmarks": {
    "gas_peaker_capex_per_kw": 1200,
    "gas_peaker_build_time_years": "4-7",
    "battery_storage_capex_per_kw": 1500,
    "new_transmission_capex_per_kw": 3000,
    "new_transmission_build_time_years": "7-10",
    "quilt_capex_per_kw": "2500-3000",
    "quilt_deployment_time_months": "12-24"
  },
  "savings_assumptions": {
    "typical_home_sqft": 1700,
    "er_annual_heating_kwh": 12500,
    "quilt_annual_heating_kwh": 3580,
    "quilt_with_autoaway_annual_kwh": 2004,
    "annual_savings_vs_er_dollars": 1000,
    "rebound_effect_percent": 0.12
  }
}
```

### Data for Map Landmarks

For each territory, include a landmarks JSON file with notable locations to plot on the map:

**PGE territory landmarks:**
- Meta/QTS Hillsboro data center campus (Hillsboro, OR)
- Other known data center locations in PGE territory
- PGE headquarters (Portland)
- Major substations (if publicly available)

These help tell the visual story of proximity between data centers and residential opportunity.

---

## Feature Specifications

### Feature 1: Territory Map View

**Purpose:** Show geographic distribution of electric resistance heating concentration across census tracts.

**Requirements:**

The map should fill most of the screen (roughly 60-70% width on desktop) with a side panel for controls and summary stats. On initial load it should be centered on the selected territory with all tracts visible.

Census tracts should be rendered as a choropleth layer where the fill color represents the concentration of electric-heated homes. The default coloring metric should be "% of occupied homes using electricity as primary heating fuel" calculated from B25040 data. Use a sequential color scale (e.g., light yellow to dark red/orange) with a legend. Tracts with higher electric heating concentration should be visually prominent.

The user should be able to toggle the choropleth coloring between several metrics:
- % homes using electric heat (default)
- Absolute number of electric-heated homes
- % homes built before 1980
- Median household income
- % owner-occupied homes

Each tract should be hoverable/clickable to show a tooltip or detail panel with that tract's key stats: tract ID, total households, electric-heated homes (count and %), median income, homeownership rate, % pre-1980 housing, and estimated peak capacity (electric homes × 7.5 kW).

Landmark pins should be plotted on the map for data center locations, with a distinctive icon and popup on click showing the name and any relevant details (e.g., "Meta/QTS Hillsboro — 250 MW committed load").

The map should support standard interactions: zoom, pan, and clicking tracts to select them. Selected tracts should be visually highlighted (e.g., with a border or different opacity) and their data should feed into the Market Sizing Panel.

**Map Layer Toggle Controls:**
- Choropleth metric selector (dropdown)
- Show/hide data center landmarks
- Show/hide county boundaries
- Opacity slider for the choropleth layer

### Feature 2: Market Sizing Panel

**Purpose:** Dynamically calculate and display market opportunity metrics for the selected geographic scope.

**Requirements:**

The Market Sizing Panel should appear as a sidebar or panel alongside the map. It should update in real time as the user's geographic selection changes.

The panel should support three selection scopes:
1. **Full territory** (all loaded tracts — default on initial load)
2. **County filter** (select one or more counties from a dropdown)
3. **Custom tract selection** (click tracts on the map to add/remove from selection)

For the selected scope, calculate and display:

**Market Summary (always visible):**
- Total households in selection
- Estimated electric-heated homes (with adjustable "electric resistance %" assumption — default 85%, meaning 85% of ACS electric-heated homes are assumed to be resistance rather than existing heat pumps)
- Estimated addressable homes for Quilt (electric resistance homes × additional filter for single-family/owner-occupied if desired)

**Capacity Impact:**
- Peak capacity currently consumed: addressable homes × 12.5 kW (typical ER draw)
- Peak capacity after Quilt conversion: addressable homes × 5.4 kW (Quilt max draw)
- **Net peak capacity freed:** addressable homes × 7.5 kW — displayed prominently in MW
- Equivalent homes powered (contextual stat — freed MW ÷ average home peak draw)

**Homeowner Impact:**
- Estimated annual energy savings per home: calculated from territory electricity rate and kWh reduction (12,500 kWh ER → 3,580 kWh Quilt = 8,920 kWh saved × local rate)
- Total annual homeowner savings across all addressable homes
- Average monthly bill reduction per home

**Demographic Snapshot (for selected area):**
- Median household income (average across selected tracts, weighted by household count)
- % owner-occupied
- % pre-1980 housing
- These help tell the equity/community benefit story

All calculated numbers should use clear formatting (commas, appropriate units, MW/kW as appropriate). Large numbers should be the visual focal point of the panel.

### Feature 3: Program Simulator

**Purpose:** Model the economics of a pilot program at various scales, with interactive controls.

**Requirements:**

The Program Simulator should be accessible as a tab or view within the side panel, or as a dedicated panel below the map. It models a hypothetical pilot program within the currently selected geography.

**Input Controls (sliders or number inputs with reasonable ranges):**

| Parameter | Default | Range | Step |
|-----------|---------|-------|------|
| Pilot size (homes) | 500 | 100 – 5,000 | 50 |
| Cost per home (fully loaded) | $18,000 | $12,000 – $25,000 | $500 |
| Electricity rate ($/kWh) | Territory default | $0.05 – $0.30 | $0.005 |
| Avoided capacity cost ($/kW-year) | $85 | $30 – $200 | $5 |
| Program duration (months) | 18 | 6 – 36 | 3 |

**Output Metrics (update dynamically with slider changes):**

Program Investment:
- Total program investment (homes × cost per home)
- Quilt equipment revenue (homes × $6,474 discounted price)
- Quilt gross profit (homes × $1,439)

Capacity Impact:
- Total peak capacity freed (homes × 7.5 kW, displayed in MW)
- Effective cost per kW of freed capacity (total investment ÷ total kW freed)
- Annual avoided capacity value (freed kW × avoided capacity cost)
- Simple payback period (total investment ÷ annual avoided capacity value)

Community Impact:
- Total annual homeowner savings (homes × annual savings per home)
- Estimated CO2 reduction (based on regional grid emissions factor × kWh saved)
- Number of households receiving free HVAC upgrade

**Comparison Chart:**

A bar or grouped chart comparing cost per kW of capacity across alternatives:
- Quilt program (calculated from inputs)
- Gas peaker plant ($1,200/kW, 4-7 year build)
- Battery storage ($1,500/kW)
- New transmission ($3,000/kW, 7-10 year build)

The chart should visually emphasize that Quilt is competitive on cost AND dramatically faster to deploy. Consider a secondary axis or annotation showing deployment timeline for each option.

### Feature 4: AI Chat Panel

**Purpose:** Let users ask natural language questions about the territory data, program economics, or Quilt technology during a live presentation.

**Requirements:**

The chat panel should be a collapsible/expandable side panel or bottom drawer. It should be visually clean — not dominant, but accessible. It should feel like talking to a knowledgeable analyst who has the territory data in front of them.

**System Prompt Context:**

The AI assistant should be given (via system prompt) the following context on each call:
- The currently loaded territory data summary (total tracts, total households, total electric-heated homes, key territory stats)
- The currently selected geographic scope and its calculated metrics
- The current Program Simulator parameter values and outputs
- The full Quilt product specification reference data
- The comparison benchmarks for alternative capacity sources
- Context about Quilt's business model (hyperscaler-funded, $0 homeowner cost, utility provides capacity credits)

**System Prompt Persona:**

The AI should respond as a knowledgeable energy analyst who works at Quilt. It should be conversational but substantive, grounding answers in the actual data wherever possible. It should cite specific numbers from the loaded territory data (e.g., "Washington County has approximately 12,400 electric-heated homes" rather than vague statements). It should NOT make claims about Quilt products that go beyond the reference specs. When asked questions it cannot answer from the loaded data, it should say so clearly.

**Example Queries the Chat Should Handle Well:**

Territory analysis:
- "Which county has the highest concentration of electric resistance homes?"
- "How many homes in Washington County were built before 1980?"
- "What's the median income in the tracts with the most electric heating?"

Program economics:
- "What would a 1,000-home pilot look like in terms of total investment?"
- "How does the cost per kW compare if we use a $100/kW-year avoided cost?"
- "What's the payback period at 500 homes vs 1,000 homes?"

Quilt technology:
- "How does Quilt perform below 20°F?"
- "Why is the peak reduction 7.5 kW and not higher?"
- "What happens during a demand response event?"

Comparisons:
- "How does this compare to PGE building a new gas peaker?"
- "What's the CO2 impact of this program?"

**Implementation Notes:**

- Use the Anthropic Messages API with claude-sonnet-4-20250514
- Send the full context (territory data summary + current state) with each message
- Maintain conversation history within the session
- Keep responses concise — 2-4 paragraphs max, since this is used during live presentations
- Include an option to clear conversation history

### Feature 5: Territory Selector

**Purpose:** Switch between pre-loaded territories without reloading the app.

**Requirements:**

A dropdown or selection control (likely in the top navigation bar) that lists all available territories. Selecting a new territory loads that territory's data files, recenters the map, and resets the Market Sizing and Program Simulator panels.

For MVP, include:
- Portland General Electric (Oregon) — fully built out
- A "Coming Soon" or placeholder entry for 1-2 future territories to signal scalability

The territory config file should contain:
```json
{
  "territory_id": "pge-oregon",
  "display_name": "Portland General Electric",
  "utility_name": "Portland General Electric",
  "state": "OR",
  "default_electricity_rate": 0.125,
  "default_er_adjustment_factor": 0.85,
  "map_center": [-122.77, 45.52],
  "map_zoom": 9,
  "counties": ["Washington", "Multnomah", "Clackamas", "Marion", "Yamhill", "Polk", "Columbia"],
  "hdd_annual": 4400,
  "ashrae_design_temp_f": 23,
  "co2_grid_factor_lbs_per_kwh": 0.64,
  "notes": "Hillsboro area is primary focus — Meta/QTS data center campus"
}
```

---

## UI/UX Design Direction

### Overall Aesthetic

The application should look like a professional enterprise planning tool, not a consumer app or startup demo. Think Bloomberg Terminal meets utility resource planning software, but cleaner and more modern. Dark-on-light color scheme with Quilt's brand colors as accents where appropriate.

Key design principles:
- **Data density:** Show meaningful information without clutter. Every pixel should earn its space.
- **Visual hierarchy:** The map and key numbers (MW freed, homes addressable) should be the immediate visual focal point. Controls and secondary data should be accessible but not competing for attention.
- **Professional typography:** Clean sans-serif. Numbers should be large and well-formatted. Use consistent decimal places and units.
- **Responsive but desktop-first:** This will primarily be used on a laptop connected to a conference room display. Optimize for 1920×1080 and above. Tablet support is a nice-to-have but not critical for MVP.

### Layout

The primary layout should be a two-panel design:

**Left panel (~65% width): Map View**
- Full territory map with choropleth
- Map controls (layer toggles, zoom) in a floating control panel overlay
- Legend for current choropleth metric

**Right panel (~35% width): Analysis Panel**
- Tabbed interface with three tabs: "Market Size", "Program Simulator", "AI Assistant"
- The Market Size tab is the default view
- Each tab's content scrolls independently
- Key summary stats (total addressable homes, MW freed) should be visible as a persistent header above the tabs so they're always on screen regardless of which tab is active

**Top bar:**
- Quilt logo (small)
- Territory selector dropdown
- Current territory name displayed prominently
- Perhaps a "Presentation Mode" toggle that hides non-essential UI chrome

### Color Palette

- Map choropleth: sequential scale from light cream/yellow (#FFF8E1) through warm orange (#FF9800) to deep red (#D32F2F)
- Selected tracts: blue border (#1565C0) with slight fill opacity
- Data center pins: distinctive teal or brand color
- UI chrome: white/light gray backgrounds, dark gray text
- Accent color: Quilt brand orange/coral for CTAs and key numbers
- Chart colors: muted professional palette (blues, grays, with one accent color for Quilt data)

---

## Data Preparation Scripts

The project should include scripts (Python preferred) in a `scripts/data-prep/` directory that automate pulling and processing the Census data for any territory. This is critical for being able to quickly add new territories.

### Script 1: `pull_census_data.py`

**Purpose:** Pull ACS data from Census API for a specified set of counties and output a processed JSON file.

**Inputs:** State FIPS code, list of county FIPS codes, Census API key (via environment variable).

**Process:**
1. Query Census API for tables B25040, B25034, B25003, B19013, B25024, B25001, B25002 at the tract level for specified counties
2. For each tract, compute derived fields:
   - `pct_electric_heat`: (B25040 electricity count) / (B25040 total occupied) × 100
   - `estimated_er_homes`: B25040 electricity count × adjustment factor (default 0.85)
   - `pct_pre1980`: sum of pre-1980 vintage categories from B25034 / total
   - `pct_owner_occupied`: B25003 owner count / B25003 total
   - `pct_single_family`: (B25024 1-unit detached + 1-unit attached) / B25024 total
3. Output as `demographics.json` keyed by tract GEOID

### Script 2: `pull_tract_boundaries.py`

**Purpose:** Download TIGER/Line tract boundaries for specified counties and output as GeoJSON.

**Inputs:** State FIPS code, list of county FIPS codes.

**Process:**
1. Download tract shapefiles from Census TIGER/Line (or use the TIGERweb API)
2. Filter to specified counties
3. Simplify geometries (topojson simplification) to reduce file size for web rendering
4. Merge demographic data from Script 1 into GeoJSON properties
5. Output as `tracts.geojson`

The resulting GeoJSON should have each tract as a Feature with properties including all the demographic fields plus the tract's GEOID, county name, and state.

### Script 3: `build_territory.py`

**Purpose:** Orchestrate the full data build for a territory.

**Inputs:** A territory config file specifying state, counties, utility metadata, landmarks, etc.

**Process:**
1. Run `pull_census_data.py` for the specified geography
2. Run `pull_tract_boundaries.py` for the specified geography
3. Generate `territory-config.json` from the input config
4. Copy/generate `landmarks.json`
5. Output everything to the correct directory structure under `public/data/territories/{territory_id}/`

---

## Calculation Engine

All calculations should be implemented as pure functions in a `utils/calculations.ts` file (or similar) so they can be unit tested and reused by both the UI components and the AI chat context builder.

### Key Calculations

**Addressable Homes:**
```
addressable_homes = electric_heated_homes × er_adjustment_factor × (optional: owner_occupied_filter) × (optional: single_family_filter)
```

**Peak Capacity Freed:**
```
peak_capacity_freed_kw = addressable_homes × peak_reduction_per_home_kw  (7.5)
peak_capacity_freed_mw = peak_capacity_freed_kw / 1000
```

**Annual Energy Savings Per Home:**
```
kwh_saved = er_annual_heating_kwh - quilt_annual_heating_kwh  (12,500 - 3,580 = 8,920)
annual_savings_dollars = kwh_saved × electricity_rate
```

**Program Economics:**
```
total_investment = pilot_homes × cost_per_home
quilt_revenue = pilot_homes × list_price × (1 - hyperscaler_discount)
quilt_gross_profit = quilt_revenue - (pilot_homes × list_price × (1 - base_gross_margin))
cost_per_kw = total_investment / (pilot_homes × peak_reduction_per_home_kw)
annual_avoided_capacity_value = (pilot_homes × peak_reduction_per_home_kw) × avoided_capacity_cost
simple_payback_years = total_investment / annual_avoided_capacity_value
```

**CO2 Reduction:**
```
annual_kwh_saved = pilot_homes × kwh_saved_per_home
annual_co2_lbs = annual_kwh_saved × co2_grid_factor_lbs_per_kwh
annual_co2_tons = annual_co2_lbs / 2000
```

---

## Data Assumptions & Caveats

The tool should include an accessible "Methodology & Assumptions" section (perhaps a modal or collapsible section) that documents key assumptions. This is important for credibility with utility planning teams. Key caveats to document:

1. **Electric heat ≠ electric resistance:** ACS B25040 reports "electricity" as heating fuel but does not distinguish resistance from heat pumps. The tool applies an adjustable factor (default 85%) to estimate the resistance-only portion. This factor should be calibrated per territory based on regional heat pump penetration data from EIA RECS.

2. **Census tract ≠ utility territory:** Tract boundaries do not align perfectly with utility service territories. The tool uses county-level inclusion as a proxy. Some tracts at the edges may fall outside the actual service territory.

3. **Peak reduction is based on design day conditions:** The 7.5 kW per home figure assumes a typical 1,700 sq ft home on the coldest design day, where ER draws ~12.5 kW and Quilt draws ~5.0 kW. Actual reduction varies by home size, insulation, and weather.

4. **Savings estimates use territory-average electricity rates:** Actual savings depend on the customer's specific rate plan, usage tier, and time-of-use structure.

5. **Program cost estimates are based on Quilt's current business case modeling** and include equipment, installation, and customer acquisition costs. Actual costs may vary based on local labor markets, permitting, and program design.

---

## MVP Scope vs. Future Enhancements

### MVP (Target: Week of Feb 11, 2026)

- PGE territory fully loaded with Census ACS data
- Interactive choropleth map with hoverable/clickable tracts
- Layer toggle for 3+ metrics (electric heat %, housing age, income)
- Market Sizing Panel with dynamic calculations
- Program Simulator with sliders and comparison chart
- AI Chat Panel connected to Claude API with territory context
- Data center landmark pins (Meta/QTS Hillsboro)
- Clean, professional UI
- Methodology/assumptions documentation

### Near-term Enhancements (Post-MVP)

- Second territory loaded (Entergy/Arkansas — West Memphis area)
- Tract multi-select by drawing a boundary on the map
- Export functionality (PDF report of current view/analysis)
- Winter peak load curve visualization (showing ER profile vs Quilt profile)
- Presentation mode (full-screen map, floating key stats, minimal chrome)
- Shareable URLs (encode territory + selection + parameters in URL for follow-up)

### Future Vision

- Self-service territory builder (upload utility territory boundary, auto-pull Census data)
- Integration with EIA 861 data for automatic rate lookups
- Integration with NOAA data for automatic climate calibration
- Side-by-side territory comparison view
- Scenario saving and comparison ("Save this scenario as PGE Option A")
- Admin panel for managing territories and user access
- Real-time data from Quilt-deployed systems showing actual measured load reduction (once pilots are underway)

---

## Development Notes for Claude Code

### Getting Started

1. **Set up the React project** with TypeScript, Tailwind CSS, and your preferred build tool (Vite recommended for speed).

2. **Start with the data layer.** Run the Census data pull scripts first to generate the PGE territory data files. Having real data early will make everything else more concrete. The Census API is straightforward — a GET request with table ID, geography, and API key returns JSON.

3. **Build the map first.** The map is the visual centerpiece and the hardest component to get right. Get tract boundaries rendering as a choropleth before building any panels. Mapbox GL JS has excellent GeoJSON layer support with built-in hover/click events and data-driven styling.

4. **Wire up the Market Sizing Panel** to react to map selection state. Start with full-territory calculations, then add county filtering, then tract selection.

5. **Build the Program Simulator** as a relatively self-contained component with slider inputs and calculated outputs. The comparison chart is important — use Recharts for clean bar charts.

6. **Add the AI Chat last** since it depends on all other components being functional to build the context payload. Use a serverless API route (e.g., Next.js API route or Vercel serverless function) to keep the Anthropic API key server-side.

### Key Technical Decisions

- **GeoJSON file size:** Census tract GeoJSON for 7 Oregon counties will likely be 5-15 MB. Use topology simplification (e.g., mapshaper.org or topojson CLI) to reduce to under 2 MB for smooth web rendering. High geometric precision is not needed — these are census tracts, not property parcels.

- **Map performance:** With ~500-1000 tracts, Mapbox GL JS should handle the choropleth layer smoothly. If performance is an issue, consider using vector tiles instead of client-side GeoJSON.

- **Census API rate limits:** The Census API allows 500 requests per day without a key, unlimited with a key. Pull all needed data in a single batch per table — the API supports multi-county queries in one request.

- **State FIPS for Oregon:** 41. County FIPS codes: Washington (067), Multnomah (051), Clackamas (005), Marion (047), Yamhill (071), Polk (053), Columbia (009).

### What "Impressive" Looks Like in the Room

The single most important moment in the presentation is when the map loads and the utility exec sees their territory lit up with electric resistance heating concentration. The second most important moment is when someone asks "what about [specific area]?" and you can click on it and get immediate numbers. The AI chat is the third — it's the "wow, this is different from every other vendor meeting" moment. Optimize for those three moments.
