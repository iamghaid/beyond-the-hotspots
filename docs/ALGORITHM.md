# The Kernel’s Pantanal MODIS–VIIRS harmonization algorithm

## Overview

We estimate the number of active cell-days that **Suomi NPP VIIRS (S-NPP)** would report given **MODIS Aqua + Terra** observations. We learn two conversions from periods with both products. The first scales the total MODIS count by one factor. The second gives separate weights to MODIS counts in three fire radiative power (FRP) bands. The final estimate is the arithmetic mean of those two predictions.

**ملخص بالعربية**  
نقدّر نشاط الحرائق على مقياس VIIRS انطلاقًا من بيانات MODIS، باستخدام فترات تتوافر فيها بيانات المستشعرين لضبط نموذجين يقلّلان الخطأ المطلق. يطبّق الأول معاملًا واحدًا على إجمالي عدد الخلايا النشطة يوميًا، ويعطي الثاني ثلاثة أوزان بحسب القدرة الإشعاعية للحريق، ثم نأخذ متوسط التقديرين بالتساوي.

## Inputs and scope

We use the NASA FIRMS standard archive for MODIS Collection 6.1 active-fire detections from Aqua and Terra and VIIRS Collection 2 375 m active-fire detections from Suomi NPP. MODIS has a nominal 1 km active-fire pixel, while the VIIRS product uses nominal 375 m pixels. We aggregate both onto the same grid before estimating the relationship between their observed counts. [NASA FIRMS product overview](https://www.earthdata.nasa.gov/s3fs-public/2023-03/FIRMS_OnePager_2022_Prnt-Web.pdf?VersionId=1.pHw_vC487jLkt_aDy.bMvHQxDFC44f)

| Setting | Value |
| --- | --- |
| Study rectangle, WGS 84 | West 58°W, south 19.5°S, east 56°W, north 17°S |
| Local calendar | `America/Cuiaba` |
| Common grid | 2,000 m × 2,000 m in the EPSG:6933 equal-area projection |
| Paired MODIS and S-NPP record | February 2012 through January 2026, covering 14 seasons and 168 months |
| Earlier MODIS record | February 2003 through January 2012, covering 9 seasons and 108 months |
| Season definition | February 1 through January 31 of the following year |

## 1. Filter and standardize the records

1. Validate the source CSV schema, satellite and product labels, coordinates, and acquisition timestamps. Remove exact duplicate records within the input CSV.
2. Parse the FIRMS acquisition date and time in UTC. Pad the time to four digits before parsing, convert it to `America/Cuiaba`, and use the resulting local calendar date. This date determines the season for historical detections near the February boundary.
3. Keep detection centers inside the study rectangle, including its boundaries. Keep hotspot type `0`, the presumed vegetation-fire class. Require MODIS confidence of at least `30` on its 0–100 scale. For S-NPP VIIRS, require nominal (`n`) or high (`h`) confidence. The export marks the VIIRS type classification as provisional.
4. Project each retained WGS 84 detection center to EPSG:6933. If its projected easting and northing are $x$ and $y$ in meters, assign the cell index as `(floor(x / 2000), floor(y / 2000))`. The notebooks validate that qualifying MODIS FRP values are finite and nonnegative.

[FIRMS detection notes](https://firms.modaps.eosdis.nasa.gov/alerts/notes.php) · [Release notebook, Sections 2–4](../analysis/harmonization_frp_ensemble.ipynb)

## 2. Build daily counts and FRP features

An **active cell-day** is one grid cell on one local date with at least one qualifying detection. For each satellite, group on `(local_date, cell_x, cell_y)` and count each group once. For the combined MODIS total, take the **union** of Aqua and Terra cell-days. If both observe the same cell on the same date, it contributes one combined MODIS cell-day and one to each satellite’s individual count. If the same cell is active the following day, it contributes another cell-day. Count S-NPP VIIRS separately using the same grid and date rule.

For each combined MODIS cell-day, take the **largest FRP value across all qualifying Aqua and Terra detections** in that cell on that date. FRP is fire radiative power in megawatts (MW). The maximum assigns the cell-day to exactly one band.

| Symbol | FRP band | Maximum FRP per MODIS cell-day |
| --- | --- | --- |
| $L$ | Low | $0 \leq \mathrm{FRP} \lt 10$ MW |
| $M$ | Medium | $10 \leq \mathrm{FRP} \lt 50$ MW |
| $H$ | High | $\mathrm{FRP} \geq 50$ MW |

Record zero observed counts for calendar days with no qualifying detections. Sum daily counts independently into calendar months and Monday–Sunday weeks. Keep the actual date boundaries for weeks clipped by a season boundary and flag them as partial. Across the paired record, the aggregation produces **168 monthly rows and 742 weekly rows**, of which **718 are full weeks** and **24 are partial weeks**. Each period has total MODIS count $T=L+M+H$ and observed S-NPP count $V$.

[Release notebook, Sections 5–6](../analysis/harmonization_frp_ensemble.ipynb)

## 3. Fit the single multiplier on full weeks

Choose the multiplier $k$ to minimize the sum of absolute deviations between scaled MODIS counts and observed S-NPP counts across the full training weeks. Here $T_w$ and $V_w$ are the MODIS and S-NPP counts for week $w$.

$$
k^* = \operatorname*{arg\,min}_{k} \sum_w |k T_w - V_w|
$$

For a week with $T_w > 0$, the error can be written as $T_w |k - V_w/T_w|$. The minimizer is therefore a **weighted median** of the ratios $V_w/T_w$, with each ratio weighted by $T_w$. The notebook sorts the ratios and selects the first one for which cumulative weight reaches at least half the total. A week with $T_w=0$ contributes the constant $V_w$ for every $k$. With the fitted value, the baseline estimate for any reporting period $t$ is $kT_t$.

## 4. Fit the three FRP weights on months

For the training months in the same fitting seasons, fit three coefficients to the low, medium, and high MODIS FRP counts. The **least absolute deviations** fit uses a zero intercept and constrains each coefficient to the interval $[0,6]$.

$$
\boldsymbol{\beta}^* =
\operatorname*{arg\,min}_{\boldsymbol{\beta}\in[0,6]^3}
\sum_m |\beta_L L_m + \beta_M M_m + \beta_H H_m - V_m|
$$

The notebook expresses the objective as a linear program. It gives each training month $m$ a nonnegative auxiliary variable $u_m$ that is at least as large as its residual in either direction. With $r_m=\beta_L L_m+\beta_M M_m+\beta_H H_m-V_m$, the constraints are $u_m\geq r_m$ and $u_m\geq -r_m$. Minimizing $\sum_m u_m$ gives the bounded least-absolute-deviations fit. We solve it with `scipy.optimize.linprog(method="highs")`. [Release notebook, Section 6](../analysis/harmonization_frp_ensemble.ipynb) · [SciPy HiGHS documentation](https://docs.scipy.org/doc/scipy/reference/optimize.linprog-highs.html)

## 5. Generate the harmonized estimate

Use the chosen release’s fitted coefficients to compute and average the two estimates. Each component receives a fixed weight of 0.5.

$$
\widehat{V}_t = 0.5\,kT_t + 0.5\,(\beta_L L_t + \beta_M M_t + \beta_H H_t)
$$

Apply the same equation to the matching MODIS counts for a week or month. S-NPP supplies the observed target for fitting and evaluation. After fitting, the prediction takes only MODIS counts and the stored coefficients. A fractional result represents an estimated number of **S-NPP-equivalent active cell-days**.

### Fitted releases

| Release | Fitting window | Full weeks | Months | $k$ | $\beta_L$ | $\beta_M$ | $\beta_H$ |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Website handoff | February 2013–January 2017 | 206 | 48 | 1.84000000 | 1.14223748 | 2.42450660 | 0.95230674 |
| Full-overlap historical refit | February 2012–January 2026 | 718 | 168 | 1.75862069 | 1.10013967 | 2.36439668 | 1.18983784 |

The website handoff provides observed MODIS for the 108 earlier months and switches its display metric to the ensemble estimate from February 2012 onward. The full-overlap refit uses all 14 paired seasons to fit the same model, then applies those fitted coefficients to both the overlap and the earlier MODIS months. It has historical estimates for **106 of 108 months**. January 2007 and March 2011 had zero qualifying MODIS cell-days and have blank estimates. [Website coefficients](../analysis/calibration_model.json)
### Worked example · February 2012

MODIS counted **57 active cell-days** in February 2012. Of those, **8** were in the low FRP band, **39** were in the medium band, and **10** were in the high band. With the website-handoff coefficients, the calculation is as follows.

```text
Single multiplier = 1.84 × 57                                  = 104.88000
FRP-band estimate = 1.14223748 × 8 + 2.42450660 × 39
                  + 0.95230674 × 10                            ≈ 113.21672
Ensemble estimate = (104.88000 + 113.21672) / 2                ≈ 109.04836
```

S-NPP actually counted **104** active cell-days, so the website estimate was about **5.05 cell-days higher**. February 2012 was outside the website model’s fitting window. The full-overlap refit includes February 2012 in fitting and produces **106.576173** for the same inputs. [Website February 2012 export](../analysis/monthly_overlap.csv)

## 6. Evaluate agreement with S-NPP

For each evaluation group and time grain, let $e_t=\widehat{V}_t-V_t$. The project reports weighted absolute error (WAE), mean absolute error (MAE), and signed percentage bias.

| Metric | Calculation | Interpretation |
| --- | --- | --- |
| WAE | `100 × sum(abs(e)) / sum(V)` | Total absolute error relative to total observed S-NPP activity |
| MAE | `mean(abs(e))` | Average absolute error, in cell-days per period |
| Signed bias | `100 × sum(e) / sum(V)` | Positive for net overestimation, negative for net underestimation |

WAE pools the errors and observed counts across the group before dividing. Full-week scoring excludes partial weeks and includes weeks with zero MODIS activity using the model’s prediction of zero. Monthly scoring uses all months in each evaluation group.

| Evaluation | Monthly ensemble WAE | Full-week ensemble WAE |
| --- | ---: | ---: |
| Website handoff, periods outside coefficient fitting | **9.94%** on 120 months | **14.81%** on 512 weeks |
| Full-overlap fit, assessed on the data used to fit it | 10.08% on 168 months | 15.11% on 718 weeks |
| Leave-one-season-out cross-validation | **10.93%** on 168 months | **15.46%** on 718 weeks |

The website evaluation covers February 2012–January 2013 and February 2017–January 2026. For leave-one-season-out cross-validation, we held out each of the 14 seasons in turn, fitted both components on the other 13, and pooled the predictions across the held-out seasons. Unadjusted MODIS had **44.85% monthly WAE** across those 168 months. The ensemble had the lowest pooled cross-validation WAE of the three fitted alternatives at both time grains. The FRP-only model had lower monthly WAE in both contiguous-block tests. [Website model comparison](../analysis/model_comparison.csv)

## 7. Interpret the exports

| Field | Meaning |
| --- | --- |
| `modis_cell_days` | Observed Aqua + Terra union count |
| `snpp_cell_days` | Observed S-NPP count, blank before February 2012 in the historical series |
| `calibrated_modis_cell_days` | Final 50/50 estimate on the S-NPP scale |
| `baseline_calibrated_modis_cell_days` | Single-multiplier estimate where this diagnostic is exported |
| `small_fire_cell_days`, `large_fire_cell_days` | Low- and high-FRP cell-day counts. The names describe radiative power bands. |
| `medium_frp_cell_days` | Medium-FRP count, stored in the combined refit export. In files that omit it, compute it as total MODIS minus low and high. |

The seasonal exports leave estimates blank for partial weeks and periods with zero qualifying MODIS cell-days. In those zero-MODIS periods the equation evaluates to zero, which is the value used when scoring eligible periods. An observed zero indicates zero qualifying detections in the supplied records. A blank estimate indicates an unavailable published value. Use the monthly rows directly because reporting weeks can cross month boundaries. [Website integration guide](../README.md)

The results measure retrospective agreement with S-NPP in the Pantanal study rectangle. The paired periods had been examined during model development, satellite observation coverage is unverified, and historical estimates before February 2012 lack paired S-NPP observations for direct validation. The method models detected activity at the cell-day level. Estimating distinct fires, burned area, or agreement with ground observations would require separate evidence.

## What the team built

The team implemented a **custom harmonization pipeline for the Pantanal**. NASA FIRMS supplies the upstream hotspot detections. The project code defines the study grid, local-day counting and deduplication, the maximum-FRP feature and its three bands, the weekly and monthly fitting objectives, and the 50/50 combination. Weighted medians, least absolute deviations, and the SciPy/HiGHS optimizer are established statistical and numerical tools. The project-specific work is the design of the complete workflow and its calibration to these observations.

## Reproduce the outputs

- **Website handoff calibration.** Open the [release notebook](../analysis/harmonization_frp_ensemble.ipynb) and run it with the paired FIRMS inputs in `NEWDATA` and `PILOT_ONLY = False`. Use `INPUT_PATH` and `TRANSFER_DIR` to identify the data if auto-discovery is ambiguous. The notebook writes the seasonal CSVs, calibration JSON, comparison tables, and output ZIP. The [website handoff guide](../README.md) documents the calendar JSON.
- **Historical refit.** The full-overlap refit notebook (kept by the analyst, not included in this repository) runs with all 14 paired seasons in `NEWDATA` and the nine original MODIS ZIPs in `backfill`. Set `BACKFILL_DIR` if the historical ZIPs are stored elsewhere. The notebook writes the 276-month series, seasonal CSVs, model metadata, and source audit.
- **Runtime.** Both notebooks use Python 3.11 or later, NumPy, pandas, SciPy, pyproj, and IANA timezone data.
