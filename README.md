# Faculty Promotion System

Faculty Promotion System is a document-first web system for reducing the manual work of faculty promotion evaluation. Its main purpose is to replace the thick, repetitive paper-based review process with an upload, OCR, evidence-checking, score-computation, and evaluator-review workflow.

The system should let faculty members submit score sheets and documentary evidence, let the application read and validate those files against the required evidence list and DBM/NBC 461 rules, and let evaluators review scores and documents without manually sorting through every paper packet.

## Main Goal

The system has two user-facing sides.

### Employee Side

The employee side should make the faculty member's task as simple as possible:

1. Upload score sheets.
2. Upload documentary evidence.
3. Let the system read the uploaded documents.
4. Show detected scores in the UI.
5. Check whether all required evidence has been uploaded.
6. Show missing score sheets, missing evidence, and incomplete KRA panels.
7. Compute overall scores from what is actually presented.
8. Mark missing scores or missing evidence as `0` where no valid score/evidence is presented.
9. Let the employee view uploaded files.
10. Let the employee modify uploads by replacing or re-uploading files.
11. Let the employee delete uploaded files.

The employee should not need to manually retype KRA scores if the score sheet already contains them.

### Evaluator Side

The evaluator side should focus on review, verification, and monitoring:

1. View computed scores.
2. View all uploaded documents.
3. Preview score sheets and evidence files.
4. Check OCR/extracted values against the actual uploaded documents.
5. See incomplete evidence packets and score/evidence mismatches.
6. See visual metrics such as:
   - number of faculty who filed for promotion
   - number of complete and incomplete submissions
   - number of uploaded score sheets
   - number of uploaded evidence files
   - evidence completion rate per KRA
   - average system score
   - count of submissions needing evaluator attention

The evaluator workflow should reduce manual review effort. It should not blindly approve promotions.

## Reference Documents

The scoring and evidence workflow should be aligned with:

- `DBM-JC-No-3-s-2022-9th-cycle-NBC-461-with-Annexes.pdf`
- `Reference.xlsx`
- the List of Documentary Evidences reference, if maintained as a separate PDF or workbook

Current repository note: only the DBM-JC PDF, `Reference.xlsx`, and `TQE.csv` are present in the root folder. If the List of Documentary Evidences is a separate PDF, add it to the repository so the validation rules can be checked against the exact source file.

## Current Verified Status

Verified on 2026-06-30:

- The live Render deployment responds at `https://faculty-promotion-system-0l51.onrender.com/`.
- `GET /api/health` reports production mode.
- TQE reference data is loaded with `1000` rows.
- The DBM-JC/NBC 461 guideline PDF is loaded.
- OCR is ready through OCR.space in the deployed environment.
- `npm test` passed all 21 tests.
- `npm run build` passed.
- `node --check public/workflow.js` passed.
- `git diff --check` passed with line-ending warnings only.

After this documentation consolidation, `README.md` is the single markdown document for the repository.

## What Already Works

- Account registration and login.
- Role-based access for employee, evaluator, and admin users.
- Active static UI in `public/`.
- Express + TypeScript backend.
- Prisma + PostgreSQL persistence.
- PDF parsing with `pdf-parse`.
- Image OCR through the configured OCR provider.
- KRA/criterion upload panels.
- Separate upload paths for score sheets and evidence.
- One-file limit for each score-sheet upload request.
- Multiple-file evidence upload support.
- File preview for uploaded documents.
- Employee file replacement for score sheets and evidence documents.
- Employee file deletion.
- Uploaded-document storage and metadata extraction (Supabase Storage).
- Panel score preview metadata for score-sheet uploads.
- Evidence completeness checking.
- Missing score sheet and missing evidence detection per required panel.
- Evidence-based score computation that counts missing score sheets or missing evidence as `0` for the panel.
- Panel score cards that show computed score previews and zero fallback when evidence is incomplete.
- Live score summary UI with KRA totals, criterion scores, total score, weighted score, panel coverage, and zeroed-panel count.
- Employee-side OCR-backed summary.
- Evaluator review queue.
- Evaluator document browser grouped by employee.
- Evaluator-side summary cards for zeroed panels, average coverage, and evidence score signals.
- Backend `workbookMirror` summary data with request-form, KRA, comparison, and summary-sheet fields.

## What Still Needs To Be Achieved

These are the highest-priority items needed to match the target system goal:

1. Continue visual polish on the score summary after testing with real score sheets and evidence packets.

## Current Development Checkpoint

This checkpoint is the active development baseline before the next feature pass:

