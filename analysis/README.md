# Analysis

Everything needed to check the harmonization results in the main README.

| File | What it is |
|---|---|
| `check_results.py` | Rebuilds the results and robustness tables from the two CSVs below. Needs `numpy` and `scipy`. |
| `monthly_overlap.csv` | 168 months, Feb 2012 – Jan 2026: MODIS and VIIRS active cell-days, MODIS cell-days in three FRP bands, the 1.84× estimate and the FRP ensemble estimate. `role` marks the 2013–2016 fitting seasons. |
| `weekly_overlap.csv` | Weekly MODIS and VIIRS active cell-days. Full weeks from the fitting seasons give the 1.84 factor. |
| `harmonization_frp_ensemble.ipynb` | Full pipeline from the NASA FIRMS archives: filters, local dates, 2 km grid, cell-days, fitting, evaluation and exports. Raw archives are not included. |
| `calibration_model.json` | Model card: coefficients, FRP bands, fit period, grid, time zone, study box, source files and validation scores. |
| `per_season_metrics.csv` | Error per season for the 1.84 factor, FRP-only and the ensemble. |
| `model_comparison.csv` | The three methods compared by test group and time step. |

```bash
pip install numpy scipy
python check_results.py
```

Expected output: 44.48% raw MODIS → 11.51% with ×1.84 → **9.94%** with the FRP ensemble on the 120 months outside fitting; 10.93% leave-one-season-out; 11.69% forward; 7.5–8.3% time-reversed.
