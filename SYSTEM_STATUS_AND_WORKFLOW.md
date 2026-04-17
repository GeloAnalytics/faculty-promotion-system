# Faculty Promotion System

## Current Status

This system is now primarily a **training-data collection and storage platform**.

The machine learning model is still present in the codebase as a future feature, but it is intentionally **inactive** at runtime.

Current runtime status:

- User authentication is active.
- Role-based page routing is active.
- Dedicated login page is active.
- Employee workspace page is active.
- Evaluator workspace page is active.
- Faculty record intake is active.
- Training-example draft creation is active.
- File upload and storage is active.
- PostgreSQL-backed persistence is active in local development.
- PDF text extraction is active.
- Image OCR is active.
- PDF/image analysis is active.
- Guideline PDF parsing is active.
- TQE.csv reference loading is active.
- Database viewer UI is active.
- Model prediction is inactive.
- Model comparison is inactive.
- Feature-selection endpoint is inactive.
- Excel/CSV parsing is partially implemented.

## Short Answer To Your Question

### Can it collect and store data?

Yes.

It can currently:

- create user accounts
- log users in and out
- route users to the correct workspace based on role
- create faculty profile records
- create training-example draft records
- save uploaded documents with metadata
- save extracted PDF text
- save OCR text from image uploads
- save manual labels for promotion outcome
- organize uploads by the five required upload panels
- show employee-specific draft points and upload history
- show evaluator-side per-employee review logs
- display database counts and recent records in the UI after sign-in

### Can it properly read and organize contents from file uploads?

Partially, but much better than before.

What it does properly right now:

- It accepts PDF uploads and extracts text from them.
- It accepts image uploads and extracts OCR text from them.
- It stores PDF extraction metadata and extracted text.
- It stores image OCR text and analysis metadata.
- It organizes uploaded files by panel/category.
- It restricts the `Tallied Points` panel to spreadsheet-like files (`csv`, `xls`, `xlsx`).
- It reads CSV files as text and stores them for training-data preparation.
- It generates structured document-analysis summaries for PDF, image, and CSV uploads.

What it does **not** do yet:

- It does not parse Excel files.
- It does not normalize CSV tallied points into structured database rows.
- It does not classify or normalize document contents into exact NBC 461 fields.
- It does not yet turn uploaded evidence into a complete rule-based scoring engine.

So the system already supports **collection and storage well**, and it now **reads PDF and image content**, but **content normalization is still partial**.

## Where This Is Implemented

### Authentication and production-oriented server setup

Implemented in [src/server.ts](/c:/Users/PC/faculty-promotion-system/src/server.ts:43).

This includes:

- environment validation
- production/security headers
- cookie-based sessions
- protected routes
- trusted proxy handling
- graceful shutdown

### Upload panel configuration

Implemented in [src/server.ts](/c:/Users/PC/faculty-promotion-system/src/server.ts:67).

The five configured panels are:

1. `kra_instruction`
2. `kra_research`
3. `kra_extension`
4. `kra_professional_development`
5. `tallied_points`

### Model inactive status

Declared in [src/server.ts](/c:/Users/PC/faculty-promotion-system/src/server.ts:230) and enforced in:

- [src/server.ts](/c:/Users/PC/faculty-promotion-system/src/server.ts:480)
- [src/server.ts](/c:/Users/PC/faculty-promotion-system/src/server.ts:487)
- [src/server.ts](/c:/Users/PC/faculty-promotion-system/src/server.ts:494)

### File upload handling

Implemented in [src/server.ts](/c:/Users/PC/faculty-promotion-system/src/server.ts:345).

### OCR processing

Implemented in [scripts/ocr-image.ps1](/c:/Users/PC/faculty-promotion-system/scripts/ocr-image.ps1:1) and invoked from [src/server.ts](/c:/Users/PC/faculty-promotion-system/src/server.ts:418).

### Shared document analysis

Implemented in [src/utils.ts](/c:/Users/PC/faculty-promotion-system/src/utils.ts:83).

### Faculty record intake

Implemented in [src/server.ts](/c:/Users/PC/faculty-promotion-system/src/server.ts:432).

