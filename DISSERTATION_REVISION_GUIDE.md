# Dissertation Revision Guide for Faculty Promotion System

This file is the paper-revision guide for the current repository. Use it as the main reference when revising your dissertation, manuscript, or defense narrative.

## Recommended Framing

The strongest framing for the project is:

> The Faculty Promotion System is a hybrid decision-support platform that combines faculty record management, documentary evidence digitization, OCR/PDF-assisted signal extraction, evaluator validation, and offline boosting-based machine learning experimentation for promotion-readiness analysis.

This phrasing is accurate because the repository currently supports both:

1. an operational application layer for intake, uploads, scoring, and dashboard summaries
2. an analytical layer for offline dataset export, model comparison, and explainability outputs

## What You Can Honestly Claim

The current repository supports:

- role-based user management for employee, evaluator, and admin users
- structured faculty profile ingestion
- KRA-based document upload workflows
- PDF parsing and image OCR
- document completeness and quality scoring
- preliminary employee-side rank estimation before evaluator scoring
- evaluator-backed draft-rank computation after criterion scoring
- workbook-derived documentary evidence validation with strict `AND`/`OR` completeness rules
- training-example labeling and validation
- export of machine-learning-ready datasets
- offline comparison of boosting-based machine learning models
- explainability artifacts such as feature importance, permutation importance, and SHAP outputs

## What You Should Not Overclaim

Do not say:

- the system already performs live production-grade ML prediction for end users
- the system fully automates final promotion decisions
- evaluator judgment is no longer needed
- the Vue frontend has fully replaced the older runtime UI

Safer alternatives:

- the system prepares and validates machine-learning-ready promotion data
- the system provides advisory rank-estimation support
- evaluator-backed review remains central to the workflow
- the project is in a staged frontend modernization phase

## Objective Alignment

### General objective

Your general objective is aligned with the repository, with one important qualification:

- live forecasting in the deployed API remains intentionally disabled
- offline model training and evaluation are implemented and usable

### Specific objective alignment

1. Collect and preprocess faculty data, including demographic information, performance review scores, promotion history, and scanned or digitized supporting documents.
   Status: aligned.

2. Identify and select significant features correlated with promotion outcomes.
   Status: partially aligned in the live app, fully aligned in the offline analytical workflow.

3. Implement and compare boosting-based models for promotion prediction.
   Status: aligned if described as boosting-focused offline experimentation.

4. Evaluate and select the best-performing model using metrics such as accuracy, precision, recall, and F1-score.
   Status: aligned.

5. Generate interpretable insights and policy-support recommendations from the model.
   Status: aligned.

## Recommended Revision to Objective 3

Use wording closer to:

> To implement and compare boosting-based machine learning algorithms, particularly AdaBoost, Gradient Boosting, and XGBoost, for predicting faculty promotions, while using other classical tree-based approaches only as conceptual baselines where appropriate.

## How to Describe the Rank Estimation Feature

The current system supports two rank-estimation modes:

### 1. Preliminary employee-side estimate

Before evaluator scoring exists, the dashboard can estimate a likely draft rank using:

- employee-entered performance values
- document-extracted scores from OCR/PDF analysis
- upload coverage across KRA panels
- average document completeness
- the employee's current academic-rank group
- educational-attainment-based eligibility checks

This estimate is advisory and should be described as preliminary.

### 2. Evaluator-backed draft rank

After evaluator scoring is saved, the dashboard uses evaluator criterion scores aggregated by KRA.

This evaluator-backed result takes priority over the preliminary estimate.

### Recommended thesis phrasing

> The system provides an early advisory rank estimate using employee-submitted performance inputs and uploaded evidence signals before evaluator grading, then replaces or refines that estimate with an evaluator-backed draft recommendation once criterion scoring becomes available.

## Methodology Guidance

Describe the project as a combined software-engineering and machine-learning pipeline.

### Operational workflow

