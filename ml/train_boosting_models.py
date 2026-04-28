import argparse
import json
from datetime import datetime
from pathlib import Path

import joblib
import pandas as pd
import shap
from sklearn.ensemble import AdaBoostClassifier, GradientBoostingClassifier
from sklearn.model_selection import StratifiedKFold, cross_validate, train_test_split
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.inspection import permutation_importance

try:
    from xgboost import XGBClassifier
except ImportError as exc:  # pragma: no cover - dependency check
    raise SystemExit(
        "xgboost is required for objective 305 training. Install dependencies with "
        "`pip install -r ml/requirements.txt`."
    ) from exc


FEATURE_COLUMNS = [
    "age",
    "yearsInService",
    "highestEducationalAttainmentLevel",
    "teachingEffectiveness",
    "researchOutputs",
    "extensionServices",
    "administrativeExperience",
    "professionalDevelopmentHours",
    "ipcrAverage",
    "promotionHistoryCount",
    "documentCompleteness",
    "documentQualityScore",
]


def parse_args() -> argparse.Namespace:
    repo_root = Path(__file__).resolve().parents[1]
    default_dataset = repo_root / "data" / "exports" / "objective-305-training-dataset.csv"
    default_reports_root = repo_root / "ml" / "reports"
    default_artifacts_root = repo_root / "ml" / "artifacts"

    parser = argparse.ArgumentParser(
        description="Train and compare AdaBoost, Gradient Boosting, and XGBoost models for objective 305."
    )
    parser.add_argument("--dataset", type=Path, default=default_dataset)
    parser.add_argument("--reports-dir", type=Path, default=default_reports_root)
    parser.add_argument("--artifacts-dir", type=Path, default=default_artifacts_root)
    parser.add_argument("--random-state", type=int, default=42)
    parser.add_argument("--cv-folds", type=int, default=5)
    parser.add_argument("--small-dataset-threshold", type=int, default=60)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    dataset_path = args.dataset.resolve()

    if not dataset_path.exists():
        raise SystemExit(f"Dataset not found: {dataset_path}")

    df = pd.read_csv(dataset_path)
    required_columns = FEATURE_COLUMNS + ["labelPromoted"]
    missing_columns = [column for column in required_columns if column not in df.columns]
    if missing_columns:
        raise SystemExit(f"Dataset is missing required columns: {', '.join(missing_columns)}")

    if df["labelPromoted"].nunique() < 2:
        raise SystemExit("Training requires at least two label classes in the exported dataset.")

    X = df[FEATURE_COLUMNS].copy()
    y = df["labelPromoted"].astype(int)
    minimum_class_count = int(y.value_counts().min())

    if minimum_class_count < 3:
        raise SystemExit(
            "Training requires at least 3 examples in each label class to support the stratified "
            "train/validation/test split."
        )

    train_frame, temp_frame, y_train, y_temp = train_test_split(
        X,
        y,
        test_size=0.30,
        stratify=y,
        random_state=args.random_state,
    )
    validation_frame, test_frame, y_validation, y_test = train_test_split(
        temp_frame,
        y_temp,
        test_size=0.50,
        stratify=y_temp,
        random_state=args.random_state,
    )

    models = {
        "AdaBoost": AdaBoostClassifier(random_state=args.random_state, n_estimators=200, learning_rate=0.5),
        "GradientBoosting": GradientBoostingClassifier(random_state=args.random_state),
        "XGBoost": XGBClassifier(
            random_state=args.random_state,
            n_estimators=300,
            max_depth=4,
            learning_rate=0.05,
            subsample=0.9,
            colsample_bytree=0.9,
            eval_metric="logloss",
        ),
    }

    results = []
    trained_models = {}
    cv_results = []
    cv_folds = resolve_cv_folds(args.cv_folds, y_train)

    for model_name, model in models.items():
        model.fit(train_frame, y_train)
        validation_metrics = evaluate_model(model, validation_frame, y_validation)
        results.append(
            {
                "model": model_name,
                **flatten_metrics("validation", validation_metrics),
            }
        )
        trained_models[model_name] = model

        if cv_folds >= 2:
            cv_metrics = evaluate_model_with_cross_validation(
                model,
                train_frame,
                y_train,
                cv_folds,
                args.random_state,
            )
            cv_results.append({"model": model_name, "folds": cv_folds, **cv_metrics})

    results_df = pd.DataFrame(results).sort_values(
        by=["validation_f1", "validation_recall", "validation_precision"],
        ascending=False,
    )
    best_model_name = str(results_df.iloc[0]["model"])
    best_model = trained_models[best_model_name]
    test_metrics = evaluate_model(best_model, test_frame, y_test)

    timestamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    report_dir = args.reports_dir.resolve() / timestamp
    artifact_dir = args.artifacts_dir.resolve() / timestamp
    report_dir.mkdir(parents=True, exist_ok=True)
    artifact_dir.mkdir(parents=True, exist_ok=True)

    results_df.to_csv(report_dir / "validation_metrics.csv", index=False)
    if cv_results:
        pd.DataFrame(cv_results).to_csv(report_dir / "cross_validation_metrics.csv", index=False)

    summary = {
        "generatedAtUtc": timestamp,
        "datasetPath": str(dataset_path),
        "rowCount": int(len(df)),
        "featureColumns": FEATURE_COLUMNS,
        "split": {
            "train": int(len(train_frame)),
            "validation": int(len(validation_frame)),
            "test": int(len(test_frame)),
        },
        "classBalance": {
            "train": summarize_labels(y_train),
            "validation": summarize_labels(y_validation),
            "test": summarize_labels(y_test),
        },
        "crossValidation": {
            "enabled": bool(cv_results),
            "folds": cv_folds if cv_results else 0,
            "appliedBecauseDatasetRowsBelowThreshold": bool(len(df) < args.small_dataset_threshold and cv_results),
        },
        "bestModel": best_model_name,
        "validationRanking": results_df.to_dict(orient="records"),
        "crossValidationRanking": cv_results,
        "testMetrics": test_metrics,
    }

    feature_importance_df = build_feature_importance_report(best_model, FEATURE_COLUMNS)
    permutation_importance_df = build_permutation_importance_report(
        best_model,
        test_frame,
        y_test,
        FEATURE_COLUMNS,
        args.random_state,
    )
    shap_report = build_shap_reports(best_model, train_frame, test_frame, y_test, FEATURE_COLUMNS)

    with (report_dir / "experiment_summary.json").open("w", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=2)

    feature_importance_df.to_csv(report_dir / "feature_importance.csv", index=False)
    permutation_importance_df.to_csv(report_dir / "permutation_importance.csv", index=False)
    pd.DataFrame(test_metrics["confusionMatrix"]).to_csv(report_dir / "test_confusion_matrix.csv", index=False, header=False)

    if shap_report["global"] is not None:
        shap_report["global"].to_csv(report_dir / "global_shap_importance.csv", index=False)

    if shap_report["local"] is not None:
        shap_report["local"].to_csv(report_dir / "local_shap_explanations_test.csv", index=False)

    with (artifact_dir / "feature_columns.json").open("w", encoding="utf-8") as handle:
        json.dump(FEATURE_COLUMNS, handle, indent=2)

    joblib.dump(best_model, artifact_dir / "best_model.joblib")
    with (artifact_dir / "training_metadata.json").open("w", encoding="utf-8") as handle:
        json.dump(
            {
                "generatedAtUtc": timestamp,
                "bestModel": best_model_name,
                "datasetPath": str(dataset_path),
                "rowCount": int(len(df)),
                "featureColumns": FEATURE_COLUMNS,
                "randomState": args.random_state,
                "crossValidationFolds": cv_folds if cv_results else 0,
            },
            handle,
            indent=2,
        )

    print(f"Best model: {best_model_name}")
    print(f"Validation report: {report_dir / 'validation_metrics.csv'}")
    if cv_results:
        print(f"Cross-validation report: {report_dir / 'cross_validation_metrics.csv'}")
    print(f"Experiment summary: {report_dir / 'experiment_summary.json'}")
    print(f"Test confusion matrix: {report_dir / 'test_confusion_matrix.csv'}")
    print(f"Feature importance report: {report_dir / 'feature_importance.csv'}")
    print(f"Permutation importance report: {report_dir / 'permutation_importance.csv'}")
    if shap_report["global"] is not None:
        print(f"Global SHAP report: {report_dir / 'global_shap_importance.csv'}")
    if shap_report["local"] is not None:
        print(f"Local SHAP report: {report_dir / 'local_shap_explanations_test.csv'}")
    print(f"Saved artifact: {artifact_dir / 'best_model.joblib'}")
    print(f"Training metadata: {artifact_dir / 'training_metadata.json'}")


