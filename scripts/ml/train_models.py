"""
Trains baseline and boosting-based classifiers on the synthetic, policy-grounded promotion
dataset produced by build-training-dataset.ts, evaluates them on a held-out test split, and
exports the winning boosting model as a portable JSON ensemble that the Node/TypeScript
backend can evaluate without a Python runtime (see src/services/model.service.ts).

Dataset disclosure: features come from the deterministic synthetic-faculty generator
(scripts/synthetic/build.ts) run through the app's own OCR-era document analysis; labels come
from applying the system's real NBC 461 / DBM-JC rank rule engine to the true evidence. This is
a synthetic dataset, not a record of real historical promotions. See
scripts/ml/build-training-dataset.ts and docs/synthetic-dataset.md.

Usage:
    python scripts/ml/train_models.py
"""
import json
import os

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import AdaBoostClassifier, GradientBoostingClassifier
from sklearn.utils.class_weight import compute_sample_weight
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, confusion_matrix,
)
from xgboost import XGBClassifier

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_PATH = os.path.join(ROOT, 'data', 'ml', 'promotion_training_dataset.csv')
MODELS_DIR = os.path.join(ROOT, 'models')
DOCS_PATH = os.path.join(ROOT, 'docs', 'model-training-results.md')
COMPARISON_PATH = os.path.join(ROOT, 'data', 'ml', 'model_comparison.json')

FEATURES = [
    'yearsInService', 'rankOrdinal', 'attainmentDoctorate',
    'observedTeachingPoints', 'observedKraInstruction', 'observedKraResearch',
    'observedKraExtension', 'observedKraProfessionalDevelopment', 'observedWeightedScore',
    'observedCompletenessScore', 'documentCount',
]
LABEL = 'labelPromoted'


def load_splits():
    df = pd.read_csv(DATA_PATH)
    assert df[FEATURES].isnull().sum().sum() == 0, 'unexpected missing values in a synthetically generated dataset'
    assert df.duplicated(subset=['seq']).sum() == 0, 'unexpected duplicate seq in a synthetically generated dataset'
    train = df[df['split'] == 'train']
    val = df[df['split'] == 'validation']
    test = df[df['split'] == 'test']
    return df, train, val, test


def evaluate(name, model, X_test, y_test, sex_test):
    proba = model.predict_proba(X_test)[:, 1]
    pred = (proba >= 0.5).astype(int)
    metrics = {
        'accuracy': accuracy_score(y_test, pred),
        'precision': precision_score(y_test, pred, zero_division=0),
        'recall': recall_score(y_test, pred, zero_division=0),
        'f1': f1_score(y_test, pred, zero_division=0),
        'rocAuc': roc_auc_score(y_test, proba),
    }
    cm = confusion_matrix(y_test, pred, labels=[0, 1]).tolist()
    metrics['confusionMatrix'] = {'labels': ['not_promoted', 'promoted'], 'matrix': cm}

    # Equal Opportunity Difference: |TPR(male) - TPR(female)| on the positive class.
    tprs = {}
    for group in ['M', 'F']:
        mask = (sex_test == group) & (y_test == 1)
        if mask.sum() > 0:
            tprs[group] = float(pred[mask.values].mean())
    metrics['equalOpportunityDifference'] = (
        abs(tprs.get('M', 0) - tprs.get('F', 0)) if len(tprs) == 2 else None
    )
    metrics['groupTruePositiveRates'] = tprs

    print(f'[{name}] accuracy={metrics["accuracy"]:.4f} precision={metrics["precision"]:.4f} '
          f'recall={metrics["recall"]:.4f} f1={metrics["f1"]:.4f} rocAuc={metrics["rocAuc"]:.4f} '
          f'EOD={metrics["equalOpportunityDifference"]}')
    return metrics