### Training-example creation and labeling

Implemented in:

- [src/server.ts](/c:/Users/PC/faculty-promotion-system/src/server.ts:501)
- [src/server.ts](/c:/Users/PC/faculty-promotion-system/src/server.ts:525)
- [src/server.ts](/c:/Users/PC/faculty-promotion-system/src/server.ts:554)

### PDF/image extraction and reference loading

Implemented in:

- [src/utils.ts](/c:/Users/PC/faculty-promotion-system/src/utils.ts:51)
- [src/utils.ts](/c:/Users/PC/faculty-promotion-system/src/utils.ts:83)
- [src/utils.ts](/c:/Users/PC/faculty-promotion-system/src/utils.ts:226)
- [src/utils.ts](/c:/Users/PC/faculty-promotion-system/src/utils.ts:314)

### Database schema for stored records

Implemented in [prisma/schema.prisma](/c:/Users/PC/faculty-promotion-system/prisma/schema.prisma:28).

### Frontend workflow and page split

Implemented in:

- [public/index.html](/c:/Users/PC/faculty-promotion-system/public/index.html:16)
- [public/employee.html](/c:/Users/PC/faculty-promotion-system/public/employee.html:16)
- [public/evaluator.html](/c:/Users/PC/faculty-promotion-system/public/evaluator.html:16)
- [public/app.js](/c:/Users/PC/faculty-promotion-system/public/app.js:1)

### Database viewer

Implemented in:

- [src/server.ts](/c:/Users/PC/faculty-promotion-system/src/server.ts:658)
- [public/index.html](/c:/Users/PC/faculty-promotion-system/public/index.html:204)
- [public/app.js](/c:/Users/PC/faculty-promotion-system/public/app.js:125)
- [public/styles.css](/c:/Users/PC/faculty-promotion-system/public/styles.css:184)

## Detailed System Workflow

### 1. User account creation and login

The user first registers or logs in.

Backend routes:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

How it works:

- A new account is created with email, full name, password hash, and salt.
- A new account also stores the selected role (`EMPLOYEE` or `EVALUATOR`).
- Password hashing uses PBKDF2 in [src/server.ts](/c:/Users/PC/faculty-promotion-system/src/server.ts:642).
- On login, the server creates a signed cookie session.
- Protected routes require that session cookie.
- After login, the frontend redirects users to `/employee` or `/evaluator` based on role.

Stored data:

- `users` table in [prisma/schema.prisma](/c:/Users/PC/faculty-promotion-system/prisma/schema.prisma:28)

### 2. Workspace routing and page separation

The system now uses three separate pages:

1. `/` for sign in and account creation
2. `/employee` for employee submissions
3. `/evaluator` for evaluator review and scoring

How it works:

- the landing page only handles authentication
- employee users are redirected into the employee workspace
- evaluator users are redirected into the evaluator workspace
- direct access is role-checked both in the frontend flow and in protected backend routes

This keeps the employee and evaluator experience separate instead of mixing both workflows into one page.

### 3. Faculty base record creation

The user fills in the faculty record form and submits it.

Backend route:

- `POST /api/faculty/ingest`

What happens:

- The payload is validated using Zod.
- The system builds a feature snapshot from the entered data.
- A `FacultyProfile` record is stored.
- A `TrainingExample` draft is automatically created.
- The record is associated with the signed-in user.

Stored data:

- `faculty_profiles`
- `training_examples`

Important point:

- This is already useful for future model training because the raw input and feature snapshot are both stored.

### 4. Five upload panels

After the faculty record exists, the user uploads evidence files into one of five panels.

Frontend behavior:

- The frontend loads the panel definitions from `GET /api/config/upload-panels`.
- It renders one upload form per panel dynamically.

The five panels are:

1. Key Result Area 1: Instruction
2. Key Result Area 2: Research, Invention, and Creative Work
3. Key Result Area 3: Extension Services
4. Key Result Area 4: Professional Development
5. Excel or CSV files for Tallied Points

Backend route:

- `POST /api/documents/extract`

How uploads are organized:

- Every upload includes a `panelKey`.
- The server stores the upload as an `UploadedDocument`.
- The `extractionMetadata` JSON stores:
  - the panel key
  - whether it is being stored for training
  - extraction or OCR details when available
  - analysis summaries when available

This means the uploads are already organized at the database level by category.

### 5. PDF upload behavior

For PDF files:

- the backend uses `pdf-parse`
- extracted text is stored
- analysis metadata is stored
- a preview and structured analysis summary are returned to the UI

Current extraction behavior:

- It looks for broad score-like terms such as:
  - teaching effectiveness
  - research outputs
  - extension services
  - IPCR average
  - professional development hours
- It also tags category and keyword matches based on the selected upload panel.

What this means in practice:

- The system can read PDF text
- The system can store extracted text
- The system can capture a structured analysis summary
- The system cannot yet fully map documents to exact NBC 461 scoring fields

### 6. Image upload behavior

For image files:

- the backend runs OCR through the local Windows OCR helper
- extracted text is stored
- structured document analysis is generated
- the upload is linked to a KRA or tallied-points panel

This means:

- the workflow is operational for image uploads
- OCR text can now be collected for future training
- quality still depends on image clarity and Windows OCR performance

Current limitation:

- OCR output is still heuristic and not yet converted into exact NBC 461 rule-scored fields

### 7. Tallied points upload behavior

For `csv`, `xls`, and `xlsx` files:

- the backend accepts them only for the `tallied_points` panel
- the file metadata is stored
- the file is marked as stored for training-data preparation
- CSV files are read as text and analyzed at a basic level

Current limitation:

- `.xls` and `.xlsx` contents are **not parsed yet**
- CSV contents are **not yet normalized into structured database rows**

So this panel is good for **collection and storage**, but not yet for automated ingestion of tallied scores into normalized records.

### 8. Guideline reference behavior

The system also parses the guideline PDF:

- [DBM-JC-No-3-s-2022-9th-cycle-NBC-461-with-Annexes.pdf](/c:/Users/PC/faculty-promotion-system/DBM-JC-No-3-s-2022-9th-cycle-NBC-461-with-Annexes.pdf)

Backend route:

- `GET /api/reference/guidelines`

What it currently does:

- loads the PDF from the repo root
- parses its text
- detects whether broad promotion-related criteria terms are present
- returns a preview of the extracted text

This is helpful as a reference layer, but it is not yet a full rule engine for NBC 461 scoring.

### 9. TQE.csv reference behavior

The system loads `TQE.csv` at startup.

What it does with it:

- parses rows
- summarizes numeric fields
- calculates simple benchmark closeness against faculty features

What it does **not** do:

- it does not treat `TQE.csv` as final promotion-label training data
- it does not train a model from it

This makes `TQE.csv` a reference dataset, not a training pipeline yet.

### 10. Employee dashboard behavior

After an employee signs in, the employee workspace loads a role-specific dashboard.

Backend route:

- `GET /api/employee/dashboard`

What it currently shows:

- saved faculty profiles for the signed-in employee
- recent upload logs for the signed-in employee
- a draft point summary based on entered values and extracted upload metadata
- upload coverage across the expected panels

Important note:

- the draft points are only an estimate for employee visibility
- the evaluator still performs the actual scoring decision

### 11. Training example labeling

Once a faculty record exists, the user can label it.

Backend routes:

- `POST /api/training/examples`
- `PATCH /api/training/examples/:id/label`
- `GET /api/training/examples`

How it works:

- a draft training example is created automatically during faculty intake
- later, the user can assign:
  - promotion outcome
  - label source
  - dataset split
  - notes
- status transitions from `DRAFT` to `LABELED` or `VALIDATED`

This is the strongest part of the current system for future machine learning readiness.

### 12. Evaluator review queue behavior

After an evaluator signs in, the evaluator workspace loads a review queue grouped by employee profile.

Backend route:

- `GET /api/evaluator/review-queue`

What it currently shows:

- employee identity and submitter account details
- upload logs linked to each employee profile
- draft score totals derived from collected data
- the latest training example ready for evaluator scoring

This gives evaluators a cleaner review flow before they save the actual score or label.

### 13. Database viewer behavior

After signing in, the UI now exposes a simple database viewer.