1. A user registers and logs in.
2. An employee submits faculty profile data.
3. The system stores structured faculty data and extracted document metadata.
4. The employee uploads supporting documents per KRA criterion.
5. The system parses PDFs or performs OCR on images.
6. The system summarizes evidence quality, completeness, and coverage, and flags incomplete required evidence bundles.
7. The dashboard may show a preliminary rank estimate.
8. Evaluators review employee records and assign criterion scores.
9. Evaluator scoring produces a stronger draft-rank result.
10. Labeled and validated examples are exported for offline machine learning.

### Feature engineering

The shared 12-feature schema includes:

- `age`
- `yearsInService`
- `highestEducationalAttainmentLevel`
- `teachingEffectiveness`
- `researchOutputs`
- `extensionServices`
- `administrativeExperience`
- `professionalDevelopmentHours`
- `ipcrAverage`
- `promotionHistoryCount`
- `documentCompleteness`
- `documentQualityScore`

One strong methodological point is that the system uses document-derived features, not only manually encoded tabular fields.

### Labeling and dataset preparation

Training examples move through:

- `DRAFT`
- `LABELED`
- `VALIDATED`

That supports a strong argument for controlled dataset curation rather than uncontrolled model training.

## Machine Learning Workflow

The implemented offline analytical workflow compares:

- AdaBoost
- Gradient Boosting
- XGBoost

The training pipeline supports:

- dataset validation
- train/validation/test splitting
- optional stratified cross-validation for smaller datasets
- comparison of model metrics
- holdout testing
- feature importance analysis
- permutation importance
- SHAP-based explanation generation

## Latest Available Metrics Already in the Repository

The repository already contains generated ML reports from a recent run with:

- dataset rows: `1000`
- split: train `700`, validation `150`, test `150`
- selected best model: `AdaBoost`

### Validation metrics

| Model | Accuracy | Precision | Recall | F1 | ROC-AUC |
| --- | ---: | ---: | ---: | ---: | ---: |
| AdaBoost | 0.9800 | 0.8462 | 0.9167 | 0.8800 | 0.9934 |
| XGBoost | 0.9800 | 0.9091 | 0.8333 | 0.8696 | 0.9958 |
| GradientBoosting | 0.9733 | 0.9000 | 0.7500 | 0.8182 | 0.9952 |

### Best-model test metrics

- Accuracy: `0.9733`
- Precision: `0.8889`
- Recall: `0.7273`
- F1-score: `0.8000`
- ROC-AUC: `0.9836`
- Confusion matrix: `[[138, 1], [3, 8]]`

### Important interpretation note

Do not rely on accuracy alone. For the paper, emphasize:

- precision
- recall
- F1-score
- ROC-AUC
- confusion matrix

## Chapter-by-Chapter Guide

### Chapter 1: Introduction

Emphasize that:

- faculty promotion evidence is fragmented
- much of it is stored as PDFs or scanned images
- manual review is time-consuming and difficult to standardize
- machine learning is used for decision support, not for replacing human evaluators

Useful contribution statement:

> The study contributes a working platform that combines role-based promotion record management, OCR-assisted evidence extraction, advisory rank estimation, evaluator validation, and reproducible offline boosting-model experimentation.

### Chapter 2: Related Literature and Systems

Align the literature review with:

- academic HR decision-support systems
- OCR and document digitization
- explainable machine learning
- boosting models for tabular classification
- human-in-the-loop validation for sensitive institutional decisions

### Chapter 3: Methodology

Describe the technical stack as:

- Express + TypeScript backend
- Prisma + PostgreSQL persistence layer
- active static portal in `public/`
- Vue 3 migration workspace in `frontend/`
- Zod validation
- JWT-based authentication

### Chapter 4: System Design and Architecture

Important architecture points:

- backend code lives in `src/`
- legacy but active runtime UI is in `public/`
- migration UI is in `frontend/`
- database structure is in `prisma/schema.prisma`
- ML workflow is in `ml/`

Main entities to discuss:

- `User`
- `FacultyProfile`
- `UploadedDocument`
- `TrainingExample`
- `Prediction`

