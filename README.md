# Faculty Promotion System

Faculty Promotion System is a full-stack TypeScript application for collecting faculty promotion records, uploading documentary evidence, extracting text from PDFs and images, supporting evaluator review, and preparing machine-learning-ready promotion data aligned with NBC 461-style workflows.

## What This Repository Is

This repository currently has two active layers:

1. An operational application layer for faculty record intake, document upload, OCR/PDF extraction, evaluator review, and dashboard summaries.
2. An analytical layer for offline dataset export, boosting-model training, and explainability reporting.

The active user-facing interface is the static portal in `public/`. The Vue app in `frontend/` is still a migration workspace and is not the main runtime UI.

## Current Status

- The backend and active `public/` interface are the main working system.
- The employee and evaluator portals now use a wider desktop-first dashboard layout so full-screen views make better use of available horizontal space.
- The employee upload panels and evaluator database viewer stay anchored in the left dashboard column so they no longer overlap the sticky right-side scoring utilities.
- The evaluator portal now includes a printable summary-sheet editor so the subject name block and signature lines can be adjusted before exporting to PDF.
- Employee profile maintenance now separates baseline profile data from current promotion-cycle inputs.
- Employees can receive a preliminary rank estimate even before evaluator scoring is completed.
- The employee-side approximate score summary now stays sticky during scroll without being covered by the upload panels.
- Evaluator scoring still takes priority and produces the stronger draft-rank recommendation once available.
- Live machine-learning prediction inside the deployed API is intentionally disabled.
- Offline ML training, comparison, and explainability reporting are implemented in `ml/`.

## Architecture

- Backend: Express + TypeScript + Prisma + PostgreSQL
- Active frontend: static HTML/CSS/JavaScript in `public/`
- Frontend migration target: Vue 3 + Vite in `frontend/`
- Authentication: JWT with `Authorization` header or `fps_session` cookie
- Document processing: `pdf-parse` for PDFs and OCR for supported images
- ML workflow: Python scripts for offline export, training, evaluation, and explainability

## Core Features

- Employee account registration and login
- Role-based employee, evaluator, and admin access
- Full-width employee and evaluator dashboard layouts with responsive collapse back to a single-column flow on narrower screens
- Sticky employee-side approximate scoring summary that remains readable while the upload section scrolls beneath it
- Left-column employee upload panels and evaluator database viewer that avoid colliding with the sticky scoring rail
- Faculty profile capture with baseline identity, rank, attainment, and promotion history
- Current-cycle submission fields for review-period performance metrics and cycle notes
- Criterion-based uploads grouped by KRA
- PDF parsing and image OCR
- Upload-to-profile linkage using explicit profile selection or filename matching fallback
- Evaluator scoring workflow and review queue
- Printable evaluator summary-sheet export through the browser print flow
- Employee-side evidence coverage summary
- Preliminary employee-side rank estimation from inputs and uploaded evidence
- Evaluator-backed draft-rank computation from criterion scores
- Standardized faculty rank and educational-attainment option catalogs from the backend
- Dataset export for offline machine learning
- Admin database overview

## Faculty Record Model

Faculty records now distinguish between two data layers:

- `baselineData` stores longer-lived profile fields such as identity, academic rank, highest educational attainment, and promotion history.
- `cycleData` stores the active review period inputs such as IPCR averages, teaching effectiveness, research and extension values, professional development hours, and cycle-specific notes.

This split keeps promotion-history and eligibility data stable across updates while letting employees revise only the current cycle inputs when a new review period starts.

## Promotion Draft and Rank Estimation

The dashboard computes a `promotionDraft` summary on the server.

Depending on available data, it can include:

- current academic rank
- suggested draft rank
- projected rank
- evaluator total score
- weighted score
- sub-rank increments
- applied weight profile
- confidence label
- pending requirements for eligibility constraints

### Preliminary estimate mode

When evaluator scoring is not yet available, the system can still generate a preliminary estimate using:

- baseline profile data such as current rank, attainment, and promotion history
- current-cycle performance values
- extracted document scores from OCR/PDF analysis
- upload coverage across KRA panels
- average document completeness
- current academic-rank group
- highest educational attainment for eligibility checks

This estimate is advisory and is labeled as preliminary.

### Evaluator-backed mode

When the latest training item is `LABELED` or `VALIDATED` and contains criterion scores, the system computes the rank result from evaluator-backed KRA totals.

This result takes priority over the preliminary estimate.

### Important note

The draft-rank feature is a decision-support aid. It is not a final committee decision and should not be treated as an automated promotion outcome.

## Request Flow

1. Users register or log in.
2. Employees create or update a baseline faculty profile.
3. Employees maintain the current promotion-cycle fields for the active review period.
4. Employees upload PDF or image evidence to criterion-specific KRA panels.
5. The backend parses PDFs or runs OCR on images and stores extracted text and metadata.
6. The system summarizes evidence coverage and can compute a preliminary rank estimate.
7. Evaluators review submissions and assign criterion scores.
8. The dashboard upgrades the rank result to an evaluator-backed draft recommendation when scoring exists.
9. Labeled and validated examples can be exported for offline ML training and comparison.