Backend route:

- `GET /api/admin/database-overview`

What it currently shows:

- total users
- total faculty profiles
- total uploaded documents
- total training examples
- total predictions
- recent users
- recent faculty profiles
- recent uploaded documents
- recent training examples

How it works:

- the route is protected by authentication
- the frontend loads it after sign-in and after key write actions
- the UI renders table views instead of raw JSON dumps

This makes it easier to verify that uploads, faculty records, and labels are actually being written to PostgreSQL.

## Database Storage Design

The current schema supports collection and traceability well.

### `users`

Stores:

- identity
- credentials
- role
- active status

### `faculty_profiles`

Stores:

- faculty identity fields
- semester/review period
- JSON features block
- creator linkage

### `uploaded_documents`

Stores:

- owner user
- optional linked faculty profile
- original filename
- MIME type
- optional extracted text
- extraction metadata JSON

### `training_examples`

Stores:

- raw faculty input
- feature snapshot
- optional model snapshot
- promotion label
- label source
- dataset split
- notes
- status

This is already appropriate for a future supervised-learning dataset pipeline.

## Which Thesis Objectives Are Achieved

Below is the most accurate status based on the current code.

### Objective 1

> To collect and preprocess faculty data, including demographic information, performance commitment review scores, and promotion history, incorporating scanned and digitized relevant documents such as PDS and performance reviews.

Status: **Partially achieved**

Achieved:

- faculty personal data can be collected
- review/performance data can be collected
- promotion-history fields exist in the intake payload
- PDF documents can be uploaded and text can be extracted
- image documents can be OCR'd and analyzed
- uploads are categorized into KRA panels and stored
- training records are created and stored

Not yet achieved:

- spreadsheet tallied-point parsing is not implemented
- document-to-field mapping is still basic
- automated preprocessing is only partial

### Objective 2

> To identify and select the most significant features from personal data and performance reviews that are highly correlated with successful promotion outcomes.

Status: **Not achieved in the active system**

Notes:

- The codebase still contains utility functions for feature selection in [src/utils.ts](/c:/Users/PC/faculty-promotion-system/src/utils.ts:121).
- The runtime endpoint is intentionally disabled in [src/server.ts](/c:/Users/PC/faculty-promotion-system/src/server.ts:480).
- No active correlation analysis is currently being performed on real collected data.

### Objective 3

> To implement and compare various boosting machine learning algorithms (e.g., decision trees, random forests, AdaBoost, Gradient Boosting) for predicting faculty promotions.

Status: **Not achieved in the active system**

Notes:

- Placeholder comparison logic still exists in [src/utils.ts](/c:/Users/PC/faculty-promotion-system/src/utils.ts:147).
- The live compare-models endpoint is disabled in [src/server.ts](/c:/Users/PC/faculty-promotion-system/src/server.ts:487).
- No real training pipeline exists yet.

### Objective 4

> To evaluate and select the best-performing predictive model based on validation metrics such as accuracy, precision, recall, and F1-score.

Status: **Not achieved in the active system**

Notes:

- Placeholder metric profiles exist in code, but they are not real validation results.
- No actual dataset splitting, training, or evaluation job exists yet.
- The active runtime explicitly disables model evaluation behavior.

### Objective 5

> To generate insights from the model regarding influential factors and provide recommendations to improve faculty promotion policies and decision-making processes in state universities.

Status: **Not achieved in the active system**

Notes:

- Recommendation-generation utilities still exist in code.
- They are not active in the current runtime workflow.
- No live model insight generation is being exposed to users.

## Practical Assessment

### What the system is already good at

- authenticated data collection
- structured faculty-record storage
- evidence-file categorization
- PDF extraction and storage
- image OCR and OCR-text storage
- shared upload analysis summaries
- future training-set assembly
- auditability through user-linked records
- production-minded backend structure

### What the system is not yet good at

- parsing Excel/CSV tallied points into structured values
- mapping uploads precisely to NBC 461 annex scoring rules
- producing live promotion predictions
- training and evaluating machine learning models

## Current Risks and Weaknesses

### 1. Structured scoring gap