### Chapter 5: Implementation

Implemented areas include:

- authentication
- faculty profile ingestion
- document extraction and deletion
- dashboard summaries
- evaluator review queue
- training-example creation and labeling
- admin database overview

### Chapter 6: Results and Discussion

You can discuss:

- the working faculty-promotion management platform
- successful digitization and storage of documentary evidence
- successful OCR/PDF-based evidence processing
- preliminary and evaluator-backed rank-estimation support
- successful preparation of ML-ready training examples
- successful offline model comparison and explainability reporting

### Chapter 7: Conclusion

A strong conclusion should emphasize that the project achieved integration of:

- promotion-record digitization
- criterion-based evidence capture
- OCR-assisted text extraction
- preliminary and evaluator-backed rank-estimation support
- evaluator-mediated labeling
- reproducible offline boosting-model experimentation

Then clearly state:

- live automated prediction remains intentionally disabled pending further validation and institutional calibration

## Honest Limitations to Include

- Live prediction endpoints are intentionally inactive.
- The Vue frontend is not yet the main runtime application.
- OCR quality depends on document quality and provider configuration.
- Filename-based linking remains heuristic.
- Promotion draft rules are advisory and still need continued institutional validation.
- The training pipeline depends on having enough validated labels.

## Strong Contributions to Emphasize

- Integration of operational workflow and ML dataset curation in one platform
- Use of document-derived evidence features, not only manually entered data
- Availability of preliminary rank estimation before evaluator scoring
- Explicit evidence-completeness validation so missing required documents stay blocked from promotion review
- Human-in-the-loop evaluator validation before model training
- Reproducible offline model comparison with explainability outputs
- Alignment of upload capture with KRA/NBC-style promotion criteria

## Suggested Figures

- Overall system architecture diagram
- Use case diagram for Employee, Evaluator, and Admin
- Activity diagram for document submission and evaluation
- Data flow diagram from upload to training dataset export
- Entity relationship diagram from `schema.prisma`
- ML workflow diagram for export, train, validate, test, and explainability

## Suggested Tables

- System modules and responsibilities
- API endpoint groups
- Database entities and attributes
- The 12 engineered features and meanings
- Model comparison metrics
- Top feature-importance and SHAP findings
- System limitations and future enhancements

## Future Work

- enable live inference after institutional validation
- expand the validated dataset size
- improve OCR robustness for low-quality scans
- replace heuristic filename matching with stronger document-to-profile linkage
- complete the frontend migration if the team chooses to move fully to Vue
- add audit trails, fairness analysis, and committee-approval states

## Ready-to-Use Revision Paragraph

> The implemented Faculty Promotion System should be understood as a hybrid decision-support platform rather than a fully automated promotion engine. Its current contribution lies in structuring faculty records, digitizing documentary evidence, extracting analyzable signals from PDF and image uploads, supporting preliminary rank estimation and evaluator-backed review, enabling evaluator-assisted labeling, and providing reproducible offline experimentation using boosting-based machine learning models. This staged architecture prioritizes data quality, transparency, and institutional trust before live predictive deployment.

## Main Files to Cite

- `README.md`
- `src/server.ts`
- `src/routes/index.ts`
- `src/controllers/faculty.controller.ts`
- `src/controllers/document.controller.ts`
- `src/controllers/training.controller.ts`
- `src/controllers/dashboard.controller.ts`
- `src/utils.ts`
- `src/utils/document.utils.ts`
- `src/utils/dashboard.utils.ts`
- `src/ocr.ts`
- `prisma/schema.prisma`
- `ml/train_boosting_models.py`

## Final Advice

If you want the paper to feel technically strong and defensible, present the repository as a trustworthy end-to-end platform for:

- promotion data capture
- evidence digitization
- advisory rank estimation
- evaluator validation
- offline predictive experimentation

That claim is fully supported by the current repository and is much stronger than overstating the system as a fully automated live prediction engine.
