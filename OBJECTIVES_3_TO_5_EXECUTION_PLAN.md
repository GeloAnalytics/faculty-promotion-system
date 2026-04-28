# Objectives 3-5 Execution Plan

## Purpose

This plan aligns the repository with the next implementation phase for the thesis objectives related to machine learning model building, evaluation, and later-stage insight generation.

## Objective 2 Revision

The current system already declares a usable feature set in [src/types.ts](/c:/Users/PC/faculty-promotion-system/src/types.ts:1) and computes engineered feature vectors in [src/utils.ts](/c:/Users/PC/faculty-promotion-system/src/utils.ts:124).

Because of that, Objective 2 does not need to emphasize discovering features from scratch. A better phrasing is:

> To validate, refine, and rank the pre-identified faculty, performance-review, promotion-history, and document-quality features according to their contribution to successful promotion outcomes.

This keeps the objective academically honest:

- the features are already defined
- the remaining work is to validate their usefulness
- feature importance can still be measured later from the trained boosting models

## Objective 3 Scope

Objective 3 should focus on true boosting algorithms only.

Recommended three-model set:

1. AdaBoost
2. Gradient Boosting
3. XGBoost

Recommended revised wording:

> To implement and compare three boosting algorithms, namely AdaBoost, Gradient Boosting, and XGBoost, for predicting faculty promotion outcomes.

## What Each Model Will Boost

All three models should predict the same target:

- `labelPromoted` from `TrainingExample`

All three models should use the same base feature vector so the comparison is fair:

- age
- years in service
- highest educational attainment level
- teaching effectiveness
- research outputs
- extension services
- administrative experience
- professional development hours
- IPCR average
- promotion history count
- document completeness
- document quality score

Model-specific boosting behavior:

1. AdaBoost
   Uses many weak learners, ideally shallow decision trees or decision stumps, and boosts misclassified promotion cases from previous rounds.

2. Gradient Boosting
   Uses sequential shallow trees that fit the residual errors of earlier trees, improving probability estimates for promotion decisions step by step.

3. XGBoost
   Uses regularized boosted trees with gradient-based optimization, making it a strong candidate when the dataset becomes larger and more heterogeneous.

## Recommended Training Strategy

The first implementation should be offline and reproducible, not yet embedded in the live Express runtime.

Recommended workflow:

1. Export labeled training examples from PostgreSQL into a clean CSV or parquet training dataset.
2. Train the three boosting models in Python.
3. Save:
   - trained model artifact
   - feature list
   - preprocessing metadata
   - validation report
4. Only after validation is stable, expose a backend inference endpoint.

Recommended stack for the offline ML pipeline:

- Python
- pandas
- scikit-learn
- xgboost
- joblib

Reason:

- the repository already includes a Python ML file
- boosting libraries are mature in Python
- evaluation and experimentation are faster there than forcing early implementation into TypeScript

## Dataset and Label Plan

Target variable:

- binary classification target: `promoted` vs `not promoted`

Primary source:

- validated records from `training_examples.labelPromoted`

Minimum inclusion rule:

- use only `LABELED` or `VALIDATED` examples with sufficiently complete feature snapshots

Suggested split:

1. Train: 70%
2. Validation: 15%
3. Test: 15%

Important rule:

- use stratified splitting because promotion labels may be imbalanced

If the dataset is still small:

- apply stratified k-fold cross-validation on the training set
- keep the final test set untouched for the last comparison

## Metrics for Objective 4

Required thesis metrics:

- accuracy
- precision
- recall
- F1-score

Recommended additional metrics for decision quality:

- ROC-AUC
- confusion matrix
- support per class

How to choose the best model:

1. Use F1-score as the primary selection metric if the classes are imbalanced.
2. Use recall as a secondary metric if missing promotable faculty is considered more harmful.
3. Use precision as a secondary metric if false positive promotion recommendations are considered more harmful.
4. Report accuracy, but do not use it alone for model selection.

Recommended default decision rule:

- primary metric: F1-score
- tie-breaker 1: recall
- tie-breaker 2: precision

## Objective 5 Plan

Objective 5 will be implemented after the best model has been selected.

Recommended wording:

> To derive interpretable insights from the best-performing boosting model regarding the factors that most strongly influence faculty promotion outcomes, and to use these findings to support policy and decision-making improvements.

Planned outputs for Objective 5:

1. Global feature importance ranking
2. Per-prediction explanation summary for evaluator use
3. Promotion-readiness summary for each candidate
4. Policy recommendations based on recurring limiting factors

Recommended methods:

- feature importance from the best model
- permutation importance
- SHAP values for local and global interpretability

## Practical Build Phases

### Phase 1: Data readiness

- confirm enough labeled records exist
- clean missing or inconsistent values
- freeze the initial training feature schema
- define inclusion and exclusion rules

### Phase 2: Offline boosting experiments

- build a dataset export script
- train AdaBoost
- train Gradient Boosting
- train XGBoost
- compare metrics on validation data

### Phase 3: Final evaluation

- evaluate the top candidate on the held-out test set
- produce confusion matrix and metric summary
- save the best model and experiment report

### Phase 4: Objective 5 integration

- generate feature-importance outputs
- draft policy-recommendation templates
- optionally expose a read-only evaluator insight endpoint

## Recommended Immediate Next Tasks

1. Add a dataset export script from Prisma/PostgreSQL to CSV.
2. Create a Python training script for AdaBoost, Gradient Boosting, and XGBoost.
3. Store experiment results in a versioned reports folder.
4. Keep prediction endpoints disabled until offline validation is complete.

## Final Decisions For This Phase

- Objective 2 should be revised toward validation and ranking of already defined features.
- Objective 3 should use only true boosting models.
- The three selected models are AdaBoost, Gradient Boosting, and XGBoost.
- All three models will boost decision trees for the same binary promotion target.
- Objective 4 will evaluate the three models using accuracy, precision, recall, and F1-score, with F1-score as the primary comparison metric.
- Objective 5 will be deferred until after best-model selection and should focus on interpretability and policy recommendations.
