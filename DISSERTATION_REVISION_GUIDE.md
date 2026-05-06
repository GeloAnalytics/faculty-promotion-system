# Dissertation Revision Guide for Faculty Promotion System

## Repository Baseline Verified

- Repository: `https://github.com/GeloAnalytics/faculty-promotion-system`
- Branch checked: `main`
- Latest remote commit verified by `git fetch origin`: `c32724b53eacedc466f11b028f6127d9e2bacf70`
- Short commit: `c32724b`
- Commit date: `2026-05-04 18:41:43 +0800`
- Commit message: `Fix dashboard and faculty routing issues`

This guide is based on the actual codebase at the latest verified remote state above. While checking, the local working tree also contained uncommitted generated changes in `dist/` and `node_modules/`, but the branch itself was aligned with `origin/main`.

## Objective Alignment

Your stated general objective is aligned with the current repository, with one important qualification: the system already supports data collection, preprocessing, document image processing, training-data preparation, and offline model validation, but live forecasting inside the deployed API is still intentionally disabled.

The current implementation aligns with your specific objectives as follows:

1. To collect and preprocess faculty data, including demographic information, performance commitment review scores, and promotion history, incorporating scanned and digitized relevant documents such as PDS and performance reviews.
   Status in repository: aligned.
   Evidence in code: `FacultyProfile` ingestion, PDF parsing, OCR support, document metadata extraction, and feature engineering from structured and unstructured inputs.

2. To identify and select the most significant features from personal data and performance reviews that are highly correlated with successful promotion outcomes.
   Status in repository: partially aligned in live app, fully aligned in offline analytical workflow.
   Evidence in code: the system uses a fixed 12-feature schema and produces feature-importance, permutation-importance, and SHAP reports in the offline ML pipeline.

3. To implement and compare various boosting machine learning algorithms (e.g., decision trees, random forests, AdaBoost, Gradient Boosting) for predicting faculty promotions.
   Status in repository: substantially aligned, but with a wording caveat.
   Evidence in code: the production ML training script compares `AdaBoost`, `GradientBoosting`, and `XGBoost`. The TypeScript helper code also includes illustrative placeholders for `decision-tree` and `random-forest`, but those are not the primary offline trained models in `ml/train_boosting_models.py`.

4. To evaluate and select the best-performing predictive model based on validation metrics such as accuracy, precision, recall, and F1-score.
   Status in repository: aligned.
   Evidence in code: validation, cross-validation, holdout testing, and ranking by validation metrics are implemented and persisted to `ml/reports/<timestamp>/`.

5. To generate insights from the model regarding influential factors and provide recommendations to improve faculty promotion policies and decision-making processes in state universities.
   Status in repository: aligned.
   Evidence in code: feature importance, permutation importance, SHAP outputs, and system-level recommendation framing support this objective.

Recommended revision to Objective 3 for cleaner alignment with the current repository:

> To implement and compare boosting-based machine learning algorithms, particularly AdaBoost, Gradient Boosting, and XGBoost, for predicting faculty promotions, while using other classical tree-based approaches as conceptual baselines where appropriate.

## Latest Available Model Metrics

The repository already contains generated ML reports. The latest available run found during review was:

- Report folder: `ml/reports/20260504T090155Z`
- Dataset rows: `1000`
- Split: train `700`, validation `150`, test `150`
- Best model: `AdaBoost`

### Validation metrics

| Model | Accuracy | Precision | Recall | F1 | ROC-AUC |
| --- | ---: | ---: | ---: | ---: | ---: |
| AdaBoost | 0.9800 | 0.8462 | 0.9167 | 0.8800 | 0.9934 |
| XGBoost | 0.9800 | 0.9091 | 0.8333 | 0.8696 | 0.9958 |
| GradientBoosting | 0.9733 | 0.9000 | 0.7500 | 0.8182 | 0.9952 |

### Best model test metrics

For the latest saved run, the selected best model was `AdaBoost` with:

