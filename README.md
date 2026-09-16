# Faculty Promotion System

Faculty Promotion System is a document-first web system for reducing the manual work of faculty promotion evaluation. Its main purpose is to replace the thick, repetitive paper-based review process with an upload, OCR, evidence-checking, score-computation, and evaluator-review workflow.

The system lets faculty members submit documentary evidence, reads and validates those files against the required evidence list and DBM-CHED Joint Circular No. 3, s. 2022 (JC3, operationalizing NBC 461) rules, and lets evaluators and administrators review scores and documents without manually sorting through every paper packet.

## Main Goal

The system has three user-facing roles: Faculty (employee), Evaluator, and Admin.

### Faculty Side

The faculty side makes the faculty member's task as simple as possible:

1. Upload documentary evidence per KRA/criterion. Score sheets are not part of this flow at all - they are only produced *after* JC evaluation, so a pre-JC faculty member never has one to upload.
2. Let the system read the uploaded documents and OCR-detect a score for the panel from that evidence itself.
3. Check whether all required evidence has been uploaded, and restrict uploads to documents dated within the current promotion cycle.
4. Show missing evidence and incomplete KRA panels.
5. Compute the draft score from the evidence actually uploaded, in priority order: an explicit OCR-detected score for the panel, then a fractional evidence-checklist match against the DBM-JC documentary evidence list, then a conservative topical-relevance estimate (capped at 45% of the panel max), then `0` if no evidence was ever uploaded.
6. Let the employee view, replace, or delete uploaded files.

The employee never manually retypes KRA scores. The draft score is derived entirely from OCR-detected values and evidence-checklist matching against the uploaded documentary evidence - there is no "present = full marks" shortcut anywhere in the pipeline.

### Evaluator Side

The evaluator side is read-only review, verification, and monitoring:

1. View computed scores and a consolidated Faculty Summary roster (every faculty member's current rank, projected rank, weighted score, and status in one table).
2. View all uploaded documents, grouped by faculty member, with per-document OCR analysis (detected score fields, panel-aligned category matches, extracted character count).
3. Preview evidence files in-browser.
4. Approve or disapprove each KRA criterion individually against a faculty member's Summary Sheet (lightweight sign-off, no full numeric score required).
5. Record a fuller verified per-criterion assessment and a promoted/not-promoted determination for training-data purposes, shown side by side with the system's own OCR-derived estimate.
6. See cycle-wide analytics: queue records, complete/incomplete packets, evidence files, average evidence score, average coverage, score-bracket distribution, and which KRA panels are most often missing evidence.
7. Generate workbook-style Request Form and Individual Summary Sheet views, and the Faculty Summary roster, each printable/exportable as PDF directly from the browser.

The evaluator workflow reduces manual review effort. It does not blindly approve promotions - final decisions remain with the institution's promotion committee, working outside the platform.

### Admin Side

The admin side manages the platform itself:

1. Manage accounts: deactivate, reactivate, or delete any account; reset a locked-out user's password (generates a one-time temporary password and forces that user through a mandatory password-change screen on next sign-in).
2. View platform-wide counts (profiles, documents, training examples) via a database overview.
3. Share the same Faculty Summary roster and printable Summary Sheet views available to evaluators.

There is no self-registration path to ADMIN - it is granted only via `scripts/promote-to-admin.ts`, run directly against the database.

## Reference Documents

The scoring and evidence workflow is aligned with `DBM-JC-No-3-s-2022-9th-cycle-NBC-461-with-Annexes.pdf` (root of this repo) - specifically:

- **Table 2.1 (Point System)**: per-KRA point breakdown and the 100-point cap per KRA.
- **Table 2.2 (KRA Weights per Faculty Rank)**: verified against the source PDF on 2026-08-11 (the table lives on page 5 of 8 in the circular's main body, *before* Annex I - a page range that `pdf-parse` silently fails to extract text from due to a font-decoding issue, which is why it went unverified for a while). Confirmed to exactly match `rankGroups` in `src/utils/dashboard.utils.ts`:

  | Rank | Instruction | Research | Extension | Prof. Dev. |
  |---|---|---|---|---|
  | Instructor (I-III) | 60% | 10% | 20% | 10% |
  | Assistant Professor (I-IV) | 50% | 20% | 20% | 10% |
  | Associate Professor (I-V) | 40% | 30% | 20% | 10% |
  | Professor (I-VI) | 30% | 40% | 20% | 10% |
  | Col./Univ. Professor | 20% | 50% | 20% | 10% |

  Note: Professor-rank promotions are capped at 1 sub-rank increment per cycle regardless of score, unlike every other rank (which follows the circular's general 1-6 sub-rank scale by score bracket). This is not stated in the circular itself - it is confirmed intentional LSPU-local policy (the circular's §4.1 permits an SUC Governing Board to impose stricter rules), not a bug.
- **Table 3.1/3.2**: score-bracket-to-sub-rank-increment mapping and rank/sub-rank naming - also verified to match the live code.

`evidenceRules.ts` digitizes the "List of Documentary Evidences" (per-KRA required-evidence checklist) into machine-readable `AND`/`OR` rules.

## Current Verified Status

Verified on 2026-08-12:

- `tsc --noEmit` clean.
- `npm test` passes 52 pure unit/scoring tests (no database required).
- `npm run test:integration` passes 8 HTTP-level integration tests against the real Express app and database (auth flows, permission boundaries, the admin-reset-password forced-change flow) - 60 tests total.
- Dev server boots cleanly with zero console/server errors across all three portals (employee, evaluator, admin).
- The Content-Security-Policy header is live and verified against the riskiest real path: the document-preview iframe, which loads a `blob:` URL created via `URL.createObjectURL` - confirmed zero CSP violations end to end, including a real upload → fetch → blob → iframe round trip.
- OCR is self-hosted-fallback-capable: 0 of 438 real production documents currently have empty extracted text (down from a meaningful failure rate before the `tesseract.js`/`pdf-to-img` fallback was added).
- The live deployment is on Render (`https://faculty-promotion-system-0l51.onrender.com`); `netlify.toml` also exists in the repo for publishing the static `public/` frontend independently via Netlify.

## What Already Works

- Account registration and login for Faculty and Evaluator roles (JWT via `fps_session` httpOnly cookie); ADMIN is provisioned separately, never self-registered.
- Role-based access control enforced at the API layer (every route checks the caller's role via `requireRole`, not just hidden in the UI).
- Admin-assisted password reset: an admin generates a one-time temporary password for a locked-out account; the affected user is forced through a mandatory "set new password" screen on next sign-in before reaching their portal. Logged to `AuditLog` (`PASSWORD_RESET` / `PASSWORD_CHANGED`).
- Content-Security-Policy and other security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS in production).
- Auto-creation of a `FacultyProfile` on an employee's first document upload - no separate manual intake step.
- Active static UI in `public/` (Faculty, Evaluator, and Admin portals) served directly by the Express backend. A Vue 3 + Vite rewrite exists as an early-stage scaffold in `frontend/` but has not replaced the deployed frontend.
- Express + TypeScript backend, split into `src/app.ts` (the Express app itself, importable without starting a server - this is what the integration tests exercise) and a thin `src/server.ts` bootstrap.
- Prisma + PostgreSQL persistence (Supabase-hosted).
- Document text extraction: `pdf-parse` for text-layer PDFs, OCR.space for scanned images/image-based PDFs, with a **self-hosted `tesseract.js` + `pdf-to-img` fallback** that automatically takes over whenever the configured OCR provider fails or exceeds its size/timeout limits - a document's size no longer determines whether it gets scored.
- KRA/criterion upload panels, restricted to the current promotion cycle's date range.
- File preview, replacement, and deletion for uploaded evidence documents.
- Uploaded-document storage and metadata extraction via Supabase Storage (`documents` bucket) - survives across deploys on ephemeral hosts like Render.
- Evidence-based score computation with three ordered scoring tiers per panel (`scoreSource`: `ocr-detected` → `evidence-checklist` → `evidence-relevance-estimate` → `0` for no evidence at all). Score extraction is anchored to full panel-title/KRA-heading phrases only (not individual generic words), and rejects both bare calendar years and day-of-month date fragments, to avoid fabricating a score from an unrelated number (control numbers, dates, page numbers) elsewhere in a document.
- Per-panel evidence-checklist fractional credit (`AND` rules average their conditions' match fractions, `OR` rules take the best alternative) when no explicit score is OCR-detected.
- Live employee-side score summary: per-KRA totals, per-panel scores with their source tier, total score, weighted score (using the verified rank-weight table above), score bracket, and advisory projected rank.
- Official rank-resolution logic: gates entry into Associate Professor/Professor on doctoral qualification, gates first-time Professor rank on pending EAC accreditation, gates College/University Professor on pending Certification Committee approval, and recomputes weights when a faculty member's sub-rank increments cross into the next rank group.
- Evaluator review queue and document browser grouped by faculty member, each document annotated with its OCR analysis.
- Per-criterion evaluator approve/disapprove review (`CriterionReview`), independent of the fuller verified-assessment/training-example mechanism.
- Consolidated Faculty Summary roster (current rank, projected rank, weighted score, status) shared by Evaluator and Admin, plus workbook-style Request Form and Individual Summary Sheet views - all printable/exportable to PDF directly from the browser.
- Admin accounts management (deactivate/reactivate/delete/reset-password) and a database overview.
- Audit logging (`AuditLog`) for account and document actions, and evaluator review activity.
- Automated test coverage: 52 pure unit tests (scoring math, evidence validation, cookies, password hashing, Zod schemas) plus 8 HTTP-level integration tests against the real app and database covering the full auth lifecycle (register/login/logout/change-password) and the admin-reset-password flow end to end.

## What Still Needs To Be Achieved

Most of what was previously tracked here has been closed out. Remaining known gaps:

1. OCR score extraction still relies on regex heuristics anchored to panel titles. Two concrete false-positive classes (generic-word matches, date-adjacency matches) were found and fixed on 2026-08-11 with a live-data backfill, but the underlying approach is still heuristic - roughly 16.5% of currently-detected scores still exceed their panel's own max (down from ~24% before the fix), though `usedScore` is always capped to the panel max downstream so this is not currently causing incorrect final scores.
2. No automated test coverage yet for controllers/routes outside auth (documents, dashboard, review, training, accounts) - the auth suite is the first HTTP-level integration coverage this project has had.
3. Continue visual polish on the score summary after testing with real evidence packets.

## Current Development Checkpoint

- Score sheets have been removed from the product entirely (not just made optional) - the employee side has no score-sheet upload path, only evidence uploads per panel.
- The backend computes evidence-based scores with the policy `zero-if-missing-evidence`, using the three-tier `scoreSource` system described above.
- Required panels without any uploaded evidence are counted as `0`.
- The next implementation pass, if picked up, should focus on broader controller/route test coverage and tightening OCR score-extraction accuracy further.

## Core Workflow

1. A faculty member signs in (or an admin resets their password if they're locked out, forcing a password change on next sign-in).
2. The faculty member sets identity details (academic rank, department, educational attainment) via a Profile Details form - the only manually-typed fields in the system.
3. The faculty member uploads documentary evidence per KRA/criterion, restricted to the current promotion cycle's date range.
4. The backend stores the uploaded files in Supabase Storage and extracts text via `pdf-parse`, OCR.space, or the self-hosted `tesseract.js` fallback.
5. The system attempts to detect an explicit score for the panel from that text; if none is found, it falls back to evidence-checklist matching, then a capped topical-relevance estimate.
6. The system links uploaded files to KRA/criterion panels and checks whether required evidence is present.
7. Missing required evidence keeps a panel's score at `0`.
8. The employee sees the computed draft score, uploaded files, missing requirements, and live summaries.
9. The evaluator reviews all submitted records, documents, and scores; approves/disapproves individual criteria or records a fuller verified assessment.
10. The evaluator or admin generates the Faculty Summary roster, Request Form, or Summary Sheet for committee deliberation.
11. The institution's promotion committee makes the final decision outside the platform.

## Evidence Validation Rules

- A required panel needs at least one uploaded evidence file to avoid being flagged `missing-evidence`.
- Beyond that presence check, the *score* for a panel is driven by how much of its evidence-checklist (`evidenceRules.ts`, digitized from the DBM-JC List of Documentary Evidences) the uploaded evidence's detected keywords actually satisfy - not a flat present/absent gate. Partial checklist matches earn partial, fractional credit.
- Score sheets play no part in this draft - they are only issued after JC evaluation, so documentary evidence alone drives the score.
- If no evidence is uploaded for a panel, it is `0`. If evidence is uploaded but nothing about it can be matched to an explicit score or the checklist, a conservative topical-relevance estimate is used (capped at 45% of the panel max) rather than defaulting straight to `0` or to full marks.

## KRA Evidence Areas

### KRA I - Instruction

- Teaching Effectiveness
- Instructional Materials Development
- Research Advising and Mentorship Services

### KRA II - Research, Innovation and/or Creative Work

- Research Outputs Published
- Inventions
- Creative Works

### KRA III - Extension Services

- Service to the Institution
- Service to the Community
- Relevance and Quality of Extension Services
- Bonus criteria (Administrative Designation), where applicable

### KRA IV - Professional Development

- Involvement in Professional Organizations
- Continuing Development
- Awards and Recognition
- Academic Experience for new entrants only
- Industry Experience for new entrants only

## Score Computation Direction

For each panel, in priority order:

1. Read the uploaded evidence text through OCR/PDF parsing (with self-hosted fallback if the primary provider fails).
2. Try to detect an explicit numeric score for the panel from that text, anchored to the panel's full title/KRA heading (not generic words), rejecting bare calendar years and date fragments. If found: `scoreSource: 'ocr-detected'`.
3. Otherwise, compute how much of the panel's evidence checklist (`evidenceRules.ts`) the detected keywords satisfy, as a fraction of the panel max. If any evidence exists: `scoreSource: 'evidence-checklist'`.
4. If the checklist match is exactly zero but evidence exists and looks topically relevant, use a conservative relevance estimate capped at 45% of the panel max: `scoreSource: 'evidence-relevance-estimate'`.
5. If no evidence was uploaded at all: `0`, `status: 'missing-evidence'`.
6. Sum panel scores into KRA totals (each KRA capped at 100 points, per Table 2.1).
7. Compute the weighted overall score from KRA totals using the rank-weight table (Table 2.2, verified above).
8. Resolve sub-rank increments from the score bracket (Table 3.1), gate rank-group transitions on doctoral qualification / EAC accreditation / CUP certification as applicable, and show the result as an advisory projected rank - never a final decision.

## Architecture

- Backend: Express + TypeScript, split into `src/app.ts` (app/middleware/routes) and `src/server.ts` (bootstrap/listen)
- Database: PostgreSQL through Prisma (hosted on Supabase)
- Document Storage: Supabase Storage (`documents` bucket)
- Active frontend: static HTML/CSS/JavaScript in `public/`
- Frontend migration workspace: Vue 3 + Vite in `frontend/` (early-stage scaffold, not deployed)
- Authentication: JWT via `fps_session` httpOnly cookie, role embedded in the token (`EMPLOYEE` / `EVALUATOR` / `ADMIN`)
- Security: Content-Security-Policy and standard security headers set in `src/app.ts`; rate limiting (`express-rate-limit`) on auth endpoints
- Document processing: `pdf-parse`, OCR.space, and a self-hosted `tesseract.js`/`pdf-to-img` fallback

## Important Source Areas

```text
src/app.ts                             Express app, middleware, CSP headers, route mounting
src/server.ts                          Bootstrap: listen(), shutdown handlers
src/routes/                            API routes
src/controllers/auth.controller.ts     Register, login, logout, me, change-password
src/controllers/accounts.controller.ts Admin account management, password reset
src/controllers/document.controller.ts Upload, preview, and delete behavior
src/controllers/dashboard.controller.ts Employee and evaluator dashboard payloads
src/controllers/review.controller.ts   Evaluator status updates and per-criterion review
src/controllers/admin.controller.ts    Database overview
src/utils/document.utils.ts            PDF/OCR processing and file linkage
src/utils/evidenceValidation.ts        Evidence completeness and checklist-fraction rules
src/utils/dashboard.utils.ts           Score computation, rank resolution, workbookMirror payload
src/utils/crypto.ts                    Password hashing and temporary-password generation
src/uploadPanels.ts                    KRA/criterion upload panel catalog
src/uploadWorkflow.ts                  Evidence upload workflow metadata
src/middlewares/rateLimit.middleware.ts Auth endpoint rate limiting
public/employee.html / evaluator.html / admin.html   Active portals
public/workflow.js                     Current active portal behavior
public/auth.js                         Login/register/forced-password-change flow
prisma/schema.prisma                   Database schema
test/auth.integration.test.ts          HTTP-level auth integration tests (real app + DB)
```

## Main API Areas

```text
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
POST   /api/auth/change-password

GET    /api/accounts                          (admin)
PATCH  /api/accounts/:userId/deactivate       (admin)
PATCH  /api/accounts/:userId/reactivate       (admin)
POST   /api/accounts/:userId/reset-password   (admin)
DELETE /api/accounts/:userId                  (admin)

GET    /api/admin/database-overview           (admin)

GET    /api/config/upload-panels
GET    /api/config/upload-workflow
GET    /api/config/faculty-options
GET    /api/config/storage
GET    /api/reference/tqe-summary
GET    /api/reference/guidelines

POST   /api/faculty/ingest
PATCH  /api/faculty/:profileId
POST   /api/faculty/analysis/feature-selection    (stub, always 503 - see note below)
POST   /api/faculty/models/compare                (stub, always 503 - see note below)
POST   /api/faculty/predictions/generate          (stub, always 503 - see note below)

POST   /api/documents/extract
POST   /api/documents/signed-upload-url
POST   /api/documents/register
GET    /api/documents/:documentId/view
POST   /api/documents/:documentId/replace
DELETE /api/documents/:documentId

GET    /api/employee/dashboard
GET    /api/evaluator/review-queue
GET    /api/dashboard/:profileId

PATCH  /api/review/:profileId/status                    (evaluator/admin)
GET    /api/review/:profileId/criteria                  (evaluator/admin)
PATCH  /api/review/:profileId/criteria/:panelKey         (evaluator/admin)

POST   /api/training/examples             (evaluator/admin)
PATCH  /api/training/examples/:id/label   (evaluator/admin)
GET    /api/training/examples             (evaluator/admin)
POST   /api/training/profiles/:profileId/approve (evaluator/admin)

GET    /api/health
```

The three `/api/faculty/analysis|models|predictions` routes are intentionally permanent stubs (always return `503`) - live prediction was descoped in favor of the offline `bfar-ml` track described under "Machine Learning Workflow" below; `GET /api/health`'s `model.status` reports the same `"inactive"` state.

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
SUPABASE_ANON_KEY="your-anon-public-key"
```

> **Note:** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are required for server-side document storage and OCR analysis. `SUPABASE_ANON_KEY` enables direct-to-Supabase browser uploads via signed URLs, completely bypassing Vercel's 4.5 MB serverless body size limit.
>
> `OCR_PROVIDER` selects the *primary* provider (`windows`, `http`, `ocrspace`, `tesseract`, or `disabled`); regardless of this setting, the self-hosted `tesseract.js`/`pdf-to-img` fallback automatically activates whenever the configured primary provider fails or exceeds its size/timeout limits (except when the primary provider is already `windows`, which can't process PDFs at all and always defers).

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
- `http://localhost:3000/admin`

## Common Commands

- `npm run dev` - start the backend in watch mode
- `npm run build` - compile TypeScript to `dist/`
- `npm test` - run pure unit/scoring tests (no database required)
- `npm run test:integration` - run HTTP-level auth integration tests against the real app and database (needs `.env` with `DATABASE_URL`/`AUTH_SECRET`)
- `npm run test:all` - run both of the above
- `npm run start` - run the compiled backend
- `npm run db:migrate` - apply development migrations
- `npm run db:deploy` - apply deploy-safe migrations
- `npm run db:push` - push Prisma schema changes directly
- `npm run db:studio` - open Prisma Studio

## Machine Learning Workflow

The offline machine learning components (dataset preparation, boosting-model comparison, and explainability reporting) have been migrated to a separate repository named `bfar-ml`.

The Faculty Promotion System's role in the machine learning pipeline is strictly to prepare, structure, and validate the promotion data. The `bfar-ml` repository consumes this data for offline experimentation. No model training code (`.py`/`.ipynb`) for that offline track exists in this repository - only its data exports (`data/exports/`).

> **Note for anyone using `data/exports/objective-305-training-dataset.csv` as ground truth for promotion outcomes:** its `labelPromoted` field is derived from `Teaching_Quality === 'Excellent'` in the source `TQE.csv` (a teaching-quality evaluation dataset), not from a recorded promotion decision, and several features are explicitly proxy-derived (see `objective-305-training-dataset.metadata.json`). Treat this as a proxy-labeled dataset, not real historical promotion outcomes, unless a genuine promotion-outcome dataset has since replaced it.

## Thesis Framing

A safe project framing is:

> The Faculty Promotion System is a hybrid decision-support platform that digitizes faculty promotion submissions, extracts scores from uploaded documentary evidence, validates that evidence against KRA requirements, computes advisory promotion summaries, and gives evaluators and administrators a centralized review dashboard for reducing manual paper-based evaluation work.

Do not claim that the system makes final promotion decisions. Final evaluation remains with the institution's promotion committee.

## Consolidated Release Notes

- **Organized Storage Folder Structure by KRA**: Updated file persistence to automatically route evidence documents into dedicated KRA folders (`kra1/<panel_key>/<uuid>.<ext>`, `kra2/`, `kra3/`, `kra4/`, or `general/`) in Supabase Storage.
- **50 MB Direct-to-Supabase Storage & Size Validation**: Implemented direct browser-to-Supabase upload flow via signed PUT URLs (`/api/documents/signed-upload-url` and `/api/documents/register`), enabling files up to 50 MB to bypass Vercel's 4.5 MB serverless payload limit with real-time per-file progress tracking and client-side validation.
- **Fixed KRA Upload Routing (Bugs #5, #6, #7)**: Replaced per-form submit event listeners with single event delegation listener on `#employee-upload-workflow`. Solved issue where uploading to one KRA after skipping another misrouted uploads to the skipped KRA due to stale DOM nodes.
- **Enabled Multi-Panel & Batch File Uploads**: Added multi-file selection support per upload panel and backgrounded post-upload workspace refreshing (`loadEmployeeWorkspace`), allowing users to upload multiple files across KRA cards simultaneously without UI blocking.
- **Added Document Type Dropdown (Bug #2)**: Added optional 12-category Document Type select menu on upload cards (Certificate, Published Article, Award, Training Proof, Evaluation Form, etc.), stored in `extractionMetadata`.
- **Production Vercel Deployment**: Configured `SUPABASE_ANON_KEY` in Vercel environment variables and verified production health on `https://faculty-promotion-system-main.vercel.app`.

### 2026-08-12

- Added a Content-Security-Policy header, verified live against the document-preview iframe's `blob:` URL usage (the path most likely to break under a naive CSP) and a full walkthrough of all three portals.
- Split `src/server.ts` into `src/app.ts` (the Express app, importable without starting a real server) + a thin bootstrap, so the app can be tested directly.
- Added the project's first HTTP-level integration test suite (`test/auth.integration.test.ts`, 8 tests) covering register/login/logout/change-password, the admin/non-admin permission boundary, and the full admin-reset-password forced-change flow against the real app and database, plus 18 new pure unit tests for password hashing and the auth validation schemas. 60 tests total, up from 34.

### 2026-08-11

- Added admin-assisted password reset: an admin can generate a one-time temporary password for a locked-out account, forcing a mandatory password change on next sign-in. New `mustChangePassword` field on `User`, new `PASSWORD_RESET`/`PASSWORD_CHANGED` audit actions.
- Verified the rank-based KRA weight table (Table 2.2 of the DBM-JC circular) against the actual source PDF for the first time - confirmed the live `rankGroups` weights are exactly correct. Root-caused why this had never been verified before: `pdf-parse` silently fails on the circular's first 8 pages (where the table actually lives, before Annex I) due to a font-decoding issue.
- Found and fixed two independent false-positive classes in OCR score extraction: a generic-word fallback pattern that could match unrelated numbers (control numbers, IDs) anywhere in a document, and a date-adjacency issue that could grab a day-of-month as a score. Backfilled `extractionMetadata` for all 460 real production documents with the fix - 122 changed (118 fabricated scores removed).

### 2026-07-20 / 2026-07-21

- Discovered and fixed the OCR.space free-tier's 1.5MB file-size cap silently zeroing out evidence scores for large scans - added a self-hosted `tesseract.js` + `pdf-to-img` OCR fallback that activates automatically whenever the primary provider fails or exceeds its limits.
- Fixed a score-misread bug where `extractScore()` could pick up a bare calendar year or oversized number as a detected score.
- Fixed the dashboard's "Projected rank" field, which had been using a different, ungated formula than the authoritative `scoreComputation.kraTotals` - now both use the same source of truth.

### 2026-07-15

- Reworked scoring to be evidence-only: score sheets removed from the product as a concept (faculty never has one to upload pre-JC). Draft score now comes entirely from OCR-detected values and evidence-checklist matching against uploaded evidence, with a conservative topical-relevance estimate as a last-resort fallback before `0` - never a flat "present = full marks" award.
- Added a per-panel evidence checklist (`evidenceRules.ts`, `AND`/`OR` rules) digitized from the DBM-JC List of Documentary Evidences.
- Added a College Department dropdown to the faculty profile form.

### 2026-07-14

- Reworked profile creation to auto-create a `FacultyProfile` on an employee's first document upload, fixing a broken core flow where registered faculty accounts had zero profiles despite being registered.
- Added a real ADMIN role (provisioned via `scripts/promote-to-admin.ts`, no self-registration path) with its own portal, account management, and database overview.
- Removed the dead legacy frontend (`public/app.js`) and the dead ML feature-vector/prediction pipeline it depended on.
- Fixed 3 DBM-JC/evidence-list alignment gaps found during a review against the source PDF (missing KRA III bonus panel, missing OR-logic in evidence rules for several panels).

### 2026-07-01

- Enforced strict documentary evidence validation logic based on the `AND`/`OR` rules defined in `evidenceRules.ts`.
- Integrated OCR-driven keyword extraction (`keywordHits`) into the document metadata processing pipeline.

### 2026-06-30

- Consolidated repository documentation into this single `README.md`.
- Verified the live Render deployment, production health response, OCR readiness, and loaded TQE data.
- Added evidence-based zero-if-missing score computation for required KRA/criterion panels.
- Added a live employee score summary, employee upload replacement/delete, and evaluator-side evidence score signals.
- Migrated document storage from local filesystem to Supabase Storage for production compatibility with ephemeral hosts like Render.

### Earlier

- 2026-06-19: strict evidence validation guidance, `AND`/`OR` behavior documented.
- 2026-06-17: workbook-mirror dashboard data, KRA II wording aligned with "Research, Innovation and Creative Work".
- 2026-06-03 / 2026-05-27: dashboard layout and printable summary-sheet improvements.
- 2026-05-22 / 2026-05-21: baseline profile data, session consistency, backend utility tests.

## Immediate Implementation Plan

1. Continue tightening OCR score-extraction accuracy (see "What Still Needs To Be Achieved").
2. Extend automated test coverage to controllers/routes beyond auth (documents, dashboard, review, training, accounts).
3. Continue visual polish on the score summary after testing with real evidence packets.
