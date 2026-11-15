# Analysis

Everything needed to check the harmonization results in the main README.

| File | What it is |
|---|---|
| `check_results.py` | Rebuilds the results and robustness tables from the two CSVs below. Needs `numpy` and `scipy`. |
| `monthly_overlap.csv` | 168 months, Feb 2012 – Jan 2026: MODIS and VIIRS active cell-days, MODIS cell-days in three FRP bands, the 1.84× estimate and the FRP ensemble estimate. `role` marks the 2013–2016 fitting seasons. |
| `weekly_overlap.csv` | Weekly MODIS and VIIRS active cell-days. Full weeks from the fitting seasons give the 1.84 factor. |
| `pantanal_monthly_2003_2026.csv` | **The final record.** All 276 months, Feb 2003 – Jan 2026: observed MODIS (Aqua, Terra, merged), observed VIIRS, the FRP ensemble (from Feb 2012), the 1.84× scalar for every month, two FRP band counts, and the value the dashboard shows. |
| `harmonization_frp_ensemble.ipynb` | Full pipeline from the NASA FIRMS archives, 2012–2026: filters, local dates, 2 km grid, cell-days, fitting, evaluation and exports. Every step has a short explanation and the code is commented. Raw archives are not included. |
| `modis_backfill_2003_2012.ipynb` | MODIS cleaning and monthly counts for Feb 2003 – Jan 2012, with the same study box, filters, local dates and 2 km grid as the main notebook. |
| `modis_backfill_monthly.csv` | Its output: 108 months of Aqua, Terra and merged MODIS cell-days. |
| `calibration_model.json` | Model card: coefficients, FRP bands, fit period, grid, time zone, study box, source files and validation scores. |
| `per_season_metrics.csv` | Error per season for the 1.84 factor, FRP-only and the ensemble. |
| `model_comparison.csv` | The three methods compared by test group and time step. |

```bash
pip install numpy scipy
python check_results.py
```

Expected output: 44.48% raw MODIS → 11.51% with ×1.84 → **9.94%** with the FRP ensemble on the 120 months outside fitting; 10.93% leave-one-season-out; 11.69% forward; 7.5–8.3% time-reversed.