- Accuracy: `0.9733`
- Precision: `0.8889`
- Recall: `0.7273`
- F1-score: `0.8000`
- ROC-AUC: `0.9836`
- Confusion matrix: `[[138, 1], [3, 8]]`

### Cross-validation snapshot

Five-fold cross-validation was also recorded for the latest run:

- AdaBoost: mean accuracy `0.9443`, mean precision `0.6488`, mean recall `0.6055`, mean F1 `0.6193`, mean ROC-AUC `0.9597`
- GradientBoosting: mean accuracy `0.9429`, mean precision `0.6350`, mean recall `0.5691`, mean F1 `0.5889`, mean ROC-AUC `0.9556`
- XGBoost: mean accuracy `0.9500`, mean precision `0.6987`, mean recall `0.5855`, mean F1 `0.6270`, mean ROC-AUC `0.9718`

### Important interpretation note for the dissertation

These metrics are strong, but the class distribution is imbalanced in the latest saved run:

- Training positives: `53` out of `700`
- Validation positives: `12` out of `150`
- Test positives: `11` out of `150`

Because of that, you should not discuss accuracy alone. For dissertation writing, prioritize:

- precision
- recall
- F1-score
- ROC-AUC
- confusion matrix

This is especially important for Objective 4.

## Executive Summary You Can Reuse

The Faculty Promotion System is a full-stack decision-support platform designed to digitize faculty promotion records, collect structured and unstructured evidence, extract usable signals from uploaded documents through PDF parsing and OCR, and prepare validated training data for machine learning analysis aligned with NBC 461-related promotion criteria. The current implementation emphasizes secure data collection, evaluator-assisted labeling, and reproducible offline machine learning experimentation rather than fully automated live prediction in production.

If you need a shorter thesis-ready statement:

> The system was implemented as a faculty-promotion decision-support platform that integrates role-based record management, document digitization, OCR-assisted evidence extraction, evaluator validation, and an offline boosting-based machine learning workflow for promotion-readiness analysis.

## What the System Currently Does

### 1. Core functional scope

The current system already supports:

- User registration, login, logout, and session recovery using JWT.
- Role-based access for `EMPLOYEE`, `EVALUATOR`, and `ADMIN`.
- Faculty profile ingestion using structured personal, performance, and promotion-history inputs.
- Evidence upload for KRA-aligned criteria using PDF and image files.
- PDF parsing and OCR-based text extraction for uploaded evidence.
- Heuristic document analysis for completeness, quality, keyword hits, and criterion alignment.
- Automatic linking of uploaded documents to faculty profiles using explicit profile selection or filename matching.
- Evaluator review queues and training-example labeling.
- Export of validated training data for machine learning.
- Offline training and comparison of boosting models.
- Explainability outputs through feature importance, permutation importance, and SHAP.

### 2. What is intentionally not active

The codebase explicitly keeps some thesis objectives inactive in the live API:

- `/api/faculty/analysis/feature-selection` returns `503`.
- `/api/faculty/models/compare` returns `503`.
- `/api/faculty/predictions/generate` returns `503`.

This means the live web system is currently positioned as a data-collection and evaluator-validation platform, while machine learning experimentation is performed offline through the Python workflow. In the dissertation, this should be framed as a deliberate design decision for reproducibility, safety, and data quality control.

## Recommended Framing for the Dissertation

### Strong framing

Present the project as a hybrid intelligent information system with two layers:

1. An operational application layer for secure intake, digitization, storage, validation, and reviewer workflows.
2. An analytical layer for offline model training, comparison, and interpretation using curated data exported from the operational system.

This framing is strong because it matches the implementation exactly and avoids overstating that the model is already deployed for live decision-making.

### Avoid overclaiming

Do not say:

- the system already performs production-grade automated promotion decisions
- the deployed application currently runs real-time boosting inference for end users
- the Vue frontend is already the complete final UI

Instead, say:

- the system currently supports the end-to-end preparation of machine-learning-ready promotion data
- model training and comparison are implemented as an offline reproducible workflow
- the system is architected to support future live inference after further validation

## Suggested Chapter-by-Chapter Revision Guide

