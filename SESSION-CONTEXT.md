# Capacity Explorer — Session Context

## Current State (Feb 6, 2026)

### Phase 1: COMPLETE
- Project scaffolded: Vite 6 + React 19 + TypeScript + Tailwind CSS v4 + react-map-gl v8
- Data pipeline built and run:
  - `scripts/fetch-census-data.mjs` — pulls ACS 5-Year data from Census API
  - `scripts/build-territory.mjs` — downloads tract boundaries from TIGERweb, merges with census data, outputs GeoJSON with Douglas-Peucker simplification
  - Output: `public/data/pge-oregon/tracts.geojson` — 529 tracts, 0.5 MB
- Type system: `TractProperties`, `TerritoryConfig`, `SelectionSummary`, etc.
- Config: PGE territory config, Quilt specs, data center locations
- Calculations engine: pure functions for all market sizing math
- Map: Mapbox GL choropleth with 4 metric options, data center markers, hover tooltip, click-to-select
- Sidebar: Tabbed panel (Market Size | Program | AI Chat), county filter, selection management
- Market Sizing Panel: Territory aggregates with dynamic updates
- **Production build succeeds** (227 KB app bundle + 0.5 MB GeoJSON)

### Data Summary
- 529 census tracts across 7 Oregon counties
- 960,053 total households
- 470,351 electric-heated homes (49%)
- 376,292 estimated ER homes (80% adjustment factor)
- 2,634 MW peak capacity freed
- Counties: Washington (134), Multnomah (197), Clackamas (87), Marion (65), Yamhill (19), Polk (16), Columbia (11)

### Phase 2: PENDING (Feb 8)
- Tract click selection with shift-click multi-select
- Program Simulator with sliders + economics
- Comparison bar chart (Quilt vs peaker vs battery vs transmission)
- Layer toggles for metrics

### Phase 3: PENDING (Feb 9)
- AI Chat via Vercel serverless function
- Visual polish pass
- Methodology modal

### Phase 4: PENDING (Feb 10)
- Vercel deployment
- Demo polish

## Prerequisites Still Needed from Bill
1. **Mapbox token** — Create `.env.local` with `VITE_MAPBOX_TOKEN=pk...`
2. **Anthropic API key** — For Phase 3 chat feature
3. **Vercel account** — For Phase 4 deployment

## Key Files
- `src/App.tsx` — Main app component
- `src/components/map/TerritoryMap.tsx` — Choropleth map
- `src/components/panels/MarketSizingPanel.tsx` — Market sizing
- `src/lib/calculations.ts` — All math functions
- `src/config/territories.ts` — PGE territory config
- `scripts/fetch-census-data.mjs` — Census API data pull
- `scripts/build-territory.mjs` — GeoJSON builder

## Commands
```bash
npm run dev           # Start dev server
npm run build         # Production build
npm run fetch-data    # Re-fetch census data
npm run build-territory  # Rebuild GeoJSON
```
