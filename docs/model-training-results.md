# Promotion-prediction model: training, comparison, and integration

This is the engineering record for the ML component the compliance matrix (`Papers/Matrix_of_Compliance_revised.docx`)
repeatedly flagged as outstanding: no training had actually been run, and the three
`/api/faculty/{analysis/feature-selection, models/compare, predictions/generate}` routes were
hard-coded `503` stubs. That is now a real, trained, cross-verified, and integrated model. This
document is deliberately plain about what the data is and is not.

## Dataset: synthetic, policy-grounded, disclosed

There is no usable real-world training set in the live system: as of 2026-11-20 the
`training_examples` table holds 9 rows (2 labeled, 1 validated), and `FacultyProfile.promotion`
is null for every one of the 122 real/synthetic profiles. `TQE.csv`, previously cited in the
manuscript as the training data, does not carry a promotion-outcome label at all — its
`Teaching_Quality` column is a 3-way category (`Good`/`Excellent`/`Average`, see
`scripts/synthetic` vs. `TQE.csv`), not the binary `Promoted`/`Not Promoted` target the panel
required in good faith (compliance matrix item 5).

So the dataset used here (`scripts/ml/build-training-dataset.ts` → `data/ml/promotion_training_dataset.csv`,
1,000 rows, 700/150/150 train/validation/test) is built, not collected:

- **Features** come from the deterministic synthetic-faculty generator already used for the
  project's OCR scoring-accuracy study (`scripts/synthetic/build.ts`), run through the real
  OCR-era document-analysis pipeline (`analyzeDocumentContent` / `buildDraftPointSummary`) on
  the *observed* (noisy, OCR'd) evidence — the same quantities the live dashboard computes for
  a real profile today.
- **Labels** come from applying the system's own real NBC 461 / DBM-JC rank rule engine
  (`buildDraftPointSummary` again, this time on the *true* evidence) to get the ground-truth
  outcome: `labelPromoted = (subrankIncrements ?? 0) > 0`, the exact definition production
  already uses for evaluator-approved cases (`src/controllers/training.controller.ts`).

This means the model's job is genuinely predictive, not circular: it has to recover the true
rule-engine outcome from the *imperfect, OCR-derived* signal the system currently extracts
before a document ever reaches a human evaluator — not from the ground truth itself.

**Disclosure.** Per the project's existing norm for synthetic data
(`docs/synthetic-dataset.md`), this is a reproducible synthetic dataset, not a record of real
historical promotions, and must be disclosed as such anywhere it is cited (including Chapter
III/IV text).

## Models trained

`scripts/ml/train_models.py`, with `sample_weight` balanced for the ~88/12 class split:

| Model | Accuracy | Precision | Recall | F1 | ROC-AUC | EOD (sex) |
|---|---|---|---|---|---|---|
| Logistic Regression (baseline) | 92.0% | 100.0% | 91.0% | 95.3% | 99.4% | 0.067 |
| Decision Tree (baseline) | 94.7% | 99.2% | 94.8% | 97.0% | 95.8% | 0.025 |
| AdaBoost (SAMME, depth-1 stumps) | 96.7% | 100.0% | 96.3% | 98.1% | 100.0% | 0.031 |
| Gradient Boosting | 98.0% | 100.0% | 97.8% | 98.9% | 99.7% | 0.006 |
| **XGBoost (winner)** | **98.0%** | **100.0%** | **97.8%** | **98.9%** | **99.9%** | **0.006** |

Primary metric is **Recall** (compliance matrix item 11); ROC-AUC and Accuracy are the
tie-breaks. XGBoost and Gradient Boosting tied on Recall; XGBoost won on ROC-AUC. Full
per-model confusion matrices are in `data/ml/model_comparison.json` (also what
`POST /api/faculty/models/compare` now serves).

**Fairness.** Equal Opportunity Difference, |TPR(male) − TPR(female)| on the held-out test set,
is 0.6 percentage points for the winning model — i.e. no material gap by sex in this synthetic
cohort, with the usual caveat that this is one synthetic, policy-driven dataset, not a
measurement of real institutional outcomes.

**Why accuracy is high.** The label is a deterministic function of true evidence under NBC 461;
the model only has to recover it from noisy *observed* evidence, so near-ceiling performance
reflects that the OCR pipeline's noise is the dataset's only real source of difficulty — not
that the task is trivial or the numbers are invented. This should be stated plainly if these
figures are used in Chapter IV, alongside the dataset's synthetic-data disclosure above.

## Integration: XGBoost, exported as plain-JSON trees, run natively in Node

The backend deploys as a Vercel Node serverless function (`api/index.ts` → `src/app.ts`); there
is no Python runtime at request time. Rather than shipping a Python microservice or an
ONNX/native-binary dependency, the winning model is exported as a portable, dependency-free
JSON ensemble of regression trees (`models/promotion-model.json`,
`scripts/ml/train_models.py:export_xgboost`), and `src/services/model.service.ts` evaluates it
with ~60 lines of plain tree-traversal + sigmoid — no Python, no extra native deps, safe inside
Vercel's function bundle (`vercel.json` now includes `models/*.json` and
`data/ml/model_comparison.json` in `includeFiles`).