## Chapter 1: Introduction

Revise the introduction so the problem is not only "promotion is difficult," but also "promotion evidence is fragmented, partly unstructured, and time-consuming to validate."

Key points to emphasize:

- Faculty promotion evaluation depends on multiple criteria across instruction, research, extension, and professional development.
- Many supporting documents are stored as PDFs or images, which limits direct computational use.
- Manual review alone can be slow, inconsistent, and difficult to audit at scale.
- A digital system can standardize collection, improve traceability, and prepare structured evidence for later analytics.
- Machine learning is used as decision support, not as a replacement for human evaluators.

Useful thesis contribution statement:

- The study contributes a working platform that combines role-based promotion record management, OCR-assisted evidence extraction, evaluator validation, and reproducible boosting-model experimentation for promotion-readiness analysis.

## Chapter 2: Related Literature and Systems

Your review should align with the implemented modules:

- Decision-support systems for academic HR or faculty evaluation.
- OCR and document digitization in administrative systems.
- Explainable machine learning for institutional decision support.
- Boosting algorithms in tabular classification tasks.
- Human-in-the-loop validation for sensitive predictive systems.

Tie the literature to your actual design:

- OCR is relevant because evidence uploads include scanned images and PDF files.
- Explainability is relevant because promotion decisions require fairness and transparency.
- Human validation is relevant because the system stores evaluator labels before training.

## Chapter 3: Methodology

This chapter should now describe the project as a combined software-engineering and machine-learning pipeline.

### A. System development methodology

You can describe the software as a modular full-stack implementation with:

- Backend API in Express + TypeScript
- Relational persistence using Prisma + PostgreSQL
- Frontend interfaces in Vue 3 plus retained legacy static pages during migration
- Validation using Zod
- Authentication using JWT

### B. Operational workflow

The real workflow in the codebase is:

1. A user registers and logs in.
2. An employee submits faculty profile data.
3. The system engineers a 12-feature vector from structured inputs and extracted document signals.
4. The employee uploads supporting documents per KRA criterion.
5. The system parses PDFs or performs OCR on images.
6. The extracted text is analyzed for completeness, quality, and keyword/category matches.
7. Documents are stored and linked to the proper faculty profile.
8. Evaluators review queue items and label training examples.
9. Labeled and validated examples are exported as a dataset.
10. Boosting models are trained and compared offline.

### C. Feature engineering

The implemented 12 features are:

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

Important methodological note:

The last two features are generated from document processing, which is a meaningful contribution because the system does not rely only on manually keyed tabular data.

### D. Labeling and training-data preparation

Training examples are stored in three statuses:

- `DRAFT`
- `LABELED`
- `VALIDATED`

This is a strong dissertation point because it demonstrates controlled dataset curation rather than uncontrolled model training.

### E. Machine learning methodology

The implemented offline ML workflow compares:

- AdaBoost
- Gradient Boosting
- XGBoost

The Python training pipeline performs:

- dataset validation
- stratified train/validation/test split
- optional stratified cross-validation for smaller datasets
- ranking models by validation F1, recall, and precision
- best-model testing on a holdout set
- feature importance analysis
- permutation importance
- SHAP-based global and local explanation generation

This gives you enough material for a strong methodology and results chapter even without live inference.

## Chapter 4: System Design and Architecture

### Actual architecture in the repository

- Backend: `src/`
- Frontend SPA: `frontend/`
- Legacy static frontend still served: `public/`
- Database schema: `prisma/schema.prisma`
- ML workflow: `ml/`

### Backend architecture

The backend follows an MVC-style structure:

- `controllers/` for request handling
- `routes/` for endpoint definitions
- `middlewares/` for authentication and errors
- `validations/` for request schemas
- `utils/` for feature engineering, OCR/document processing helpers, and dashboard summaries
- `config/` for environment, database, and global reference-data loading

### Authentication and security design

Security features visible in the code include:

- JWT-based authentication with 7-day expiry
- role-based route protection
- password hashing with per-user salt
- `HttpOnly` session-cookie fallback
- CORS configuration
- hardening headers such as `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy`
- optional HSTS in production