Uploads can now be read, but they are not yet converted into exact NBC 461 scoring structures.

Impact:

- extracted content is still only partially normalized for training and policy analysis

### 2. Spreadsheet parsing gap

Tallied-point uploads are stored but not read into structured records.

Impact:

- important scoring data may exist in files without being usable in analytics yet

### 3. Database deployment gap

The schema and migration files are present, but a real database deployment has not yet been executed in this environment.

Still required:

- provision a PostgreSQL database
- set `DATABASE_URL` in production
- run `prisma migrate deploy`
- verify the new tables exist
- verify account creation, uploads, and training-example writes against the live database

Impact:

- the app structure is ready, but persistence has not been validated end-to-end on a real deployed database

### 4. No explicit file storage layer

The database stores metadata and extracted text, but not a managed production file-storage strategy such as:

- object storage
- disk persistence strategy
- file retention policy

Impact:

- deployment architecture still needs a real file-storage design

### 5. Draft scoring is still heuristic

The employee page now shows draft points, but those values are still only a temporary estimate.

Current limitation:

- values come from entered fields and extracted upload metadata
- they are not yet the final NBC 461 rule-based score
- evaluator review is still required for the official result

Impact:

- useful for employee-side progress tracking
- not yet a complete scoring engine

### 6. Database viewer is operational but basic

The database viewer is useful for validation, but it is still a lightweight operational view.

Current limitation:

- no search
- no filters
- no pagination
- no per-record drill-down
- no export tools

Impact:

- useful for debugging and demos
- not yet a full admin data-management interface

### 7. Session model is simple

The current cookie session is signed and useful, but it is still a lightweight custom approach.

Impact:

- acceptable for controlled deployment
- may need rotation, revocation, and stronger auth/session controls later

## Recommended Next Build Steps

### Priority 1

Implement structured parsing for tallied points and uploaded evidence.

Why:

- OCR now exists, but extracted text still needs to be normalized into training-ready fields

### Priority 2

Deploy and validate the database.

Why:

- local PostgreSQL validation is done, but deployment persistence still needs to be verified in the real hosted environment

### Priority 3

Implement spreadsheet parsing for the `Tallied Points` panel.

Why:

- it turns stored training support files into usable structured features

### Priority 4

Map parsed evidence to NBC 461 categories and annex criteria.

Why:

- it converts general document storage into a policy-aligned scoring dataset

### Priority 5

Create a training dataset export pipeline.

Why:

- the collected records then become immediately usable for offline model development

### Priority 6

Only after enough labeled data exists, reactivate:

- feature selection
- model training
- model comparison
- model evaluation
- recommendation generation

## PR Follow-Up Checklist

The following work is still needed after this PR:

- provision and connect the hosted PostgreSQL database
- run `prisma migrate deploy` in the target environment
- validate user registration/login against the hosted database
- validate faculty intake, uploads, and training labels against the hosted database
- implement `.xls/.xlsx` parsing for the `Tallied Points` panel
- normalize CSV tallied-point data into structured database records
- map parsed uploads to exact NBC 461 annex categories and scoring rules
- define a production file-storage strategy for uploaded source files
- decide whether to keep custom cookie sessions or replace them with a fuller auth/session solution
- reactivate model endpoints only after enough labeled data exists

## Local Validation Completed

The following has already been validated in local development using a working PostgreSQL instance:

- Prisma migration applied successfully
- tables created successfully
- user registration persisted
- faculty record intake persisted
- OCR/image upload persisted
- training-label update persisted
- training example retrieval worked
- database overview route returned real stored records

This means local development persistence is already operational. The remaining database work is mainly about hosted deployment readiness, not basic functionality.

## Final Conclusion

At this stage:

- the system **can collect and store data well**
- the system **can read PDF and image uploads and partially organize their contents**
- the system is **strong for training-data preparation**
- the system is **not yet a functional predictive analytics engine**

So if the question is:

> Is the current system already useful?

Yes, as a **collection-first faculty promotion data platform**.

If the question is:

> Has it already achieved the full thesis system?

No.

It has mostly advanced **Objective 1 partially**, while **Objectives 2 to 5 remain inactive or incomplete**.