**Verification, not assertion.** `scripts/ml/train_models.py` itself diffs the exported tree
walk against the live `XGBClassifier.predict_proba()` on the test split (XGBoost stores split
thresholds as float32, so there is a small expected numerical drift — max observed
|Δprobability| ≈ 0.067 on one borderline row); `scripts/ml/verify-ts-inference.ts` repeats the
same comparison from the TypeScript side against `data/ml/test_predictions_reference.json`. As
of this writing: **0 / 150 classification disagreements** between the trained Python model and
the deployed TypeScript inference code, on the held-out test set.

## What actually changed in `src/`

- `src/services/model.service.ts` (new) — loads `models/promotion-model.json` once, evaluates
  it, and builds the feature vector for a real `FacultyProfile` from the same
  `buildDraftPointSummary()` output the dashboard and evaluator-approval flow already compute
  (`buildFeatureVectorFromDraftPoints`), so training and live inference share one feature
  pipeline.
- `src/controllers/faculty.controller.ts` — `featureSelection`, `compareModels`, and
  `generatePredictions` are no longer hard-coded `503`s. They now report `503` only when
  `models/promotion-model.json` genuinely has not been generated (fresh checkout before running
  `scripts/ml/train_models.py`), rather than unconditionally.
  - `generatePredictions` loads the caller's profile (an `EMPLOYEE` may only generate for their
    own profile; `EVALUATOR`/`ADMIN` may generate for any), runs the model, **writes a row to
    `predictions`**, and returns both the ML probability/class *and* the separate rule-based
    draft (`weightedScore`, `scoreBracket`, `suggestedRank`, `status`) side by side — keeping
    the rule-engine score (authoritative, evaluator-reviewed) and the ML output (an advisory,
    explainable signal) explicitly distinct, per compliance matrix item 8.
  - `compareModels` serves the real, already-computed comparison table (not a live retrain on
    every request).
  - `featureSelection` serves the winning model's real feature importances.
- `scripts/synthetic/build.ts` / `evaluate.ts` — `SyntheticFaculty` now also carries `sex`
  (needed for the EOD fairness check), and `observedMetadata` is exported for reuse by the
  dataset builder.

## Reproducing this

```bash
npx tsx scripts/ml/build-training-dataset.ts 1000000 1000   # writes data/ml/promotion_training_dataset.csv
python scripts/ml/train_models.py                            # writes models/promotion-model.json, data/ml/model_comparison.json
npx tsx scripts/ml/verify-ts-inference.ts                     # cross-checks the TS port against the Python model
npm test                                                      # includes test/modelService.test.ts
```

## Honest limitations, for whoever writes Chapter IV from this

1. **Not real historical promotions.** No real promotion-outcome dataset exists in the live
   system. This is disclosed, reproducible, synthetic data, grounded in the actual rule engine.
2. **One seed, one run.** Metrics above are a single train/validation/test split at `seed=1000000`,
   not a cross-validated estimate with confidence intervals.
3. **EOD uses sex only.** No other protected attribute (e.g. college/department) was tested for
   subgroup disparities.
4. **The 100-faculty live synthetic cohort (`docs/synthetic-faculty-registry.md`) was not used
   here.** It is real (loaded into the shared dev/prod database) but far too small on its own,
   and this dataset is a separate, larger, purely offline generation (never written to the
   database) so the two must not be conflated.
5. **XGBoost export has ~0.07 max probability drift** from float32 split-threshold rounding;
   classification decisions are unaffected on the test set (verified above), but a probability
   quoted to more than ~1 decimal place should note this.