## Project Structure

```text
.
|-- src/                 # Express app, routes, controllers, Prisma-backed logic
|-- public/              # Active employee/evaluator portal UI
|-- frontend/            # Vue migration work-in-progress
|-- prisma/              # Prisma schema and migrations
|-- scripts/             # Dataset export and utility scripts
|-- ml/                  # Offline ML workflow, artifacts, and reports
|-- uploads/             # Local upload/output workspace if used in development
|-- dist/                # Compiled backend output
```

## Main API Areas

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/config/upload-panels`
- `GET /api/config/faculty-options`
- `POST /api/faculty/ingest`
- `POST /api/documents/extract`
- `DELETE /api/documents/:documentId`
- `GET /api/employee/dashboard`
- `GET /api/evaluator/review-queue`
- `GET /api/dashboard/:profileId`
- `GET /api/admin/database-overview`
- `GET /api/health`

## Environment Variables

Use `.env.example` as the starting point.

```env
DATABASE_URL="postgresql://user:pass@localhost:5432/faculty_promotion?schema=public"
PORT=3000
NODE_ENV="development"
AUTH_SECRET="change-this-to-a-long-random-production-secret"
CORS_ORIGIN="http://localhost:3000"
TRUST_PROXY=1
OCR_PROVIDER="windows"
OCR_API_URL="https://api.ocr.space/parse/image"
OCR_API_KEY=""
OCR_API_KEY_HEADER="Authorization"
OCR_FILE_FIELD_NAME="file"
OCR_TIMEOUT_MS=30000
```

## Local Development

### Backend

- `npm install`
- `npm run db:generate`
- `npm run db:migrate`
- `npm run dev`

The backend serves the active portals at:

- `http://localhost:3000/employee`
- `http://localhost:3000/evaluator`

### Frontend migration app

- `cd frontend`
- `npm install`
- `npm run dev`

Use this only for migration or exploratory UI work unless the team explicitly switches runtime ownership to Vue.

## Common Commands

- `npm run dev` - start the backend in watch mode
- `npm run build` - compile TypeScript to `dist/`
- `npm test` - run the lightweight utility and workflow regression tests
- `npm run start` - run the compiled backend
- `npm run db:migrate` - apply development migrations
- `npm run db:deploy` - apply deploy-safe migrations
- `npm run db:push` - push Prisma schema changes directly
- `npm run db:studio` - open Prisma Studio

## Offline ML Workflow

### 1. Install Python dependencies

```bash
pip install -r ml/requirements.txt
```

### 2. Export labeled and validated training data

```bash
npm run ml:export-dataset
```

Default export:

`data/exports/objective-305-training-dataset.csv`

### 3. Train and compare models

```bash
npm run ml:train-boosting
```

Optional example:

```bash
python ml/train_boosting_models.py --cv-folds 5 --small-dataset-threshold 60
```

### Outputs

- `ml/reports/<timestamp>/validation_metrics.csv`
- `ml/reports/<timestamp>/cross_validation_metrics.csv`
- `ml/reports/<timestamp>/experiment_summary.json`
- `ml/reports/<timestamp>/test_confusion_matrix.csv`
- `ml/reports/<timestamp>/feature_importance.csv`
- `ml/reports/<timestamp>/permutation_importance.csv`
- `ml/reports/<timestamp>/global_shap_importance.csv`
- `ml/reports/<timestamp>/local_shap_explanations_test.csv`
- `ml/artifacts/<timestamp>/best_model.joblib`
- `ml/artifacts/<timestamp>/feature_columns.json`
- `ml/artifacts/<timestamp>/training_metadata.json`

## Upload Behavior

- Supported evidence types are PDFs and common image formats.
- Spreadsheet and CSV uploads are rejected in criterion-based upload panels.
- The old PDF naming-convention requirement is no longer enforced as an upload restriction.
- Filename matching may still be used as a fallback for linking uploads to a faculty profile when explicit profile linkage is unavailable.

## Deployment Notes

- Host the backend on a Node-capable platform such as Render, Railway, or Fly.io.
- Provision PostgreSQL and run `npm run db:deploy` during deployment.
- Configure CORS and `TRUST_PROXY` according to your hosting setup.
- For production OCR, set `OCR_PROVIDER=http` and provide the corresponding API credentials.
- If you deploy the active UI from this repository today, serve the backend and `public/` assets together.

## Known Gaps

- The Vue frontend is not yet the main app experience.
- Promotion draft rules are advisory and still need continued validation against official institutional policy.
- Live inference endpoints remain intentionally disabled.
- Audit-ready explanations and fuller committee approval workflows are still future work.
- Automated tests are still limited and should be expanded around rank normalization and promotion-draft rules.

## Recommended Documentation

For day-to-day system usage and implementation details, use this file:

- `README.md`

For dissertation and paper revision work, use:

- `DISSERTATION_REVISION_GUIDE.md`