def evaluate_model(model, X: pd.DataFrame, y: pd.Series) -> dict:
    predictions = model.predict(X)
    probabilities = model.predict_proba(X)[:, 1]
    matrix = confusion_matrix(y, predictions)

    return {
        "accuracy": float(accuracy_score(y, predictions)),
        "precision": float(precision_score(y, predictions, zero_division=0)),
        "recall": float(recall_score(y, predictions, zero_division=0)),
        "f1": float(f1_score(y, predictions, zero_division=0)),
        "rocAuc": float(roc_auc_score(y, probabilities)),
        "confusionMatrix": matrix.tolist(),
        "support": {
            "negative": int((y == 0).sum()),
            "positive": int((y == 1).sum()),
        },
    }


def flatten_metrics(prefix: str, metrics: dict) -> dict:
    return {
        f"{prefix}_accuracy": metrics["accuracy"],
        f"{prefix}_precision": metrics["precision"],
        f"{prefix}_recall": metrics["recall"],
        f"{prefix}_f1": metrics["f1"],
        f"{prefix}_roc_auc": metrics["rocAuc"],
    }


def summarize_labels(labels: pd.Series) -> dict:
    counts = labels.value_counts().to_dict()
    return {
        "negative": int(counts.get(0, 0)),
        "positive": int(counts.get(1, 0)),
    }


