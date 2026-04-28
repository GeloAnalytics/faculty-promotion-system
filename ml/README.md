# Objective 305 Offline Training Workflow

This folder contains the first offline scaffolding for objective 305.

## Steps

1. Install Python dependencies:

```bash
pip install -r ml/requirements.txt
```

2. Export labeled and validated training examples from PostgreSQL:

```bash
npm run ml:export-dataset
```

Default output:

`data/exports/objective-305-training-dataset.csv`

3. Train and compare the three boosting models:

```bash
npm run ml:train-boosting
```

Optional flags:

```bash
python ml/train_boosting_models.py --cv-folds 5 --small-dataset-threshold 60
```

## Outputs

- Validation metrics CSV: `ml/reports/<timestamp>/validation_metrics.csv`
- Cross-validation metrics CSV: `ml/reports/<timestamp>/cross_validation_metrics.csv`
- Experiment summary JSON: `ml/reports/<timestamp>/experiment_summary.json`
- Test confusion matrix CSV: `ml/reports/<timestamp>/test_confusion_matrix.csv`
- Global feature importance CSV: `ml/reports/<timestamp>/feature_importance.csv`
- Permutation importance CSV: `ml/reports/<timestamp>/permutation_importance.csv`
- Global SHAP importance CSV: `ml/reports/<timestamp>/global_shap_importance.csv`
- Test-set local SHAP explanation CSV: `ml/reports/<timestamp>/local_shap_explanations_test.csv`
- Best model artifact: `ml/artifacts/<timestamp>/best_model.joblib`
- Feature schema copy: `ml/artifacts/<timestamp>/feature_columns.json`
- Training metadata JSON: `ml/artifacts/<timestamp>/training_metadata.json`

## Notes

- The export script only includes `LABELED` and `VALIDATED` examples with non-null `labelPromoted`.
- The training script uses the shared 12-feature schema from the app for fair model comparison.
- If the dataset is small, the script also records stratified cross-validation metrics to support Objective 4 reporting.
- The SHAP outputs are the first real Objective 5 preparation artifacts for global and per-record interpretability.
- Live inference endpoints remain disabled; this workflow is intentionally offline and reproducible.