Thesis-friendly phrasing:

> The system was designed with role-aware access control and secure token-based authentication to protect sensitive personnel and evaluation records.

### Database design

The main entities are:

- `User`
- `FacultyProfile`
- `UploadedDocument`
- `TrainingExample`
- `Prediction`

How to describe them:

- `User` stores identity, credentials, and role.
- `FacultyProfile` stores the faculty member record and engineered features.
- `UploadedDocument` stores evidence metadata, extracted text, and analysis output.
- `TrainingExample` stores labeled snapshots for ML dataset generation.
- `Prediction` is reserved for inference records, although live inference is currently inactive.

## Chapter 5: Implementation Details

### Implemented API groups

- Auth: registration, login, logout, session recovery
- Faculty: profile ingestion and currently inactive analysis endpoints
- Documents: extraction and deletion
- Training: example creation, labeling, and retrieval
- Dashboard: employee summary, evaluator review queue, profile detail
- Reference: TQE summary, guidelines, upload-panel configuration
- Admin: database overview

### Evidence processing design

The evidence-processing pipeline is one of the strongest parts of the project:

- PDFs are parsed using `pdf-parse`.
- Images are processed through OCR.
- OCR can use Windows OCR, a generic HTTP OCR endpoint, or OCR.space.
- Extracted text is analyzed for score fields, keyword hits, criterion categories, completeness, and quality.
- Results are saved as document metadata for later review and modeling.

### KRA coverage

The upload-panel configuration covers four main KRA groupings:

- KRA 1: Instruction
- KRA 2: Research, Invention and Creative Work
- KRA 3: Extension Services
- KRA 4: Professional Development

Within these, the system includes 14 criterion-aligned upload panels such as teaching effectiveness, research outputs, creative works, community service, continuing development, awards, and new-entrant experience categories.

### Current frontend state

Be precise here:

- A new Vue 3 frontend exists with role-based routes for login, employee, and evaluator views.
- The Vue dashboards are still lightweight placeholders.
- The backend still serves legacy static pages from `public/employee.html`, `public/evaluator.html`, and related assets.

This is important because a panel may notice that the repo contains both a modern SPA and older static UI assets.

Recommended wording:

> The project is currently in a controlled frontend migration phase, where the backend already supports the new architecture while selected legacy interfaces remain available to preserve working functionality.

## Chapter 6: Results and Discussion

### What results you can honestly claim now

You can already discuss:

- successful implementation of a role-based faculty-promotion management platform
- successful digitization and storage of structured and unstructured promotion evidence
- successful extraction of usable text-based evidence from PDFs and images
- successful transformation of records into ML-ready training examples
- successful offline comparison of boosting models
- successful production of explainability artifacts for feature-level interpretation

### How to discuss ML results

Your results chapter should rely on generated artifacts under:

- `ml/reports/<timestamp>/validation_metrics.csv`
- `ml/reports/<timestamp>/cross_validation_metrics.csv`
- `ml/reports/<timestamp>/experiment_summary.json`
- `ml/reports/<timestamp>/feature_importance.csv`
- `ml/reports/<timestamp>/permutation_importance.csv`
- `ml/reports/<timestamp>/global_shap_importance.csv`
- `ml/reports/<timestamp>/local_shap_explanations_test.csv`

If those reports already exist for your experiments, cite them directly in the dissertation tables and discussion.

### Interpretation angle

A strong discussion angle is:

- structured HR and performance variables remain important
- document-derived quality/completeness signals add a new evidence dimension
- evaluator validation improves label trustworthiness
- explainability outputs make the model more defensible in institutional settings

## Chapter 7: Conclusions

Your conclusion should emphasize that the project achieved a practical integration of:

- promotion-record digitization
- criterion-based evidence capture
- OCR-assisted text extraction
- evaluator-mediated dataset creation
- reproducible boosting-model experimentation

Then state clearly that:

- live automated prediction remains intentionally disabled pending larger validated datasets and institutional calibration