def resolve_cv_folds(requested_folds: int, labels: pd.Series) -> int:
    if requested_folds < 2:
        return 0

    minimum_class_count = int(labels.value_counts().min())
    return min(requested_folds, minimum_class_count)


def evaluate_model_with_cross_validation(
    model,
    X: pd.DataFrame,
    y: pd.Series,
    cv_folds: int,
    random_state: int,
) -> dict:
    splitter = StratifiedKFold(n_splits=cv_folds, shuffle=True, random_state=random_state)
    scores = cross_validate(
        model,
        X,
        y,
        cv=splitter,
        scoring=["accuracy", "precision", "recall", "f1", "roc_auc"],
        n_jobs=None,
    )

    return {
        "cv_accuracy_mean": float(scores["test_accuracy"].mean()),
        "cv_accuracy_std": float(scores["test_accuracy"].std()),
        "cv_precision_mean": float(scores["test_precision"].mean()),
        "cv_precision_std": float(scores["test_precision"].std()),
        "cv_recall_mean": float(scores["test_recall"].mean()),
        "cv_recall_std": float(scores["test_recall"].std()),
        "cv_f1_mean": float(scores["test_f1"].mean()),
        "cv_f1_std": float(scores["test_f1"].std()),
        "cv_roc_auc_mean": float(scores["test_roc_auc"].mean()),
        "cv_roc_auc_std": float(scores["test_roc_auc"].std()),
    }


def build_feature_importance_report(model, feature_columns: list[str]) -> pd.DataFrame:
    raw_importances = getattr(model, "feature_importances_", None)
    if raw_importances is None:
        raw_importances = [0.0 for _ in feature_columns]

    return (
        pd.DataFrame({"feature": feature_columns, "importance": raw_importances})
        .sort_values(by="importance", ascending=False)
        .reset_index(drop=True)
    )


