# Capacity Explorer — Data Requirements & Acquisition Guide

*Addendum to Product Requirements Document · Version 1.0 · February 2026*

This document replaces and expands the "Data Requirements" and "Data Preparation Scripts" sections of the main PRD. It provides detailed specifications for every dataset the Capacity Explorer uses, how to acquire each one, and how to process them into the application's data format.

---

## Data Architecture Overview

The application draws from six public data sources, layered together at the census tract level to create a rich, multi-dimensional view of any utility territory. Each source provides a distinct analytical capability:

| Layer | Source | Geographic Resolution | What It Adds |
|-------|--------|----------------------|--------------|
| Housing & heating fuel | Census ACS (B25040 + related) | Census tract | Core choropleth: where electric-heated homes are concentrated |
| Building energy modeling | NREL ResStock | County / PUMA | DOE-validated energy savings estimates for heat pump upgrades (replaces back-of-envelope math) |
| Energy burden & affordability | DOE LEAD Tool | Census tract | Household energy costs and energy burden by income bracket — powers the equity narrative |
| Disadvantaged communities | CEJST / Justice40 | Census tract | Federal disadvantaged community designation — critical for regulatory/funding positioning |
| Utility service territory | EIA Energy Atlas | Utility boundary polygon | Actual utility territory boundary (replaces county-level approximation) |
| Climate | NOAA / ENERGY STAR | County / weather station | Heating degree days, design temperatures — calibrates savings estimates |

All layers join on census tract GEOID (an 11-digit FIPS code: 2-digit state + 3-digit county + 6-digit tract).

### Why This Combination Matters for the Presentation

When you show a utility executive a map that combines Census heating data, DOE-validated energy modeling, federal disadvantaged community designations, and energy burden data — all inside their actual service territory boundary — you're presenting a level of analytical rigor that matches or exceeds what their own planning teams typically produce. Each additional layer adds credibility and storytelling capability:

- **Census ACS** answers: "Where are the electric resistance homes?"
- **ResStock** answers: "What does DOE's building energy model say about the savings potential?" (This is dramatically more credible than citing your own arithmetic.)
- **LEAD Tool** answers: "Which of these households are energy-burdened, and by how much?"
- **CEJST** answers: "Which tracts qualify as Justice40 disadvantaged communities?" (This matters for IRA/BIL funding eligibility and regulatory positioning.)
- **EIA boundaries** answer: "Is this actually in my service territory?" (No more hand-waving about county approximations.)

---

## Dataset 1: Census ACS (American Community Survey)

This is the foundation layer. Everything else enriches and validates what ACS tells us about the housing stock.

### API Basics

- **Endpoint:** `https://api.census.gov/data/{year}/acs/acs5`
- **Latest available:** 2023 ACS 5-Year Estimates (covering 2019-2023), released December 2024
- **Authentication:** Free API key required — register at https://api.census.gov/data/key_signup.html
- **Rate limits:** 500 requests/day without key, unlimited with key
- **Response format:** JSON array of arrays (first row is headers)

### Required Tables & Variable Codes

Each ACS table has a set of variable codes. You need the exact codes to query the API. Below are the complete variable lists for each table.

#### Table B25040 — House Heating Fuel (Primary Dataset)

This is the single most important table. It tells us how many occupied housing units in each tract use each fuel type for heating.

| Variable Code | Description |
|--------------|-------------|
| B25040_001E | Total occupied housing units |
| B25040_002E | Utility gas |
| B25040_003E | Bottled, tank, or LP gas |
| B25040_004E | Electricity |
| B25040_005E | Fuel oil, kerosene, etc. |
| B25040_006E | Coal or coke |
| B25040_007E | Wood |
| B25040_008E | Solar energy |
| B25040_009E | Other fuel |
| B25040_010E | No fuel used |

**Critical notes:**
- `B25040_004E` ("Electricity") does NOT distinguish between electric resistance and heat pumps. It includes both.
- To estimate the electric resistance portion, apply a territory-specific adjustment factor. For Oregon, existing heat pump penetration is moderate but growing — a factor of 0.80 (80% of electric-heated homes are resistance) is reasonable. For territories in the Deep South or Appalachia where heat pump penetration has historically been higher for cooling-primary systems, the factor may be lower (0.60-0.70). For New England, where heat pump adoption is newer, it may be higher (0.85-0.90).
- The ResStock dataset (see Dataset 2) provides a much more granular estimate of HVAC type distribution by county, which can calibrate this factor.

**Example API call for PGE territory (all tracts in Washington County, OR):**
```
https://api.census.gov/data/2023/acs/acs5?get=B25040_001E,B25040_002E,B25040_003E,B25040_004E,B25040_005E,B25040_006E,B25040_007E,B25040_008E,B25040_009E,B25040_010E&for=tract:*&in=state:41&in=county:067&key=YOUR_API_KEY
```

**Multi-county query (all PGE counties in one request):**
```
https://api.census.gov/data/2023/acs/acs5?get=B25040_001E,B25040_004E&for=tract:*&in=state:41&in=county:067,051,005,047,071,053,009&key=YOUR_API_KEY
```

Note: The Census API supports comma-separated county codes in a single request, so you can pull all PGE-territory tracts in one call per table.

#### Table B25034 — Year Structure Built

Older homes are more likely to have electric resistance heating and poor insulation — making them both higher-opportunity targets and higher-impact conversions. This data also helps estimate insulation quality for energy modeling.

| Variable Code | Description |
|--------------|-------------|
| B25034_001E | Total housing units |
| B25034_002E | Built 2020 or later |
| B25034_003E | Built 2010 to 2019 |
| B25034_004E | Built 2000 to 2009 |
| B25034_005E | Built 1990 to 1999 |
| B25034_006E | Built 1980 to 1989 |
| B25034_007E | Built 1970 to 1979 |
| B25034_008E | Built 1960 to 1969 |
| B25034_009E | Built 1950 to 1959 |
| B25034_010E | Built 1940 to 1949 |
| B25034_011E | Built 1939 or earlier |

**Derived field:** `pct_pre1980` = (B25034_007E + B25034_008E + B25034_009E + B25034_010E + B25034_011E) / B25034_001E

#### Table B25003 — Tenure (Owner vs Renter)

Owner-occupied homes are the primary target for the Quilt program because the homeowner is the decision-maker and direct beneficiary. Renter-occupied homes can still be targeted but require landlord engagement.