def export_stump_ensemble(clf: AdaBoostClassifier, feature_names):
    """Exports a SAMME AdaBoost ensemble of depth-1 stumps as a portable JSON structure.

    Decision function (binary, SAMME/discrete AdaBoost): for each estimator m with weight
    alpha_m, vote_m(x) = +1 if the stump predicts the positive class else -1; score(x) =
    sum(alpha_m * vote_m(x)); P(class=1 | x) = sigmoid(2 * score(x)). The sigmoid factor is
    verified numerically against sklearn's own predict_proba in verify_export().
    """
    stumps = []
    classes = list(clf.classes_)
    positive_index = classes.index(1)
    for estimator, alpha in zip(clf.estimators_, clf.estimator_weights_):
        tree = estimator.tree_
        feature_index = int(tree.feature[0])
        threshold = float(tree.threshold[0])
        left_value = tree.value[tree.children_left[0]][0]
        right_value = tree.value[tree.children_right[0]][0]
        left_class = classes[int(np.argmax(left_value))]
        right_class = classes[int(np.argmax(right_value))]
        stumps.append({
            'featureIndex': feature_index,
            'featureName': feature_names[feature_index],
            'threshold': threshold,
            'leftVote': 1 if left_class == 1 else -1,
            'rightVote': 1 if right_class == 1 else -1,
            'alpha': float(alpha),
        })
    return {
        'kind': 'adaboost-samme-stumps',
        'featureNames': feature_names,
        'stumps': stumps,
        'positiveClassIndex': positive_index,
    }


def export_tree(tree, node_id=0):
    if tree.children_left[node_id] == tree.children_right[node_id] == -1:
        # sklearn stores class counts at leaves; value shape is (1, n_classes).
        return {'leaf': float(tree.value[node_id][0][1] / tree.value[node_id][0].sum())}
    return {
        'featureIndex': int(tree.feature[node_id]),
        'threshold': float(tree.threshold[node_id]),
        'left': export_tree(tree, tree.children_left[node_id]),
        'right': export_tree(tree, tree.children_right[node_id]),
    }


def export_gradient_boosting(clf: GradientBoostingClassifier, feature_names):
    """Exports sklearn GradientBoostingClassifier (binomial deviance) as raw regression trees.

    Decision function: F(x) = F0 + learning_rate * sum_m tree_m(x); P(class=1|x)=sigmoid(F(x)).
    """
    f0 = float(clf.init_.class_prior_[1])
    f0_logit = float(np.log(f0 / (1 - f0)))
    trees = []
    for stage in clf.estimators_:
        regressor = stage[0]
        trees.append(export_regression_tree(regressor.tree_))
    return {
        'kind': 'additive-regression-trees',
        'comparison': 'lte',
        'featureNames': feature_names,
        'baseScore': f0_logit,
        'learningRate': float(clf.learning_rate),
        'trees': trees,
    }


def export_regression_tree(tree, node_id=0):
    if tree.children_left[node_id] == tree.children_right[node_id] == -1:
        return {'leaf': float(tree.value[node_id][0][0])}
    return {
        'featureIndex': int(tree.feature[node_id]),
        'threshold': float(tree.threshold[node_id]),
        'left': export_regression_tree(tree, tree.children_left[node_id]),
        'right': export_regression_tree(tree, tree.children_right[node_id]),
    }


def export_xgboost(clf: XGBClassifier, feature_names):
    booster = clf.get_booster()
    dumps = booster.get_dump(dump_format='json')
    base_score = float(clf.get_params().get('base_score') or 0.5)
    base_score_logit = float(np.log(base_score / (1 - base_score))) if 0 < base_score < 1 else 0.0
    name_to_index = {name: i for i, name in enumerate(feature_names)}
    trees = [export_xgb_node(json.loads(d), name_to_index) for d in dumps]
    return {
        'kind': 'additive-regression-trees',
        # XGBoost's split convention is strict less-than on the "yes" (left) branch, unlike
        # sklearn's CART convention (<=) used by GradientBoostingClassifier/DecisionTreeClassifier.
        'comparison': 'lt',
        'featureNames': feature_names,
        'baseScore': base_score_logit,
        'learningRate': 1.0,
        'trees': trees,
    }


