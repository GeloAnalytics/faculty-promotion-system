# Faculty Promotion System

Faculty Promotion System is a full-stack TypeScript application for collecting faculty promotion records, uploading documentary evidence, extracting text from PDFs and images, and supporting evaluator-led promotion review aligned with NBC 461-style workflows.

## Current Status

- The production-facing app is currently served from the `public/` vanilla JavaScript portal.
- The `frontend/` Vue 3 app exists as an in-progress migration and is not yet the main runtime UI.
- OCR and PDF parsing support evidence extraction, but evaluator scoring remains the primary basis for draft rank outputs.
- The system now includes a server-side promotion draft snapshot that exposes current rank, evaluator-backed score, weighted score, projected rank, and pending requirements when applicable.

## Architecture

- **Backend:** Express + TypeScript + Prisma + PostgreSQL
- **Frontend in use:** Static HTML/CSS/JavaScript from `public/`
- **Frontend migration target:** Vue 3 + Vite in `frontend/`
- **Authentication:** JWT-backed session handling via `Authorization` header or `fps_session` cookie
- **Document processing:** `pdf-parse` for PDFs and OCR for uploaded images
- **Machine learning workspace:** Python training scripts for offline experimentation and dataset export

## Core Features

- Employee account registration and login
- Role-based employee and evaluator workspaces
- Faculty profile capture with academic rank and performance fields
- Criterion-based evidence uploads grouped by KRA
- PDF text extraction and image OCR
- Upload-to-profile linkage using explicit profile selection or filename matching fallback
- Evaluator scoring workflow and review queue
- Employee-side approximate evidence coverage summary
- Server-side promotion draft snapshot based on evaluator-backed scoring
- Admin and training-data support endpoints

## Promotion Draft Snapshot

The dashboard layer computes a `promotionDraft` summary on the server. Depending on available data, it can include:

- current academic rank
- official draft rank
- projected rank from weighted score
- latest evaluator total score
- weighted score and sub-rank increments
- applied weight profile
- pending requirements such as missing exact rank input or eligibility constraints

If evaluator scoring is not yet complete, the draft remains pending instead of showing a misleading rank recommendation.

## Request Flow

1. Users register or log in.
2. Employees create or update a faculty profile.
3. Employees upload PDF or image evidence to criterion-specific KRA panels.
4. The backend parses PDFs or runs OCR on images and stores extracted text plus metadata.
5. Evaluators review employee submissions and assign criterion scores.
6. Dashboard utilities compute evidence coverage summaries and evaluator-backed draft rank outputs.

## Project Structure

```text
.
|-- src/                 # Express app, routes, controllers, Prisma-backed logic
|-- public/              # Active employee/evaluator portal UI
|-- frontend/            # Vue migration work-in-progress
|-- prisma/              # Prisma schema and migrations
|-- scripts/             # Dataset export and utility scripts
|-- ml/                  # Python ML training code and artifacts
|-- uploads/             # Local upload/output workspace if used in development
|-- dist/                # Compiled backend output
```

## API Areas

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/documents/extract`
- `DELETE /api/documents/:documentId`
- `GET /api/employee/dashboard`
- `GET /api/evaluator/review-queue`
- `GET /api/dashboard/:profileId`
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

## Development

### Backend

- `npm install`
- `npm run db:generate`
- `npm run db:migrate`
- `npm run dev`

The backend serves the active portals at:

- `http://localhost:3000/employee`
- `http://localhost:3000/evaluator`

### Frontend Migration App

- `cd frontend`
- `npm install`
- `npm run dev`

Use this only for migration or exploratory UI work unless the team explicitly switches runtime ownership to Vue.

## Build and Runtime Commands

- `npm run dev` - start the backend in watch mode
- `npm run build` - compile TypeScript to `dist/`
- `npm run start` - run the compiled backend
- `npm run db:migrate` - apply development migrations
- `npm run db:deploy` - apply deploy-safe migrations
- `npm run db:push` - push Prisma schema changes directly
- `npm run db:studio` - open Prisma Studio

## Machine Learning Commands

- `npm run ml:build-fallback-dataset` - build a fallback/mock dataset
- `npm run ml:export-dataset` - export validated data for ML training
- `npm run ml:train-boosting` - train boosting models from the `ml/` workspace

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
- Audit-ready explanations and fuller committee approval workflows are still future work.
- Automated tests are limited and should be expanded around rank normalization and promotion-draft rules.