| Variable Code | Description |
|--------------|-------------|
| B25003_001E | Total occupied housing units |
| B25003_002E | Owner-occupied |
| B25003_003E | Renter-occupied |

**Derived field:** `pct_owner_occupied` = B25003_002E / B25003_001E

#### Table B19013 — Median Household Income

| Variable Code | Description |
|--------------|-------------|
| B19013_001E | Median household income (dollars) |

Returns a single value per tract. Used for the equity analysis layer and to identify LMI communities.

#### Table B25024 — Units in Structure

Identifies building type — critical for filtering to homes where ductless heat pumps are appropriate.

| Variable Code | Description |
|--------------|-------------|
| B25024_001E | Total housing units |
| B25024_002E | 1, detached |
| B25024_003E | 1, attached |
| B25024_004E | 2 |
| B25024_005E | 3 or 4 |
| B25024_006E | 5 to 9 |
| B25024_007E | 10 to 19 |
| B25024_008E | 20 to 49 |
| B25024_009E | 50 or more |
| B25024_010E | Mobile home |
| B25024_011E | Boat, RV, van, etc. |

**Derived field:** `pct_single_family` = (B25024_002E + B25024_003E) / B25024_001E

#### Table B25002 — Occupancy Status

| Variable Code | Description |
|--------------|-------------|
| B25002_001E | Total housing units |
| B25002_002E | Occupied |
| B25002_003E | Vacant |

#### Tables B25040 Cross-Tabulations (Optional Enhancement)

For deeper analysis, ACS provides cross-tabulations that can help estimate what fraction of electric-heated homes are likely resistance vs heat pump. These are more complex to query but provide valuable calibration data:

- **B25117** — Tenure by House Heating Fuel (can identify renter vs owner for electric-heated homes specifically)
- **B25040** by vintage cross-tabs in PUMS (Public Use Microdata) — electric heat in older homes is almost certainly resistance

### Geographic Identifiers (FIPS Codes)

**Oregon (State FIPS: 41)**

| County | FIPS Code | In PGE Territory | Notes |
|--------|-----------|-------------------|-------|
| Washington | 067 | Yes — core | Hillsboro, Beaverton, Tigard |
| Multnomah | 051 | Yes — core | Portland |
| Clackamas | 005 | Yes — core | Oregon City, Lake Oswego |
| Marion | 047 | Yes — partial | Salem area |
| Yamhill | 071 | Yes — partial | McMinnville |
| Polk | 053 | Yes — partial | Dallas, Monmouth |
| Columbia | 009 | Yes — partial | St. Helens, Scappoose |

**Other target territories (for future builds):**

| Territory | State FIPS | Key County FIPS Codes |
|-----------|------------|----------------------|
| Entergy Arkansas | 05 | Crittenden (035), Cross (037), St. Francis (123), Mississippi (093), Poinsett (111) |
| Duke Energy NC | 37 | Mecklenburg (119), Wake (183), Durham (063), Guilford (081) |
| Georgia Power | 13 | Fulton (121), DeKalb (089), Gwinnett (135), Cobb (067) |
| Dominion VA | 51 | Loudoun (107), Prince William (153), Fairfax (059) |

### Census Tract Geographic Boundaries (TIGER/Line)

**Source:** Census Bureau TIGER/Line Shapefiles
**URL:** https://www.census.gov/cgi-bin/geo/shapefiles/index.php (select year → Census Tracts → state)
**Alternative API:** https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/

For the web application, you need GeoJSON format (not shapefiles). Options for acquisition:

1. **Download shapefile, convert locally:** Download the Oregon tract shapefile from TIGER/Line, filter to target counties using ogr2ogr or Python (geopandas), simplify geometries, export as GeoJSON.

2. **Use the Census Cartographic Boundary Files (recommended):** These are pre-simplified and smaller. Available at https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html — select "Census Tracts" and state. These are already simplified to 1:500,000 scale, which is appropriate for the web app. Available as shapefile or GeoJSON.

3. **Census TIGERweb REST API:** Query tract geometries directly: `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2023/MapServer/8/query?where=STATE='41' AND COUNTY IN ('067','051','005','047','071','053','009')&outFields=*&f=geojson`

**Geometry simplification target:** The final GeoJSON for PGE territory (~300-500 tracts across 7 counties) should be under 2 MB after simplification. Use mapshaper.org (web tool) or the `mapshaper` CLI with `simplify 10%` as a starting point, then tune for visual quality vs file size.

---

## Dataset 2: NREL ResStock (Building Energy Model)

This is the most important dataset addition beyond ACS. ResStock provides DOE-validated building energy modeling for the entire U.S. housing stock, including specific heat pump upgrade scenarios. Using ResStock data means Quilt can say "according to the Department of Energy's building energy model" rather than "according to our estimates."

### What ResStock Is

ResStock is NREL's physics-based building stock model. It creates statistically representative building energy models — approximately 1 model per 60-200 dwelling units in the U.S. — each with over 100 characteristics (HVAC type, insulation, vintage, size, occupancy, climate zone, etc.). It then simulates each building using EnergyPlus to produce annual and timeseries energy consumption data.