- Documentation has been compressed into this single `README.md`.
- The employee portal now shows a live score summary with per-KRA totals, per-criterion values, total score, weighted score, panel coverage, and zeroed-panel count.
- The backend computes evidence-based scores with the policy `zero-if-missing-score-or-evidence`.
- Required panels without score sheets, detected scores, or supporting evidence are counted as `0`.
- Employee uploads now support view, replace, and delete actions.
- Replacement uploads keep the old document intact if the new file fails OCR or processing.
- Evaluator cards now surface evidence score and zeroed-panel signals.
- The next implementation pass should focus on OCR mismatch warnings and workbook-style views.

## Core Workflow

1. A faculty member signs in.
2. The faculty member creates or updates the basic faculty profile.
3. The faculty member uploads score sheets and evidence files per KRA/criterion.
4. The backend stores the uploaded files.
5. The backend extracts text from PDFs or images.
6. OCR/PDF parsing attempts to detect KRA/criterion scores.
7. The system links uploaded files to KRA/criterion panels.
8. The system checks whether required evidence is present.
9. Missing required evidence keeps the packet incomplete.
10. Missing scores or missing required evidence should count as `0` in the computed total.
11. The employee sees detected scores, uploaded files, missing requirements, and computed summaries.
12. The evaluator views all submitted records, documents, scores, and validation flags.
13. The evaluator verifies the output and uses the system to reduce manual review work.

## Evidence Validation Rules

The validation logic should follow these rules:

- `AND` means every listed document is required.
- `OR` means at least one valid alternative is required.
- Optional or bonus evidence does not replace required evidence.
- A score sheet alone is not enough if supporting evidence is missing.
- Supporting evidence alone is not enough if the score sheet is required for OCR score comparison.
- Missing required documents should produce an incomplete state.
- Incomplete evidence should block final promotable status.
- If no valid score or evidence is presented for a criterion, that criterion should be computed as `0`.

## KRA Evidence Areas

### KRA I - Instruction

- Teaching Effectiveness
- Curriculum and Instructional Materials Development
- Thesis, Dissertation, and Mentorship Services

### KRA II - Research, Innovation and Creative Work

- Research Outputs
- Inventions
- Creative Works

### KRA III - Extension Services

- Service to Institution
- Service to the Community
- Extension Involvement or Quality of Extension Service
- Bonus criteria, where applicable

### KRA IV - Professional Development

- Involvement in Professional Organizations
- Continuing Development
- Awards and Recognitions
- Academic Experience for new entrants only
- Industry Experience for new entrants only

## Score Computation Direction

The system should compute from evidence actually submitted and recognized:

1. Read score-sheet values through OCR/PDF parsing.
2. Match detected scores to the correct KRA/criterion panel.
3. Check that supporting evidence exists for the panel.
4. Use the detected score only when the score and evidence pass validation.
5. Use `0` when no score is detected.
6. Use `0` when required evidence is missing.
7. Sum criterion scores into KRA totals.
8. Compute the overall score from KRA totals using the official DBM/NBC 461 rules.
9. Show score brackets and draft rank as advisory only.

The current backend now returns a zero-if-missing score-computation payload, and the employee UI shows live KRA, criterion, total, weighted-score, coverage, and zeroed-panel summaries. The remaining scoring work is to validate the exact official formula against the final documentary-evidence source files and real packets.

## Evaluator Metrics To Add

The evaluator dashboard should eventually include:

- total faculty submissions
- submissions by status: complete, incomplete, needs review, verified
- total uploaded score sheets
- total uploaded evidence files
- average evidence completion rate
- KRA panels most often missing evidence
- OCR confidence or extraction quality indicators
- average computed score
- distribution of projected/draft ranks
- number of records requiring evaluator attention

## Architecture

- Backend: Express + TypeScript
- Database: PostgreSQL through Prisma (hosted on Supabase)
- Document Storage: Supabase Storage (`documents` bucket)
- Active frontend: static HTML/CSS/JavaScript in `public/`
- Frontend migration workspace: Vue 3 + Vite in `frontend/`
- Authentication: JWT through `Authorization` header or `fps_session` cookie
- Document processing: PDF parsing and OCR

## Important Source Areas

```text
src/server.ts                         Express app setup
src/routes/                           API routes
src/controllers/document.controller.ts Upload, preview, and delete behavior
src/controllers/dashboard.controller.ts Employee and evaluator dashboard payloads
src/utils/document.utils.ts            PDF/OCR processing and file linkage
src/utils/evidenceValidation.ts        Evidence completeness rules
src/utils/dashboard.utils.ts           Score summaries and workbookMirror payload
src/uploadPanels.ts                    KRA/criterion upload panel catalog
src/uploadWorkflow.ts                  Score-sheet/evidence workflow metadata
public/employee.html                   Active employee portal
public/evaluator.html                  Active evaluator portal
public/workflow.js                     Current active portal behavior
prisma/schema.prisma                   Database schema
```