def export_xgb_node(node, name_to_index):
    if 'leaf' in node:
        return {'leaf': float(node['leaf'])}
    split = node['split']
    feature_index = name_to_index[split] if split in name_to_index else int(split.replace('f', ''))
    children = {child['nodeid']: child for child in node['children']}
    yes_child = children[node['yes']]
    no_child = children[node['no']]
    return {
        'featureIndex': feature_index,
        'threshold': float(node['split_condition']),
        'left': export_xgb_node(yes_child, name_to_index),
        'right': export_xgb_node(no_child, name_to_index),
    }


def verify_adaboost_export(clf, export, X):
    def stump_vote(stump, row):
        return stump['leftVote'] if row[stump['featureIndex']] <= stump['threshold'] else stump['rightVote']

    scores = []
    for _, row in X.iterrows():
        score = sum(s['alpha'] * stump_vote(s, row.values) for s in export['stumps'])
        scores.append(score)
    scores = np.array(scores)
    predicted_proba = 1 / (1 + np.exp(-2 * scores))
    actual_proba = clf.predict_proba(X)[:, export['positiveClassIndex']]
    max_diff = float(np.max(np.abs(predicted_proba - actual_proba)))
    print(f'  AdaBoost export verification: max |diff-probability| over {len(X)} rows = {max_diff:.6f}')
    return max_diff


def verify_tree_export(clf, export, X, kind):
    goes_left = (lambda v, t: v < t) if export['comparison'] == 'lt' else (lambda v, t: v <= t)

    def eval_tree(node, row):
        while 'leaf' not in node:
            node = node['left'] if goes_left(row[node['featureIndex']], node['threshold']) else node['right']
        return node['leaf']

    scores = []
    for _, row in X.iterrows():
        raw = export['baseScore'] + export['learningRate'] * sum(eval_tree(t, row.values) for t in export['trees'])
        scores.append(raw)
    scores = np.array(scores)
    predicted_proba = 1 / (1 + np.exp(-scores))
    actual_proba = clf.predict_proba(X)[:, 1]
    max_diff = float(np.max(np.abs(predicted_proba - actual_proba)))
    class_agreement = float(np.mean((predicted_proba >= 0.5) == (actual_proba >= 0.5)))
    print(f'  {kind} export verification: max |diff-probability| over {len(X)} rows = {max_diff:.6f} '
          f'(float32 split-threshold rounding; class agreement {class_agreement * 100:.1f}%)')
    return max_diff


