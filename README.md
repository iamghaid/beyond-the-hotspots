# Beyond the Hotspots

Pantanal burning activity calendar.

A web calendar of monthly satellite burning activity for a Pantanal study area (58°W–56°W, 19.5°S–17°S), February 2003 – January 2026: 108 MODIS-only months and 168 months with observed MODIS, observed VIIRS (S-NPP) and harmonized MODIS on the VIIRS scale.

It answers one question: **after harmonization, do MODIS records tell the same story as Suomi NPP VIIRS?** Across 120 months held out from fitting, weighted absolute error against observed VIIRS (S-NPP) fell from 44.48% (raw MODIS) to 11.51% with a fixed 1.84× factor, and to 9.94% with the FRP ensemble, which adds MODIS fire intensity.

NASA Space Apps Challenge 2026 · The Kernel team.

## What's on the page

- **Calendar:** years by month, colored by active cell-days, with a source switch.
- **Month detail:** observed value, median of the same month in the five prior years, difference, coverage.
- **Three sources over time:** VIIRS, raw MODIS and harmonized MODIS, with a date range and a table view.
- **2017 test year:** which months each method calls above usual, compared with VIIRS.
- **Map** of the study area and **CSV download** of the selected months.

## Run locally

It's a static site with no build step.

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Data

`monthly.json` holds the 72 monthly rows used by the page, built from the six `harmonized_activity.csv` files supplied by the data lead.

An active cell-day is a 2 km grid cell (EPSG:6933) with at least one qualifying detection on one local day (America/Cuiaba). It measures burning activity, not the number of fires. Harmonized MODIS = FRP ensemble: the average of combined Terra and Aqua cell-days × 1.84 and a calibration on three MODIS fire-radiative-power bands (method pantanal_cell_days_frp_ensemble_v2). Observation coverage is unverified and VIIRS hotspot type is provisional.

Source: [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/download/).
