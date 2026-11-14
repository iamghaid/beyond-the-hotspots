# Beyond the Hotspots

Pantanal burning activity calendar.

A web calendar of monthly satellite burning activity for the Pantanal study area (58°W–56°W, 19.5°S–17°S), February 2012 – January 2018.

It answers one question: **after harmonization, do MODIS records tell the same story as Suomi NPP VIIRS?** Switch the calendar between VIIRS, raw MODIS and harmonized MODIS to see which months stay "above usual".

NASA Space Apps Challenge 2026 · The Kernel team.

## What's on the page

- **Calendar:** years by month, colored by active cell-days, with a source switch.
- **Month detail:** observed value, median of the same month in the five prior years, difference, coverage.
- **Three sources over time:** VIIRS, raw MODIS and harmonized MODIS (estimate), with a date range and a table view.
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

An active cell-day is a 2 km grid cell (EPSG:6933) with at least one qualifying detection on one local day (America/Cuiaba). It measures burning activity, not the number of fires. Harmonized MODIS = combined Terra and Aqua cell-days × 1.84. Observation coverage is unverified and VIIRS hotspot type is provisional.

Source: [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/download/).