def main():
    df, train, val, test = load_splits()
    X_train, y_train, sex_train = train[FEATURES], train[LABEL], train['sex']
    X_val, y_val = val[FEATURES], val[LABEL]
    X_test, y_test, sex_test = test[FEATURES], test[LABEL], test['sex']
    sample_weight = compute_sample_weight('balanced', y_train)

    print(f'Dataset: {len(df)} rows -> train={len(train)} validation={len(val)} test={len(test)}')
    print(f'Features ({len(FEATURES)}): {FEATURES}\n')

    results = {}

    print('--- Baseline models ---')
    logreg = LogisticRegression(max_iter=1000)
    logreg.fit(X_train, y_train, sample_weight=sample_weight)
    results['LogisticRegression'] = evaluate('LogisticRegression', logreg, X_test, y_test, sex_test)

    dtree = DecisionTreeClassifier(max_depth=5, random_state=42)
    dtree.fit(X_train, y_train, sample_weight=sample_weight)
    results['DecisionTree'] = evaluate('DecisionTree', dtree, X_test, y_test, sex_test)

    print('\n--- Boosting models ---')
    ada = AdaBoostClassifier(
        estimator=DecisionTreeClassifier(max_depth=1),
        n_estimators=100, algorithm='SAMME', random_state=42,
    )
    ada.fit(X_train, y_train, sample_weight=sample_weight)
    results['AdaBoost'] = evaluate('AdaBoost', ada, X_test, y_test, sex_test)

    gb = GradientBoostingClassifier(n_estimators=100, max_depth=3, learning_rate=0.1, random_state=42)
    gb.fit(X_train, y_train, sample_weight=sample_weight)
    results['GradientBoosting'] = evaluate('GradientBoosting', gb, X_test, y_test, sex_test)

    xgb = XGBClassifier(
        n_estimators=100, max_depth=3, learning_rate=0.1, eval_metric='logloss',
        random_state=42, base_score=0.5,
    )
    xgb.fit(X_train, y_train, sample_weight=sample_weight)
    results['XGBoost'] = evaluate('XGBoost', xgb, X_test, y_test, sex_test)

    # Primary metric: Recall. Secondary/tie-break: ROC-AUC, then Accuracy.
    boosting_names = ['AdaBoost', 'GradientBoosting', 'XGBoost']
    winner = max(boosting_names, key=lambda n: (results[n]['recall'], results[n]['rocAuc'], results[n]['accuracy']))
    print(f'\nWinning boosting model (by Recall, tie-break ROC-AUC/Accuracy): {winner}')

    os.makedirs(MODELS_DIR, exist_ok=True)
    os.makedirs(os.path.dirname(COMPARISON_PATH), exist_ok=True)

    print('\n--- Exporting portable model artifacts ---')
    winning_model = {'AdaBoost': ada, 'GradientBoosting': gb, 'XGBoost': xgb}[winner]
    if winner == 'AdaBoost':
        export = export_stump_ensemble(ada, FEATURES)
        verify_adaboost_export(ada, export, X_test)
    elif winner == 'GradientBoosting':
        export = export_gradient_boosting(gb, FEATURES)
        verify_tree_export(gb, export, X_test, 'gb')
    else:
        export = export_xgboost(xgb, FEATURES)
        verify_tree_export(xgb, export, X_test, 'xgb')

    importances = getattr(winning_model, 'feature_importances_', None)
    feature_importance = (
        sorted(
            [{'feature': f, 'importance': float(i)} for f, i in zip(FEATURES, importances)],
            key=lambda row: -row['importance'],
        ) if importances is not None else []
    )

    export['modelName'] = winner
    export['trainedAt'] = pd.Timestamp.utcnow().isoformat()
    export['datasetRows'] = len(df)
    export['metrics'] = results[winner]
    export['featureImportance'] = feature_importance

    with open(os.path.join(MODELS_DIR, 'promotion-model.json'), 'w') as f:
        json.dump(export, f, indent=2)

    with open(COMPARISON_PATH, 'w') as f:
        json.dump({
            'generatedAt': pd.Timestamp.utcnow().isoformat(),
            'datasetRows': len(df),
            'features': FEATURES,
            'primaryMetric': 'recall',
            'winningModel': winner,
            'results': results,
            'featureImportance': feature_importance,
        }, f, indent=2)

    # Reference predictions on the held-out test set, for the TS inference port to compare
    # against directly (scripts/ml/verify-ts-inference.ts) -- the cross-language proof that the
    # deployed Node backend reproduces what was actually trained in Python.
    test_proba = winning_model.predict_proba(X_test)[:, 1]
    reference_predictions = [
        {'seq': int(seq), 'probability': float(p), 'predictedClass': bool(p >= 0.5)}
        for seq, p in zip(test['seq'], test_proba)
    ]
    with open(os.path.join(os.path.dirname(COMPARISON_PATH), 'test_predictions_reference.json'), 'w') as f:
        json.dump(reference_predictions, f, indent=2)

    print(f'Wrote models/promotion-model.json (winner: {winner})')
    print(f'Wrote data/ml/model_comparison.json')
    print(f'Wrote data/ml/test_predictions_reference.json ({len(reference_predictions)} rows)')


if __name__ == '__main__':
    main()