That sentence protects the dissertation from overstatement and actually strengthens your credibility.

## Honest Limitations to Include

These are visible from the repository and should be acknowledged:

- Live prediction endpoints are intentionally inactive.
- The new Vue frontend is not yet a complete migration of all legacy UI behavior.
- OCR quality depends on document clarity and provider configuration.
- Filename-based document linking is helpful but heuristic.
- The training pipeline depends on having enough validated positive and negative labels.
- The TQE dataset is used as a reference source, not the final promotion-outcome ground truth dataset.

These are not weaknesses to hide. They are strong limitation statements because they are specific, technically grounded, and easy to justify.

## Strong Contributions to Emphasize

- Integration of operational workflow and ML dataset curation in one platform.
- Use of document-derived evidence features, not just manually entered numeric data.
- Human-in-the-loop evaluator validation before model training.
- Reproducible offline ML comparison with explainability outputs.
- Alignment of evidence capture with KRA/NBC-style promotion criteria.

## High-Risk Claims to Soften During Revision

If your draft currently uses any of the statements below, soften them:

- "The system predicts promotions in real time."
- "The model is already deployed for live institutional decision-making."
- "The system fully automates the faculty promotion process."
- "The Vue frontend completely replaced the old interface."

Safer alternatives:

- "The system prepares and validates machine-learning-ready promotion records."
- "The analytical layer supports offline model comparison and interpretation."
- "The platform is intended to assist, not replace, evaluator decision-making."
- "The system is undergoing a staged frontend modernization."

## Suggested Figures for the Revised Paper

- Overall system architecture diagram
- Use case diagram for Employee, Evaluator, and Admin
- Activity diagram for evidence submission and validation
- Data flow diagram from upload to training dataset export
- Entity relationship diagram from `schema.prisma`
- ML workflow diagram for export, train/validate/test, and explainability outputs

## Suggested Tables for the Revised Paper

- Table of system modules and responsibilities
- Table of API endpoint groups
- Table of database entities and attributes
- Table of the 12 engineered features and their meanings
- Table comparing AdaBoost, Gradient Boosting, and XGBoost metrics
- Table of top feature importance and SHAP findings
- Table of system limitations and future enhancements

## Suggested "Future Work" Section

Future work can credibly include:

- enabling live inference after institutional validation
- expanding the validated dataset size
- improving OCR robustness for low-quality scans
- replacing heuristic filename matching with stronger document-to-profile linkage
- completing the Vue migration for all dashboards and upload workflows
- adding audit trails, calibration studies, and fairness analysis across departments or ranks

## Ready-to-Use Revision Paragraph

You may adapt this paragraph directly:

> The implemented Faculty Promotion System should be understood as a hybrid decision-support platform rather than a fully automated promotion engine. Its current contribution lies in structuring faculty records, digitizing documentary evidence, extracting analyzable signals from PDF and image uploads, enabling evaluator-assisted labeling, and supporting reproducible offline experimentation using boosting-based machine learning models. This staged architecture was intentionally adopted to prioritize data quality, transparency, and institutional trust before considering live predictive deployment.

## Recommended Supporting Files to Cite While Revising

- `README.md`
- `src/server.ts`
- `src/routes/index.ts`
- `src/controllers/faculty.controller.ts`
- `src/controllers/document.controller.ts`
- `src/controllers/training.controller.ts`
- `src/utils.ts`
- `src/utils/document.utils.ts`
- `src/ocr.ts`
- `prisma/schema.prisma`
- `ml/README.md`
- `ml/train_boosting_models.py`
- `frontend/src/router/index.ts`

## Final Revision Advice

If you want the dissertation to feel technically strong and defensible, the best strategy is to present this project as a trustworthy pipeline for faculty-promotion data capture, evidence digitization, evaluator validation, and offline predictive experimentation. That claim is fully supported by the current repository.

The weakest possible revision path would be to describe it as if fully automated real-time prediction is already deployed, because the codebase does not support that claim yet. The strongest path is honest precision.
