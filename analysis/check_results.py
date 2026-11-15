"""Reproduce the headline numbers of the Pantanal MODIS -> VIIRS (S-NPP) harmonization.

Inputs (in this folder):
  monthly_overlap.csv  168 months, Feb 2012 - Jan 2026, with MODIS, VIIRS and MODIS FRP bands
  weekly_overlap.csv   weekly MODIS and VIIRS counts, used to fit the 1.84 multiplier

Run:  python check_results.py        (needs numpy and scipy)

Metric: weighted absolute error (WAE) = sum |estimate - VIIRS| / sum VIIRS, in percent.
"""
import csv
from fractions import Fraction
from pathlib import Path

import numpy as np
from scipy.optimize import linprog

HERE = Path(__file__).resolve().parent
FIT = [2013, 2014, 2015, 2016]          # seasons used to fit the official model
SEASONS = list(range(2012, 2026))       # season 2012 = Feb 2012 - Jan 2013


def season_of(label):
    return int(label.split("-")[0])


months = {s: [] for s in SEASONS}
for r in csv.DictReader(open(HERE / "monthly_overlap.csv")):
    months[season_of(r["season"])].append((
        int(r["modis_cell_days"]), int(r["snpp_cell_days"]),
        [int(r["frp_low_cell_days"]), int(r["frp_medium_cell_days"]), int(r["frp_high_cell_days"])],
    ))

weeks = {s: [] for s in SEASONS}
for r in csv.DictReader(open(HERE / "weekly_overlap.csv")):
    if r["is_partial_week"] == "False":
        weeks[season_of(r["season"])].append((int(r["modis_cell_days"]), int(r["snpp_cell_days"])))


def fit_multiplier(seasons):
    """Weighted median of VIIRS/MODIS over full weeks = least absolute error multiplier."""
    ratios = sorted((Fraction(v, m), m) for s in seasons for m, v in weeks[s] if m > 0)
    remaining = sum(w for _, w in ratios)
    for ratio, w in ratios:
        remaining -= 2 * w
        if remaining <= 0:
            return float(ratio)


def fit_frp(seasons):
    """Three non-negative FRP-band coefficients (0-6) minimising monthly absolute error."""
    X = np.array([b for s in seasons for _, _, b in months[s]], float)
    y = np.array([v for s in seasons for _, v, _ in months[s]], float)
    n = len(y)
    res = linprog(np.r_[np.zeros(3), np.ones(n)],
                  A_ub=np.block([[X, -np.eye(n)], [-X, -np.eye(n)]]), b_ub=np.r_[y, -y],
                  bounds=[(0, 6)] * 3 + [(0, None)] * n)
    return res.x[:3]


def wae(seasons, predict):
    err = obs = 0.0
    for s in seasons:
        for m, v, b in months[s]:
            err += abs(predict(m, b) - v)
            obs += v
    return 100 * err / obs


def ensemble(k, c):
    return lambda m, b: 0.5 * k * m + 0.5 * float(np.dot(c, b))


k, c = fit_multiplier(FIT), fit_frp(FIT)
outside = [s for s in SEASONS if s not in FIT]
later = list(range(2018, 2026))
print(f"Official model (fit {FIT[0]}-{FIT[-1]}): multiplier {k:.2f}, FRP coefficients {np.round(c, 4)}")
print()
print(f"{'Test':52s}{'raw MODIS':>11s}{'x1.84':>9s}{'ensemble':>10s}")
for name, ss in [("Outside fitting, 10 seasons / 120 months", outside),
                 ("Later seasons 2018-2025, 96 months", later),
                 ("All 168 months, including fitting", SEASONS)]:
    print(f"{name:52s}{wae(ss, lambda m, b: m):10.2f}%{wae(ss, lambda m, b: k * m):8.2f}%{wae(ss, ensemble(k, c)):9.2f}%")

print("\nRobustness (the whole method is refitted each time)")
err = obs = 0.0
for s in SEASONS:
    train = [t for t in SEASONS if t != s]
    p = ensemble(fit_multiplier(train), fit_frp(train))
    for m, v, b in months[s]:
        err += abs(p(m, b) - v); obs += v
print(f"  Leave one season out, 14 folds:               {100 * err / obs:6.2f}%")
err = obs = 0.0
for s in range(2017, 2026):
    train = list(range(2012, s))
    p = ensemble(fit_multiplier(train), fit_frp(train))
    for m, v, b in months[s]:
        err += abs(p(m, b) - v); obs += v
print(f"  Forward: train on past seasons, predict next:  {100 * err / obs:6.2f}%")
for train, test in [(range(2017, 2026), range(2012, 2017)), (range(2020, 2026), range(2012, 2020)),
                    (range(2016, 2026), range(2012, 2016))]:
    train, test = list(train), list(test)
    p = ensemble(fit_multiplier(train), fit_frp(train))
    print(f"  Backward: train {train[0]}-{train[-1]}, test {test[0]}-{test[-1]}:        {wae(test, p):6.2f}%")