## Main API Areas

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/config/upload-panels`
- `GET /api/config/upload-workflow`
- `GET /api/config/faculty-options`
- `POST /api/faculty/ingest`
- `PATCH /api/faculty/:profileId`
- `POST /api/documents/extract`
- `GET /api/documents/:documentId/view`
- `POST /api/documents/:documentId/replace`
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
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

> **Note:** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are required in production for document uploads and preview. They are optional for local development and tests — the system will throw a clear error if storage operations are attempted without them.

## Local Development

```bash
npm install
npm run db:generate
npm run db:migrate
npm run dev
```

The backend serves the active portals at:

- `http://localhost:3000/`
- `http://localhost:3000/employee`
- `http://localhost:3000/evaluator`

## Common Commands

- `npm run dev` - start the backend in watch mode
- `npm run build` - compile TypeScript to `dist/`
- `npm test` - run utility and workflow regression tests
- `npm run start` - run the compiled backend
- `npm run db:migrate` - apply development migrations
- `npm run db:deploy` - apply deploy-safe migrations
- `npm run db:push` - push Prisma schema changes directly
- `npm run db:studio` - open Prisma Studio

## Machine Learning Workflow

The offline machine learning components (dataset preparation, boosting-model comparison, and explainability reporting) have been migrated to a separate repository named `bfar-ml`.

The Faculty Promotion System's role in the machine learning pipeline is strictly to prepare, structure, and validate the promotion data. The `bfar-ml` repository consumes this data for offline experimentation.

## Thesis Framing

A safe project framing is:

> The Faculty Promotion System is a hybrid decision-support platform that digitizes faculty promotion submissions, extracts scores from uploaded score sheets, validates documentary evidence against KRA requirements, computes advisory promotion summaries, and gives evaluators a centralized review dashboard for reducing manual paper-based evaluation work.

Do not claim that the system makes final promotion decisions. Final evaluation should remain with authorized evaluators and institutional committees.

## Consolidated Release Notes

### 2026-07-01

- Enforced strict documentary evidence validation logic based on the `AND`/`OR` rules defined in `evidenceRules.ts`.
- Integrated OCR-driven keyword extraction (`keywordHits`) into the document metadata processing pipeline.
- Modified score computation to strictly fall back to `0` if specific required keywords (e.g., "student evaluation", "certification") are lacking in a KRA panel's uploaded evidence files, replacing the naive file-existence check.
- Updated `validateEvidencePacket` to surface missing evidence warnings to both the employee and evaluator UI when the specific evidence requirements are unmet.

### 2026-06-30

- Consolidated repository documentation into this single `README.md`.
- Verified the live Render deployment.
- Verified production health response, OCR readiness, and loaded TQE data.
- Clarified the true target goal: employee upload automation and evaluator review/analytics.
- Added evidence-based zero-if-missing score computation for required KRA/criterion panels.
- Added a live employee score summary for KRA totals, criterion scores, total score, weighted score, panel coverage, and zeroed panels.
- Added employee upload replacement beside view and delete.
- Added evaluator-side evidence score and zeroed-panel signals.
- Digitized "List of Documentary Evidences" into strict machine-readable AND/OR rules (`evidenceRules.ts`).
- Updated evidence validation logic to use strict rules.
- Added OCR mismatch and missing evidence warnings to employee UI.
- Built workbook-style Request Form and Individual Summary Sheet views in evaluator portal.
- Added audit trails (`AuditLog`) for document replacement, deletion, and evaluator review status changes.
- Added visual metrics to evaluator dashboard.
- Migrated document storage from local filesystem to **Supabase Storage** (`documents` bucket) for production compatibility with ephemeral hosts like Render.
- Made Supabase client lazy-initialized so tests and local dev work without Supabase credentials.
- Extracted `canViewUploadedDocument` into a pure module to eliminate async side-effect leaks in tests.
- All 21 tests pass, build is clean.

### 2026-06-19

- Added strict evidence validation guidance.
- Clarified that missing required evidence keeps a promotion packet incomplete.
- Documented `AND` and `OR` evidence behavior.

### 2026-06-17

- Added workbook-mirror dashboard data.
- Aligned KRA II wording with `Research, Innovation and Creative Work`.
- Added score comparison and summary-sheet context in backend utilities.

### 2026-06-03

- Improved dashboard layout behavior.
- Revised printable summary-sheet layout in the older UI path.

### 2026-05-27

- Expanded employee and evaluator dashboard layouts.
- Added wider desktop-first organization for review work.

### 2026-05-22

- Documented baseline profile data and current-cycle data split.

### 2026-05-21

- Improved session consistency.
- Added backend utility tests.
- Improved uploaded-file handling and filtering in the earlier active portal path.

## Immediate Implementation Plan

To fully achieve the system goal, build in this order:

1. Validate the final official score formula against real score sheets and the DBM-JC/List of Documentary Evidences references.
