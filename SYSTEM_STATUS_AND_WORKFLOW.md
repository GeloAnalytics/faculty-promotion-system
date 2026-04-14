# Faculty Promotion System

## Current Status

This system is now primarily a **training-data collection and storage platform**.

The machine learning model is still present in the codebase as a future feature, but it is intentionally **inactive** at runtime.

Current runtime status:

- User authentication is active.
- Faculty record intake is active.
- Training-example draft creation is active.
- File upload and storage is active.
- PDF text extraction is active.
- Guideline PDF parsing is active.
- TQE.csv reference loading is active.
- Model prediction is inactive.
- Model comparison is inactive.
- Feature-selection endpoint is inactive.
- Image OCR is not yet implemented.
- Excel/CSV parsing is not yet implemented.

## Short Answer To Your Question

### Can it collect and store data?

Yes.

It can currently:

- create user accounts
- log users in and out
- create faculty profile records
- create training-example draft records
- save uploaded documents with metadata
- save extracted PDF text
- save manual labels for promotion outcome
- organize uploads by the five required upload panels

### Can it properly read and organize contents from file uploads?

Partially.

What it does properly right now:

- It accepts PDF uploads and extracts text from them.
- It stores PDF extraction metadata and extracted text.
- It organizes uploaded files by panel/category.
- It restricts the `Tallied Points` panel to spreadsheet-like files (`csv`, `xls`, `xlsx`).
- It stores spreadsheet uploads for later use in training-data preparation.

What it does **not** do yet:

- It does not OCR image uploads.
- It does not parse Excel files.
- It does not parse CSV tallied points into structured database rows.
- It does not classify or normalize document contents into exact NBC 461 fields.
- It does not yet turn uploaded evidence into a complete rule-based scoring engine.

So the system already supports **collection and storage well**, but **content understanding is only partial** at this stage.

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

### Faculty record intake

Implemented in [src/server.ts](/c:/Users/PC/faculty-promotion-system/src/server.ts:432).

### Training-example creation and labeling

Implemented in:

- [src/server.ts](/c:/Users/PC/faculty-promotion-system/src/server.ts:501)
- [src/server.ts](/c:/Users/PC/faculty-promotion-system/src/server.ts:525)
- [src/server.ts](/c:/Users/PC/faculty-promotion-system/src/server.ts:554)

### PDF extraction and reference loading

Implemented in [src/utils.ts](/c:/Users/PC/faculty-promotion-system/src/utils.ts:51), [src/utils.ts](/c:/Users/PC/faculty-promotion-system/src/utils.ts:226), and [src/utils.ts](/c:/Users/PC/faculty-promotion-system/src/utils.ts:314).

### Database schema for stored records

Implemented in [prisma/schema.prisma](/c:/Users/PC/faculty-promotion-system/prisma/schema.prisma:28).

### Frontend workflow

Implemented in:

- [public/index.html](/c:/Users/PC/faculty-promotion-system/public/index.html:16)
- [public/app.js](/c:/Users/PC/faculty-promotion-system/public/app.js:1)

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
- Password hashing uses PBKDF2 in [src/server.ts](/c:/Users/PC/faculty-promotion-system/src/server.ts:642).
- On login, the server creates a signed cookie session.
- Protected routes require that session cookie.

Stored data:

- `users` table in [prisma/schema.prisma](/c:/Users/PC/faculty-promotion-system/prisma/schema.prisma:28)

### 2. Faculty base record creation

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

### 3. Five upload panels

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
  - extraction details when available

This means the uploads are already organized at the database level by category.

### 4. PDF upload behavior

For PDF files:

- the backend uses `pdf-parse`
- extracted text is stored
- extraction metadata is stored
- a preview and extraction summary are returned to the UI

Current extraction behavior:

- It looks for broad score-like terms such as:
  - teaching effectiveness
  - research outputs
  - extension services
  - IPCR average
  - professional development hours

This is implemented in [src/utils.ts](/c:/Users/PC/faculty-promotion-system/src/utils.ts:51).

What this means in practice:

- The system can read PDF text
- The system can store extracted text
- The system can capture a basic extraction summary
- The system cannot yet fully map documents to exact NBC 461 scoring fields

### 5. Image upload behavior

For image files:

- the route recognizes them as valid upload intent
- the route returns `501 Not Implemented`

This means:

- the workflow is designed for image uploads
- OCR is still missing
- no image text is extracted yet

So image uploads are conceptually supported by the UI and workflow, but not operationally processed.

### 6. Tallied points upload behavior

For `csv`, `xls`, and `xlsx` files:

- the backend accepts them only for the `tallied_points` panel
- the file metadata is stored
- the file is marked as stored for training-data preparation

Current limitation:

- the file contents are **not parsed into structured rows yet**

So this panel is good for **collection and storage**, but not yet for automated ingestion of tallied scores into the database.

### 7. Guideline reference behavior

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

### 8. TQE.csv reference behavior

The system loads `TQE.csv` at startup.

What it does with it:

- parses rows
- summarizes numeric fields
- calculates simple benchmark closeness against faculty features

What it does **not** do:

- it does not treat `TQE.csv` as final promotion-label training data
- it does not train a model from it

This makes `TQE.csv` a reference dataset, not a training pipeline yet.

### 9. Training example labeling

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
- uploads are categorized into KRA panels and stored
- training records are created and stored

Not yet achieved:

- scanned image OCR is not implemented
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
- future training-set assembly
- auditability through user-linked records
- production-minded backend structure

### What the system is not yet good at

- extracting text from image uploads
- parsing Excel/CSV tallied points into structured values
- mapping uploads precisely to NBC 461 annex scoring rules
- producing live promotion predictions
- training and evaluating machine learning models

## Current Risks and Weaknesses

### 1. OCR gap

Images are expected in the workflow but are not processable yet.

Impact:

- scanned requirements cannot yet be converted into structured text automatically

### 2. Spreadsheet parsing gap

Tallied-point uploads are stored but not read into structured records.

Impact:

- important scoring data may exist in files without being usable in analytics yet

### 3. No explicit file storage layer

The database stores metadata and extracted text, but not a managed production file-storage strategy such as:

- object storage
- disk persistence strategy
- file retention policy

Impact:

- deployment architecture still needs a real file-storage design

### 4. Session model is simple

The current cookie session is signed and useful, but it is still a lightweight custom approach.

Impact:

- acceptable for controlled deployment
- may need rotation, revocation, and stronger auth/session controls later

## Recommended Next Build Steps

### Priority 1

Implement OCR for image uploads.

Why:

- it directly unlocks the “scanned and digitized relevant documents” part of Objective 1

### Priority 2

Implement spreadsheet parsing for the `Tallied Points` panel.

Why:

- it turns stored training support files into usable structured features

### Priority 3

Map parsed evidence to NBC 461 categories and annex criteria.

Why:

- it converts general document storage into a policy-aligned scoring dataset

### Priority 4

Create a training dataset export pipeline.

Why:

- the collected records then become immediately usable for offline model development

### Priority 5

Only after enough labeled data exists, reactivate:

- feature selection
- model training
- model comparison
- model evaluation
- recommendation generation

## Final Conclusion

At this stage:

- the system **can collect and store data well**
- the system **can partially read and organize uploaded contents**
- the system is **strong for training-data preparation**
- the system is **not yet a functional predictive analytics engine**

So if the question is:

> Is the current system already useful?

Yes, as a **collection-first faculty promotion data platform**.

If the question is:

> Has it already achieved the full thesis system?

No.

It has mostly advanced **Objective 1 partially**, while **Objectives 2 to 5 remain inactive or incomplete**.
