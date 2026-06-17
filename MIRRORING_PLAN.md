# Workbook Mirroring Plan

## Goal
Mirror the uploaded `Reference.xlsx` workbook into a website workflow that minimizes manual typing.

The website should follow the workbook structure, but the employee side should only handle uploads while the evaluator side only verifies, checks, and compares OCR output against the uploaded documents.

## Workbook Structure To Mirror

The workbook contains these major sections:

1. `Request Form`
2. `KRA I - Instruction`
3. `KRA II - Research, Innovation and Creative Work`
4. `KRA III - Extension Services`
5. `KRA IV - Professional Development`
6. `Individual Summary Sheet`

## Status Update

The backend mirroring work is partially complete. The workbook structure is now reflected in the data layer, but the full workbook-style runtime UI still needs follow-through.

### Achieved

1. KRA II now uses the workbook title `Research, Innovation and Creative Work`.
2. Dashboard utilities now produce a workbook-mirror summary with:
   1. request-form name parsing
   2. per-KRA score summaries
   3. faculty score versus validated score comparison
   4. score-bracket labels
3. Uploaded document metadata now carries panel score previews and max-score context.
4. Regression coverage now checks the mirrored workbook naming and request-form parsing behavior.
5. The upload-only employee flow and evaluator verification workflow remain aligned with the workbook approach.

### Unachieved

1. The active employee and evaluator UIs do not yet render the `workbookMirror` payload directly.
2. The Request Form is still mostly represented in backend summary data rather than a dedicated workbook-style interface.
3. The KRA pages and Individual Summary Sheet still need a full runtime presentation layer.
4. Mismatch warnings exist in the data model, but the frontend evaluator workflow does not yet surface them as a dedicated review state.
5. OCR relevance and mismatch detection still rely on heuristic rules and need workbook-specific refinement.

## Website Mapping

### Employee Flow

Replace the workbook-style manual entry with two upload actions:

1. Upload the score sheet
2. Upload the evidence documents

The employee should not manually enter KRA or criterion scores.

### Evaluator Flow

Make the evaluator workspace read-only for scoring:

1. Open the uploaded documents
2. Inspect OCR extraction
3. Compare OCR score values with the submitted documents
4. Confirm whether the computed system score matches the evidence

## Page Plan

### 1. Request Form Page

Create a website form that mirrors the workbook `Request Form` fields in a clean layout.

Suggested sections:

1. Personal information
2. Employment and rank information
3. Educational attainment
4. Basic submission metadata

### 2. KRA Pages

Create separate KRA pages or collapsible modules that reflect the workbook tabs:

1. KRA I
2. KRA II
3. KRA III
4. KRA IV

Each page should display:

1. Criterion headings
2. Maximum points
3. Uploaded evidence list
4. OCR-extracted score preview
5. System validation status

### 3. Summary Sheet Page

Create an individual summary sheet view that combines:

1. Employee identity
2. Per-KRA totals
3. Computed overall score
4. Review status
5. Evaluator confirmation area

## OCR and Validation Rules

1. Score sheet OCR should read the faculty score values.
2. Evidence uploads should be checked for file type and relevance.
3. The system should flag mismatches between OCR scores and the expected criterion total.
4. The evaluator should only confirm or reject the system result, not retype scores.

## Upload Restrictions

Recommended restrictions for the employee upload flow:

1. Score sheet: one file only
2. Evidence bundle: multiple files allowed, but limited and categorized
3. Allowed formats: PDF and common image files
4. Optional naming guidance: include KRA or criterion names in file names

## Implementation Phases

### Phase 1

Build the Request Form and upload-only employee entry flow.

Status: partially achieved in the backend summary/data layer, but not yet fully rendered in the active UI.

### Phase 2

Add KRA pages that mirror the workbook tabs and connect them to OCR output.

Status: not yet fully implemented in the runtime UI.

### Phase 3

Build the summary sheet page and evaluator verification workflow.

Status: partially represented in backend summary data; the active UI still needs the workbook-style presentation layer.

### Phase 4

Tune the OCR parsing and validation rules using the reference workbook examples.

Status: in progress. OCR metadata and score previews improved, but workbook-specific validation still needs refinement.

## Notes

1. Keep the website mobile-friendly.
2. Reduce typing wherever a document already contains the needed value.
3. Preserve evaluator oversight so the system remains a verification tool, not a blind auto-approver.