def build_permutation_importance_report(
    model,
    X: pd.DataFrame,
    y: pd.Series,
    feature_columns: list[str],
    random_state: int,
) -> pd.DataFrame:
    report = permutation_importance(
        model,
        X,
        y,
        n_repeats=20,
        random_state=random_state,
        scoring="f1",
    )

    return (
        pd.DataFrame(
            {
                "feature": feature_columns,
                "importanceMean": report.importances_mean,
                "importanceStd": report.importances_std,
            }
        )
        .sort_values(by="importanceMean", ascending=False)
        .reset_index(drop=True)
    )


def build_shap_reports(
    model,
    background_frame: pd.DataFrame,
    X: pd.DataFrame,
    y: pd.Series,
    feature_columns: list[str],
) -> dict:
    try:
        background_sample = background_frame.sample(
            n=min(len(background_frame), 100),
            random_state=0,
        )
        explainer = shap.Explainer(model, background_sample)
        shap_values = explainer(X)
        normalized_values = normalize_shap_values(shap_values.values)

        global_report = (
            pd.DataFrame(
                {
                    "feature": feature_columns,
                    "meanAbsoluteShapValue": abs(normalized_values).mean(axis=0),
                }
            )
            .sort_values(by="meanAbsoluteShapValue", ascending=False)
            .reset_index(drop=True)
        )

        local_report = build_local_shap_explanation_report(
            X,
            y,
            model.predict(X),
            model.predict_proba(X)[:, 1],
            normalized_values,
            feature_columns,
        )

        return {"global": global_report, "local": local_report}
    except Exception as exc:  # pragma: no cover - explanation fallback
        print(f"Warning: SHAP report generation skipped. {exc}")
        return {"global": None, "local": None}


def normalize_shap_values(raw_values):
    if len(raw_values.shape) == 3:
        return raw_values[:, :, 1]
    return raw_values


def build_local_shap_explanation_report(
    X: pd.DataFrame,
    y: pd.Series,
    predictions,
    probabilities,
    shap_values,
    feature_columns: list[str],
) -> pd.DataFrame:
    rows = []

    for row_index, (_, row) in enumerate(X.iterrows()):
        contribution_frame = (
            pd.DataFrame(
                {
                    "feature": feature_columns,
                    "featureValue": row[feature_columns].to_list(),
                    "shapValue": shap_values[row_index],
                }
            )
            .assign(absShapValue=lambda frame: frame["shapValue"].abs())
            .sort_values(by="absShapValue", ascending=False)
            .head(3)
            .reset_index(drop=True)
        )

        rows.append(
            {
                "rowIndex": row_index,
                "actualLabel": int(y.iloc[row_index]),
                "predictedLabel": int(predictions[row_index]),
                "predictedProbability": float(probabilities[row_index]),
                "topFeature1": contribution_frame.iloc[0]["feature"] if len(contribution_frame) > 0 else "",
                "topFeature1Value": float(contribution_frame.iloc[0]["featureValue"]) if len(contribution_frame) > 0 else 0.0,
                "topFeature1ShapValue": float(contribution_frame.iloc[0]["shapValue"]) if len(contribution_frame) > 0 else 0.0,
                "topFeature2": contribution_frame.iloc[1]["feature"] if len(contribution_frame) > 1 else "",
                "topFeature2Value": float(contribution_frame.iloc[1]["featureValue"]) if len(contribution_frame) > 1 else 0.0,
                "topFeature2ShapValue": float(contribution_frame.iloc[1]["shapValue"]) if len(contribution_frame) > 1 else 0.0,
                "topFeature3": contribution_frame.iloc[2]["feature"] if len(contribution_frame) > 2 else "",
                "topFeature3Value": float(contribution_frame.iloc[2]["featureValue"]) if len(contribution_frame) > 2 else 0.0,
                "topFeature3ShapValue": float(contribution_frame.iloc[2]["shapValue"]) if len(contribution_frame) > 2 else 0.0,
            }
        )

    return pd.DataFrame(rows)


if __name__ == "__main__":
    main()