Critically, ResStock also models **upgrade scenarios** — including "Cold Climate Air-Source Heat Pump" (Package #4 in the 2025.1 release) — showing exactly what happens to energy consumption, peak demand, and utility bills when you upgrade a home. This is precisely what Quilt needs.

### Which Release to Use

**Recommended: ResStock 2024.2 or 2025.1**

The 2025.1 release (October 2025) is the latest and includes 28 upgrade packages. Package #4 is "Cold Climate Air-Source Heat Pump" which is the closest analog to a Quilt installation. The 2024.2 release has similar packages with slightly different configurations.

Key packages relevant to Quilt's use case:
- **Package 4 (2025.1): Cold Climate Air-Source Heat Pump** — Most directly relevant
- **Package 3 (2025.1): Reference Space Heating and AC Upgrade Circa 2025** — Baseline comparison
- **Packages 24-28 (2025.1): HVAC Load Flexibility** — Demand response modeling

### How to Access the Data

ResStock data is hosted on the Open Energy Data Initiative (OEDI) on AWS S3. The metadata and annual results files contain all the information needed — you do NOT need the timeseries files (which are enormous).

**Data location for 2025.1 AMY 2018:**
```
s3://oedi-data-lake/nrel-pds-building-stock/end-use-load-profiles-for-us-building-stock/2025/resstock_amy2018_release_1/metadata_and_annual_results/
```

**Data location for 2024.2 TMY3 (alternative, well-documented):**
```
s3://oedi-data-lake/nrel-pds-building-stock/end-use-load-profiles-for-us-building-stock/2024/resstock_tmy3_release_2/metadata_and_annual_results/
```

Files are available partitioned by state in parquet format. For Oregon:
```
s3://oedi-data-lake/.../metadata_and_annual_results/by_state/state=OR/
```

Each file can also be downloaded via HTTPS through the OEDI data viewer:
https://data.openei.org/s3_viewer?bucket=oedi-data-lake&prefix=nrel-pds-building-stock%2Fend-use-load-profiles-for-us-building-stock%2F2025%2Fresstock_amy2018_release_1%2Fmetadata_and_annual_results%2F

### Key Fields in ResStock Metadata

Each row in the metadata represents one simulated dwelling unit model. Key columns for the Capacity Explorer:

**Geographic identifiers:**
- `in.county` or `in.county_name` — County (NHGIS GISJOIN format, mappable to FIPS)
- `in.puma` — Census PUMA (Public Use Microdata Area)
- `in.ashrae_iecc_climate_zone_2004` — Climate zone
- `in.state` — State abbreviation

**Housing characteristics (input fields prefixed `in.`):**
- `in.hvac_heating_type` — "Electric Resistance", "Electric Baseboard", "Electric Furnace", "ASHP", "MSHP", "Gas Furnace", etc. **This is the gold mine — it directly identifies electric resistance homes.**
- `in.hvac_heating_efficiency` — Efficiency of existing heating system
- `in.geometry_building_type_recs` — Single-Family Detached, Multifamily, etc.
- `in.vintage` — Year built range
- `in.sqft` — Floor area
- `in.insulation_wall`, `in.insulation_ceiling` — Insulation levels
- `in.tenure` — Owner/renter
- `in.income` — Household income bracket
- `in.federal_poverty_level` — FPL category

**Baseline energy results (output fields prefixed `out.`):**
- `out.electricity.heating.energy_consumption.kwh` — Baseline annual heating electricity (kWh)
- `out.electricity.total.energy_consumption.kwh` — Baseline total annual electricity
- `out.electricity.heating.peak_demand.kw` — **Baseline peak heating electricity demand (kW)** — this is the number to compare to Quilt's 5.4 kW max draw
- `out.utility_bills.electricity.total.usd` — Annual electricity bill

**Upgrade results (for Cold Climate ASHP package):**
- Same field structure but showing post-upgrade values
- The delta between baseline and upgrade gives the DOE-modeled savings per home

**Weight:**
- `build_existing_model.sample_weight` — How many real dwelling units this model represents. Critical for aggregation — multiply all values by this weight when summing to get territory-level estimates.

### How ResStock Data Enhances the Application

**Replacing the ER adjustment factor with actual data:** Instead of assuming "85% of electric-heated homes use resistance," you can query ResStock's `in.hvac_heating_type` field filtered to Oregon counties and get the actual modeled distribution of HVAC types. Example result might show that in Washington County, OR, ResStock models 72% Electric Resistance, 8% Electric Baseboard, 6% ASHP, 14% Gas Furnace among homes with electricity as primary heating fuel.

**Replacing arithmetic savings with DOE-modeled savings:** Instead of "12,500 kWh baseline - 3,580 kWh Quilt = 8,920 kWh saved," you can report "DOE's ResStock building energy model estimates an average of X kWh annual savings for cold-climate heat pump upgrades in homes with electric resistance heating in this climate zone."

**Peak demand validation:** ResStock's `out.electricity.heating.peak_demand.kw` field can validate the 12.5 kW baseline assumption and the 7.5 kW reduction claim with DOE-modeled data.

### Data Processing Approach

Since ResStock data is at the county/PUMA level (not census tract), the integration approach is:

1. Download Oregon state parquet file from OEDI
2. Filter to PGE territory counties
3. Filter to `in.hvac_heating_type` containing "Electric Resistance" or "Electric Baseboard"
4. Aggregate by county, weighted by `sample_weight`:
   - Count of electric resistance homes (weighted)
   - Average baseline heating kWh
   - Average baseline peak heating kW
   - Average post-upgrade heating kWh (from upgrade package)
   - Average post-upgrade peak heating kW
   - Average annual bill savings
5. Output county-level ResStock summary JSON that the app uses to calibrate the census-tract-level ACS data

This gives you a county-level "calibration layer" — the Census ACS data provides tract-level geographic granularity, and ResStock provides DOE-validated energy modeling at the county level.

### Spatial Lookup

ResStock includes a `spatial_tract_lookup_table.csv` file that maps between census tracts, PUMAs, counties, and other geographies. Use this to create the crosswalk between ResStock's county/PUMA identifiers and the Census tract GEOID used in the choropleth map.

---

## Dataset 3: DOE LEAD Tool (Energy Burden & Affordability)

The Low-Income Energy Affordability Data (LEAD) Tool provides estimated household energy expenditures and energy burden at the census tract level. This data is essential for telling the equity story — showing that the tracts with the highest electric resistance heating concentration often overlap with the tracts where households spend the largest share of their income on energy.

### What LEAD Provides

For each census tract, LEAD provides estimated:
- Average annual energy expenditure by fuel type (electricity, gas, other)
- Energy burden (% of gross household income spent on energy) by income bracket
- Breakdowns by housing type, tenure, building age, and fuel type
- Data segmented by AMI (Area Median Income) and FPL (Federal Poverty Level) categories

### How to Access

**Download URL:** https://data.openei.org/submissions/6219 (2022 update, using ACS 2018-2022 data)

The dataset is organized as CSV files by state. For Oregon, download the census-tract-level file. The file contains one row per census tract with columns for energy cost and burden metrics across different income categories.

**Key fields to extract:**
- `GEOID` — Census tract identifier (joins to ACS data)
- `AVG_ELEC_COST` — Average annual electricity cost
- `AVG_GAS_COST` — Average annual gas cost
- `AVG_ENERGY_BURDEN` — Average energy burden (% of income)
- `ELEC_BURDEN_LMI` — Electricity burden for low-to-moderate income households
- Housing counts by fuel type and income bracket

### How LEAD Data Enhances the Application

**Map layer: "Energy Burden"** — Add energy burden as a choropleth toggle option. Tracts with high energy burden AND high electric resistance heating concentration are the most compelling targets for intervention — these are households paying the most for the worst heating system.

**Equity narrative in the Market Sizing Panel:** "In the selected area, X,000 low-income households spend an average of Y% of their income on energy, compared to the national average of 2%. Converting these homes to Quilt heat pumps would reduce their energy burden from Y% to Z%."

**AI Chat context:** The chat assistant can answer questions like "Which tracts have the highest energy burden?" or "How many energy-burdened households are in the Hillsboro area?"

### Data Processing

1. Download Oregon census tract LEAD file
2. Filter to PGE territory tracts (by matching GEOID to the ACS tract list)
3. Extract key energy burden and cost metrics per tract
4. Output as `energy_burden.json` keyed by tract GEOID
5. Merge into the GeoJSON properties when building the territory data

---

## Dataset 4: CEJST / Justice40 (Disadvantaged Communities)

The Climate and Economic Justice Screening Tool (CEJST) identifies census tracts that are federally designated as "disadvantaged communities" under the Justice40 initiative. This designation affects eligibility for billions in federal clean energy funding under the IRA and Bipartisan Infrastructure Law.

### Why This Matters for Quilt

Utility regulators and program administrators increasingly need to demonstrate that energy programs serve disadvantaged communities. If Quilt can show that the highest-concentration electric resistance heating tracts overlap with Justice40 designated communities, it strengthens the case for regulatory approval and federal co-funding. It also positions the hyperscaler-funded program as advancing environmental justice goals — a story that resonates with both utility commissioners and hyperscaler ESG teams.

### How to Access

**Note on current status:** The original CEJST tool was hosted at screeningtool.geoplatform.gov. White House access was discontinued in January 2025, but unofficial copies of the data remain available. The underlying data is public domain.

**Data download options:**
1. **Direct download:** The CEJST dataset (v2.0) is available as CSV and shapefile from: https://github.com/usds/justice40-tool (the `data/score` directory contains downloadable files)
2. **ArcGIS Living Atlas:** Justice40 tracts are available as a feature layer in ArcGIS Online, downloadable as GeoJSON
3. **Cached copies:** Several organizations host mirrors of the CEJST data

### Key Fields

- `Census tract 2010 ID` — 11-digit GEOID (note: uses 2010 tract boundaries; may need crosswalk to 2020 tracts)
- `Identified as disadvantaged` — Boolean (Yes/No)
- `Total threshold criteria exceeded` — Count of categories where the tract meets disadvantaged criteria
- Category-specific flags for: climate change, energy, health, housing, legacy pollution, transportation, water/wastewater, workforce development
- `Energy burden` (90th percentile flag) — Specifically flags tracts with high energy burden
- `Housing burden` (flag) — Flags tracts with high housing cost burden
- `Share of homes built before 1960` (flag) — Flags tracts with older housing stock (lead paint proxy, but also correlated with ER heating)

### How CEJST Data Enhances the Application

**Map layer: "Justice40 Communities"** — Toggle overlay showing which tracts are federally designated as disadvantaged. Use a distinctive visual treatment (hatching pattern, border color) that can layer on top of the heating fuel choropleth.

**Market Sizing Panel addition:** "Of the X,000 addressable electric resistance homes, Y,000 (Z%) are in Justice40-designated disadvantaged communities."

**Program Simulator addition:** "This pilot would serve N homes in disadvantaged communities, qualifying for enhanced federal incentives and meeting utility equity requirements."

### Data Processing

1. Download CEJST CSV
2. Filter to Oregon tracts in PGE territory
3. Extract `is_disadvantaged` boolean and category flags per tract
4. Output as `justice40.json` keyed by tract GEOID
5. Merge into GeoJSON properties

**Important: Census tract vintage alignment.** CEJST v2.0 uses 2010 census tract boundaries. The ACS data may use 2020 boundaries (which changed some tract delineations). For most tracts the boundaries are identical, but some tracts were split or merged. For the MVP, a simple GEOID join will capture ~95% of tracts. A more rigorous approach would use a 2010-to-2020 crosswalk file from the Census Bureau.

---

## Dataset 5: EIA Utility Service Territory Boundaries

This dataset provides the actual geographic boundary of each electric utility's retail service territory, allowing us to clip census tracts to PGE's actual territory rather than approximating with county boundaries.

### How to Access

**EIA Energy Atlas:** https://atlas.eia.gov/datasets/f4cd55044b924fed9bc8b64022966097

The Electric Retail Service Territories layer is available for download in multiple formats including GeoJSON, shapefile, and CSV. It can also be queried via ArcGIS REST API.

**Direct GeoJSON query for PGE:**
```
https://services.arcgis.com/...query?where=NAME='Portland General Electric Co'&outFields=*&f=geojson
```

(The exact REST endpoint URL can be found on the dataset page.)

**Alternative source:** HIFLD (Homeland Infrastructure Foundation-Level Data) Open Data portal also hosts electric retail service territory boundaries at https://hifld-geoplatform.opendata.arcgis.com/ — search for "Electric Retail Service Territories."

### Key Fields

- `NAME` — Utility name (e.g., "Portland General Electric Co")
- `ID` — EIA utility ID
- `STATE` — State abbreviation
- `CNTRL_AREA` — Control area / balancing authority
- `geometry` — Polygon boundary

### How EIA Boundaries Enhance the Application

**Replaces county approximation:** Instead of including all tracts in 7 counties (many of which are outside PGE's actual territory), clip to the real boundary. This prevents overestimating the addressable market in areas served by Pacific Power, consumer-owned utilities, or other providers.

**Visual credibility:** Drawing the actual PGE service territory boundary on the map looks professional and shows the utility exec that you're working with real data about their specific territory.

**Tract clipping logic:** For each census tract, compute the intersection with the utility territory boundary. Include a tract if >50% of its area falls within the utility territory. This can be done in the data prep step using geopandas (Python) or turf.js (JavaScript).

### Data Processing

1. Download the EIA utility territory GeoJSON (or query the API for PGE specifically)
2. In the data prep script, spatially intersect census tract boundaries with the PGE territory boundary
3. Tag each tract with `in_territory: true/false` (or a coverage percentage)
4. Filter the territory dataset to only include tracts that are in-territory
5. Include the utility boundary as a separate GeoJSON layer for rendering on the map

---

## Dataset 6: Climate Data

Climate data calibrates the energy savings estimates to local conditions. Heating degree days determine annual energy consumption, and design temperatures determine peak demand.

### ENERGY STAR County Climate Reference Guide

**Source:** https://www.energystar.gov/partner_resources/residential_new/builders_developers/qualifying_criteria/county_reference_guide

This guide maps every U.S. county to an IECC climate zone and provides key climate data. Download the full guide as an Excel file.

**Key data points per county:**
- IECC Climate Zone (e.g., 4C for Portland)
- Annual Heating Degree Days (base 65°F)
- Annual Cooling Degree Days (base 65°F)

### NOAA Climate Normals

**Source:** https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals

Provides 30-year average temperature normals by weather station. For PGE territory, the Portland International Airport (KPDX) station is the primary reference.

**Key data points:**
- Average January minimum temperature: ~34°F (Portland metro)
- ASHRAE 99% design heating temperature: ~23°F
- ASHRAE 99.6% design heating temperature: ~17°F

### Per-Territory Climate Configuration

For each territory, store a climate configuration object:

```json
{
  "pge-oregon": {
    "iecc_climate_zone": "4C",
    "hdd_annual_base65": 4400,
    "cdd_annual_base65": 400,
    "ashrae_99_design_temp_f": 23,
    "ashrae_996_design_temp_f": 17,
    "avg_jan_min_f": 34,
    "primary_weather_station": "KPDX",
    "co2_grid_factor_lbs_per_kwh": 0.64,
    "notes": "Marine climate, moderate heating load. Electric resistance is common in older homes. Heat pump performance is excellent in this climate — COP rarely drops below 2.5."
  }
}
```

---

## Data Preparation Scripts (Detailed)

### Script Architecture

```
scripts/
├── config/
│   └── territories/
│       ├── pge-oregon.yaml          # Territory definition file
│       └── entergy-arkansas.yaml    # Future territory
├── pull_census_acs.py               # Census API data pull
├── pull_tract_boundaries.py         # TIGER/Line GeoJSON
├── pull_resstock.py                 # ResStock parquet download & processing
├── pull_lead.py                     # DOE LEAD tool processing
├── pull_justice40.py                # CEJST data processing
├── pull_utility_boundary.py         # EIA service territory boundary
├── build_territory.py               # Orchestrator — runs everything
├── requirements.txt                 # Python dependencies
└── README.md
```

### Territory Definition File (YAML)

Each territory is defined by a configuration file that drives the entire data pull:

```yaml
# config/territories/pge-oregon.yaml
territory_id: pge-oregon
display_name: Portland General Electric
utility_name: Portland General Electric Co  # Must match EIA dataset exactly
eia_utility_id: 15248  # EIA utility ID for API queries
state: OR
state_fips: "41"

counties:
  - name: Washington
    fips: "067"
    primary: true      # Core territory
  - name: Multnomah
    fips: "051"
    primary: true
  - name: Clackamas
    fips: "005"
    primary: true
  - name: Marion
    fips: "047"
    primary: false     # Partial overlap
  - name: Yamhill
    fips: "071"
    primary: false
  - name: Polk
    fips: "053"
    primary: false
  - name: Columbia
    fips: "009"
    primary: false

# Adjustment factors
er_adjustment_factor: 0.80       # % of ACS "electric heat" homes that are resistance
owner_occupied_filter: false      # Include renters by default
single_family_filter: false       # Include multifamily by default

# Climate
climate:
  iecc_zone: "4C"
  hdd_annual: 4400
  cdd_annual: 400
  ashrae_99_design_f: 23
  ashrae_996_design_f: 17
  co2_lbs_per_kwh: 0.64

# Utility rates
rates:
  residential_avg_kwh: 0.125     # $/kWh
  residential_fixed_monthly: 12   # $/month

# Map display
map:
  center_lng: -122.77
  center_lat: 45.52
  default_zoom: 9

# Data center landmarks
landmarks:
  - name: "Meta / QTS Hillsboro"
    type: data_center
    lat: 45.5407
    lng: -122.9365
    capacity_mw: 250
    operator: Meta
    status: active
    notes: "QTS campus, 250 MW committed"
  - name: "Flexential Hillsboro"
    type: data_center
    lat: 45.5345
    lng: -122.9212
    capacity_mw: null
    operator: Flexential
    status: active
  - name: "PGE Headquarters"
    type: utility_hq
    lat: 45.5155
    lng: -122.6793
```

### Script 1: `pull_census_acs.py`

```python
"""
Pull ACS 5-Year data from Census API for a territory.
Outputs: demographics.json keyed by tract GEOID
"""

import requests
import json
import sys
import os
from pathlib import Path

CENSUS_API_BASE = "https://api.census.gov/data/2023/acs/acs5"
CENSUS_API_KEY = os.environ.get("CENSUS_API_KEY")

# All variables to pull, organized by table
VARIABLES = {
    # B25040 - Heating Fuel
    "B25040_001E": "heating_fuel_total",
    "B25040_002E": "heating_fuel_gas",
    "B25040_003E": "heating_fuel_bottled_gas",
    "B25040_004E": "heating_fuel_electricity",
    "B25040_005E": "heating_fuel_oil",
    "B25040_006E": "heating_fuel_coal",
    "B25040_007E": "heating_fuel_wood",
    "B25040_008E": "heating_fuel_solar",
    "B25040_009E": "heating_fuel_other",
    "B25040_010E": "heating_fuel_none",
    # B25034 - Year Built
    "B25034_001E": "year_built_total",
    "B25034_002E": "year_built_2020_or_later",
    "B25034_003E": "year_built_2010_2019",
    "B25034_004E": "year_built_2000_2009",
    "B25034_005E": "year_built_1990_1999",
    "B25034_006E": "year_built_1980_1989",
    "B25034_007E": "year_built_1970_1979",
    "B25034_008E": "year_built_1960_1969",
    "B25034_009E": "year_built_1950_1959",
    "B25034_010E": "year_built_1940_1949",
    "B25034_011E": "year_built_pre_1940",
    # B25003 - Tenure
    "B25003_001E": "tenure_total",
    "B25003_002E": "tenure_owner",
    "B25003_003E": "tenure_renter",
    # B19013 - Income
    "B19013_001E": "median_household_income",
    # B25024 - Units in Structure
    "B25024_001E": "units_structure_total",
    "B25024_002E": "units_1_detached",
    "B25024_003E": "units_1_attached",
    "B25024_004E": "units_2",
    "B25024_005E": "units_3_4",
    "B25024_006E": "units_5_9",
    "B25024_007E": "units_10_19",
    "B25024_008E": "units_20_49",
    "B25024_009E": "units_50_plus",
    "B25024_010E": "units_mobile",
    # B25002 - Occupancy
    "B25002_001E": "occupancy_total",
    "B25002_002E": "occupancy_occupied",
    "B25002_003E": "occupancy_vacant",
}


def pull_acs_data(state_fips: str, county_fips_list: list[str]) -> dict:
    """Pull all ACS variables for all tracts in specified counties."""

    # Census API accepts comma-separated county codes
    counties_str = ",".join(county_fips_list)
    var_codes = ",".join(VARIABLES.keys())

    # The API has a variable limit per request (~50).
    # Our list is ~30 variables so one request works.
    url = (
        f"{CENSUS_API_BASE}"
        f"?get=NAME,{var_codes}"
        f"&for=tract:*"
        f"&in=state:{state_fips}"
        f"&in=county:{counties_str}"
        f"&key={CENSUS_API_KEY}"
    )

    response = requests.get(url)
    response.raise_for_status()
    data = response.json()

    # First row is headers
    headers = data[0]
    rows = data[1:]

    tracts = {}
    for row in rows:
        row_dict = dict(zip(headers, row))

        # Build GEOID: state(2) + county(3) + tract(6)
        geoid = row_dict["state"] + row_dict["county"] + row_dict["tract"]

        tract_data = {"geoid": geoid, "name": row_dict.get("NAME", "")}

        # Map API variable codes to friendly names, cast to numeric
        for var_code, friendly_name in VARIABLES.items():
            raw_val = row_dict.get(var_code)
            if raw_val is None or raw_val == "" or raw_val == "-666666666":
                tract_data[friendly_name] = None
            else:
                tract_data[friendly_name] = (
                    float(raw_val) if "." in str(raw_val) else int(raw_val)
                )

        # Compute derived fields
        tract_data.update(compute_derived_fields(tract_data))

        tracts[geoid] = tract_data

    return tracts


def compute_derived_fields(t: dict) -> dict:
    """Compute percentage and derived fields from raw ACS data."""
    derived = {}

    # Heating fuel percentages
    total = t.get("heating_fuel_total") or 0
    if total > 0:
        derived["pct_electric_heat"] = round(
            (t.get("heating_fuel_electricity") or 0) / total * 100, 1
        )
        derived["pct_gas_heat"] = round(
            (t.get("heating_fuel_gas") or 0) / total * 100, 1
        )
    else:
        derived["pct_electric_heat"] = 0
        derived["pct_gas_heat"] = 0

    # Year built: % pre-1980
    yb_total = t.get("year_built_total") or 0
    if yb_total > 0:
        pre_1980 = sum(
            t.get(f, 0) or 0
            for f in [
                "year_built_1970_1979",
                "year_built_1960_1969",
                "year_built_1950_1959",
                "year_built_1940_1949",
                "year_built_pre_1940",
            ]
        )
        derived["pct_pre_1980"] = round(pre_1980 / yb_total * 100, 1)
    else:
        derived["pct_pre_1980"] = 0

    # Tenure: % owner-occupied
    tenure_total = t.get("tenure_total") or 0
    if tenure_total > 0:
        derived["pct_owner_occupied"] = round(
            (t.get("tenure_owner") or 0) / tenure_total * 100, 1
        )
    else:
        derived["pct_owner_occupied"] = 0

    # Structure type: % single-family
    struct_total = t.get("units_structure_total") or 0
    if struct_total > 0:
        sf = (t.get("units_1_detached") or 0) + (t.get("units_1_attached") or 0)
        derived["pct_single_family"] = round(sf / struct_total * 100, 1)
    else:
        derived["pct_single_family"] = 0

    return derived
```

### Script 2: `pull_resstock.py`

```python
"""
Download and process NREL ResStock metadata for a territory.
Outputs: resstock_summary.json with county-level energy modeling aggregates.

Requires: pip install pyarrow pandas
"""

import pandas as pd
import json
from pathlib import Path

# ResStock 2024.2 TMY3 Oregon state file URL (parquet)
RESSTOCK_BASE_URL = (
    "https://oedi-data-lake.s3.amazonaws.com/"
    "nrel-pds-building-stock/end-use-load-profiles-for-us-building-stock/"
    "2024/resstock_tmy3_release_2/metadata_and_annual_results/by_state/"
)


def process_resstock_for_territory(
    state: str, county_names: list[str], output_path: Path
):
    """
    Download ResStock state parquet, filter to territory counties,
    and compute aggregated energy metrics for ER homes.
    """

    # Download (this may be a large file, ~100-500 MB per state)
    state_url = f"{RESSTOCK_BASE_URL}state={state}/"
    # In practice, list the parquet files in the S3 prefix and download
    # the baseline file. The exact filename varies by release.

    # For local development, download the file manually first:
    # aws s3 cp s3://oedi-data-lake/.../by_state/state=OR/ ./data/resstock/ --recursive
    # Then read locally:
    df = pd.read_parquet(f"./data/resstock/state={state}/")

    # Filter to territory counties
    df_territory = df[df["in.county_name"].isin(county_names)]

    # Identify electric resistance homes
    er_types = [
        "Electric Resistance",
        "Electric Baseboard",
        "Electric Furnace",
    ]
    df_er = df_territory[df_territory["in.hvac_heating_type"].isin(er_types)]

    # Compute weighted averages and totals by county
    summary = {}
    for county, group in df_er.groupby("in.county_name"):
        weights = group["build_existing_model.sample_weight"]
        total_homes = weights.sum()

        summary[county] = {
            "estimated_er_homes": int(total_homes),
            "avg_baseline_heating_kwh": weighted_avg(
                group, "out.electricity.heating.energy_consumption.kwh", weights
            ),
            "avg_baseline_total_kwh": weighted_avg(
                group, "out.electricity.total.energy_consumption.kwh", weights
            ),
            "avg_baseline_peak_heating_kw": weighted_avg(
                group, "out.electricity.heating.peak_demand.kw", weights
            ),
            "avg_annual_elec_bill": weighted_avg(
                group, "out.utility_bills.electricity.total.usd", weights
            ),
            "building_type_distribution": (
                group.groupby("in.geometry_building_type_recs")
                .apply(lambda x: x["build_existing_model.sample_weight"].sum())
                .to_dict()
            ),
            "vintage_distribution": (
                group.groupby("in.vintage")
                .apply(lambda x: x["build_existing_model.sample_weight"].sum())
                .to_dict()
            ),
        }

    # Also compute HVAC type distribution across all electric-heated homes
    # (not just resistance) to calibrate the ER adjustment factor
    df_elec_heat = df_territory[
        df_territory["in.hvac_heating_type"].str.contains(
            "Electric|ASHP|MSHP", case=False, na=False
        )
    ]
    hvac_dist = (
        df_elec_heat.groupby("in.hvac_heating_type")
        .apply(lambda x: x["build_existing_model.sample_weight"].sum())
        .to_dict()
    )
    total_elec_heated = sum(hvac_dist.values())
    hvac_pct = {k: round(v / total_elec_heated * 100, 1) for k, v in hvac_dist.items()}

    output = {
        "source": "NREL ResStock 2024.2 TMY3",
        "state": state,
        "territory_counties": county_names,
        "hvac_type_distribution_electric_heated": hvac_pct,
        "implied_er_adjustment_factor": round(
            sum(v for k, v in hvac_pct.items() if "Resistance" in k or "Baseboard" in k or "Furnace" in k and "Electric" in k) / 100,
            2,
        ),
        "county_summaries": summary,
    }

    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)

    return output


def weighted_avg(df, col, weights):
    """Compute weighted average, handling missing values."""
    valid = df[col].notna()
    if valid.sum() == 0:
        return None
    return round((df.loc[valid, col] * weights[valid]).sum() / weights[valid].sum(), 1)
```

### Script 3: `pull_tract_boundaries.py`

```python
"""
Download and process census tract boundaries for a territory.
Outputs: tracts.geojson with demographic data merged into properties.

Requires: pip install geopandas requests shapely
Optional for simplification: pip install topojson
"""

import geopandas as gpd
import json
from pathlib import Path

# Census Cartographic Boundary Files (pre-simplified, ~1:500k)
CARTOGRAPHIC_BASE = (
    "https://www2.census.gov/geo/tiger/GENZ2023/shp/"
    "cb_2023_{state_fips}_tract_500k.zip"
)


def pull_and_process_boundaries(
    state_fips: str,
    county_fips_list: list[str],
    demographics: dict,
    utility_boundary_path: str | None,
    output_path: Path,
):
    """
    Download tract boundaries, filter to territory, merge demographics,
    optionally clip to utility boundary, and export as GeoJSON.
    """

    # Download cartographic boundary file
    url = CARTOGRAPHIC_BASE.format(state_fips=state_fips)
    gdf = gpd.read_file(url)

    # Filter to territory counties
    gdf = gdf[gdf["COUNTYFP"].isin(county_fips_list)]

    # Build GEOID for joining
    gdf["GEOID"] = gdf["STATEFP"] + gdf["COUNTYFP"] + gdf["TRACTCE"]

    # Optionally clip to utility territory boundary
    if utility_boundary_path:
        utility_gdf = gpd.read_file(utility_boundary_path)
        # Compute intersection percentage for each tract
        gdf["original_area"] = gdf.geometry.area
        clipped = gpd.overlay(gdf, utility_gdf, how="intersection")
        clipped["clipped_area"] = clipped.geometry.area
        clipped["coverage_pct"] = clipped["clipped_area"] / clipped["original_area"]
        # Keep tracts with >50% coverage
        in_territory = clipped[clipped["coverage_pct"] > 0.5]["GEOID"].unique()
        gdf = gdf[gdf["GEOID"].isin(in_territory)]
        gdf["in_utility_territory"] = True

    # Merge demographic data into GeoJSON properties
    for idx, row in gdf.iterrows():
        geoid = row["GEOID"]
        if geoid in demographics:
            for key, value in demographics[geoid].items():
                if key != "geoid":  # Avoid duplicate
                    gdf.at[idx, key] = value

    # Simplify geometry further if file is still too large
    # Target: < 2 MB for web rendering
    gdf.geometry = gdf.geometry.simplify(tolerance=0.001, preserve_topology=True)

    # Export as GeoJSON
    gdf.to_file(output_path, driver="GeoJSON")

    file_size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"Output: {output_path} ({file_size_mb:.1f} MB, {len(gdf)} tracts)")

    return gdf
```

### Script 4: `build_territory.py` (Orchestrator)

```python
"""
Master build script. Run this to generate all data files for a territory.

Usage: python build_territory.py config/territories/pge-oregon.yaml
"""

import yaml
import json
import sys
from pathlib import Path
from pull_census_acs import pull_acs_data
from pull_tract_boundaries import pull_and_process_boundaries
from pull_resstock import process_resstock_for_territory
# from pull_lead import process_lead_data
# from pull_justice40 import process_justice40_data
# from pull_utility_boundary import download_utility_boundary


def build(config_path: str):
    with open(config_path) as f:
        config = yaml.safe_load(f)

    territory_id = config["territory_id"]
    output_dir = Path(f"public/data/territories/{territory_id}")
    output_dir.mkdir(parents=True, exist_ok=True)

    state_fips = config["state_fips"]
    county_fips = [c["fips"] for c in config["counties"]]
    county_names = [c["name"] for c in config["counties"]]

    print(f"Building territory: {config['display_name']}")
    print(f"  State: {config['state']} ({state_fips})")
    print(f"  Counties: {', '.join(county_names)}")

    # Step 1: Pull Census ACS data
    print("\n[1/6] Pulling Census ACS data...")
    demographics = pull_acs_data(state_fips, county_fips)
    with open(output_dir / "demographics.json", "w") as f:
        json.dump(demographics, f, indent=2)
    print(f"  → {len(demographics)} tracts")

    # Step 2: Pull and process tract boundaries
    print("\n[2/6] Pulling tract boundaries...")
    pull_and_process_boundaries(
        state_fips=state_fips,
        county_fips_list=county_fips,
        demographics=demographics,
        utility_boundary_path=None,  # TODO: Add utility boundary clipping
        output_path=output_dir / "tracts.geojson",
    )

    # Step 3: Process ResStock data
    print("\n[3/6] Processing ResStock data...")
    process_resstock_for_territory(
        state=config["state"],
        county_names=county_names,
        output_path=output_dir / "resstock_summary.json",
    )

    # Step 4: Process LEAD energy burden data
    print("\n[4/6] Processing LEAD energy burden data...")
    # process_lead_data(state_fips, county_fips, output_dir / "energy_burden.json")
    print("  → Skipped (implement pull_lead.py)")

    # Step 5: Process Justice40 data
    print("\n[5/6] Processing Justice40 data...")
    # process_justice40_data(state_fips, county_fips, output_dir / "justice40.json")
    print("  → Skipped (implement pull_justice40.py)")

    # Step 6: Write territory config
    print("\n[6/6] Writing territory config...")
    territory_config = {
        "territory_id": territory_id,
        "display_name": config["display_name"],
        "utility_name": config["utility_name"],
        "state": config["state"],
        "default_electricity_rate": config["rates"]["residential_avg_kwh"],
        "er_adjustment_factor": config["er_adjustment_factor"],
        "map_center": [config["map"]["center_lng"], config["map"]["center_lat"]],
        "map_zoom": config["map"]["default_zoom"],
        "counties": county_names,
        "climate": config["climate"],
        "landmarks": config.get("landmarks", []),
    }
    with open(output_dir / "territory-config.json", "w") as f:
        json.dump(territory_config, f, indent=2)

    print(f"\n✅ Territory build complete: {output_dir}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python build_territory.py <config.yaml>")
        sys.exit(1)
    build(sys.argv[1])
```

### Python Dependencies

```
# scripts/requirements.txt
requests>=2.31
pandas>=2.0
pyarrow>=14.0       # For reading ResStock parquet files
geopandas>=0.14
shapely>=2.0
pyyaml>=6.0
```

---

## Output File Structure (Per Territory)

After running the build script, each territory directory should contain:

```
public/data/territories/pge-oregon/
├── tracts.geojson              # Census tract boundaries with all demographic properties
├── demographics.json           # Raw ACS data keyed by tract GEOID
├── resstock_summary.json       # County-level ResStock energy modeling aggregates
├── energy_burden.json          # LEAD tool data keyed by tract GEOID
├── justice40.json              # CEJST disadvantaged community flags by tract GEOID
├── utility_boundary.geojson    # PGE service territory boundary polygon
├── territory-config.json       # Territory metadata, rates, climate, landmarks
└── README.md                   # Data provenance and methodology notes
```

The `tracts.geojson` file is the primary data file loaded by the map. It should have all key metrics merged into each tract's GeoJSON properties so the choropleth, tooltips, and Market Sizing Panel can read directly from GeoJSON feature properties without separate lookups. The other JSON files provide supplementary detail for the Program Simulator and AI Chat components.

### Example GeoJSON Feature Properties

Each tract in `tracts.geojson` should have properties like:

```json
{
  "GEOID": "41067030100",
  "county_name": "Washington",
  "tract_name": "Census Tract 301, Washington County, Oregon",

  "heating_fuel_total": 1845,
  "heating_fuel_electricity": 612,
  "pct_electric_heat": 33.2,

  "estimated_er_homes": 490,
  "peak_capacity_freed_kw": 3675,

  "pct_pre_1980": 58.3,
  "pct_owner_occupied": 71.2,
  "pct_single_family": 82.1,
  "median_household_income": 67500,

  "energy_burden_avg": 3.2,
  "energy_burden_lmi": 8.7,
  "is_justice40_disadvantaged": false,
  "justice40_categories_met": 0
}
```

---

## Data Freshness & Update Strategy

| Dataset | Release Cadence | Latest Available | Action Needed |
|---------|----------------|------------------|---------------|
| Census ACS 5-Year | Annual (December) | 2023 (Dec 2024 release) | Pull once per territory build, refresh annually |
| NREL ResStock | ~Annual | 2025.1 (Oct 2025) | Pull once, refresh when new release has significant changes |
| DOE LEAD Tool | Periodic | 2022 Update (Aug 2024) | Pull once, refresh when new release available |
| CEJST | Versioned | v2.0 (Nov 2022) | Pull once; data may be stale given political changes |
| EIA Service Territories | Annual | 2024 | Pull once per territory |
| Climate Normals | Decadal (NOAA) | 1991-2020 normals | Essentially static for our purposes |

For the demo/presentation tool, data does not need to be live. Pre-pulling and processing into static JSON files is the correct approach. The build script should be re-runnable when newer data becomes available.

---

## Assumptions & Methodology Documentation

The application should include an accessible "Data Sources & Methodology" panel (modal or expandable section) that documents every assumption. This is critical for utility credibility. Key items:

1. **Electric heat ≠ electric resistance:** Census ACS reports "electricity" as heating fuel but does not distinguish resistance from heat pumps. We apply a territory-specific adjustment factor (default 80% for Oregon), calibrated using NREL ResStock's HVAC type distribution modeling. ResStock indicates approximately X% of electric-heated Oregon homes use resistance heating.

2. **Geographic boundaries:** Census tract boundaries are clipped to the utility's actual service territory using EIA Electric Retail Service Territory boundary data. Tracts with >50% area coverage are included.

3. **Energy savings estimates are sourced from two models:**
   - **Quilt product specifications:** 5.4 kW max draw, COP of 2.5 at 17°F, HSPF2 of 12
   - **DOE/NREL ResStock:** Physics-based building energy simulations showing average annual savings of X kWh and peak demand reduction of Y kW for cold-climate heat pump upgrades on electric resistance homes in Climate Zone 4C

4. **Energy burden data** is from DOE's LEAD Tool, which estimates household energy costs using ACS microdata calibrated to EIA utility-reported sales data.

5. **Disadvantaged community designations** are from the Climate and Economic Justice Screening Tool (CEJST v2.0). Note that CEJST uses 2010 census tract boundaries; alignment with 2020 boundaries is approximate.

6. **Peak reduction (7.5 kW per home)** is based on: typical electric resistance draw of ~12.5 kW on design day for a 1,700 sq ft home, minus Quilt's maximum draw of 5.0 kW at the same conditions. This is validated by ResStock modeling showing average baseline peak heating demand of X kW for electric resistance homes in PGE territory.
