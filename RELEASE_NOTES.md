
## 2026-06-19

### Summary

This update aligns the repository documentation with the workbook-derived documentary evidence rules, including strict `AND`/`OR` completeness handling for promotion packets.

### What Changed

- Added a dedicated documentary evidence validation matrix that summarizes the packet-level and KRA-level rules extracted from the reference workbook.
- Updated the README, mirroring plan, and dissertation revision guide to state that missing required evidence keeps a promotion packet incomplete.
- Clarified that `AND` clauses are mandatory bundles while `OR` clauses are alternative evidence paths that still require at least one qualifying document.

### Verification

- Documentation-only update; no build or test run was required.

# Release Notes

## 2026-06-17

### Summary

This update brings the backend dashboard summaries closer to the uploaded workbook by mirroring the request form structure, KRA naming, score comparison data, and summary-sheet scoring context. It also refreshes the project documentation to reflect what is now complete and what still remains in the active UI.

### What Changed

- Aligned KRA II terminology with the workbook title `Research, Innovation and Creative Work`.
- Added workbook-mirror summary data in the dashboard utilities, including parsed request-form name parts, per-KRA totals, score-bracket labels, and faculty-versus-validated score comparison.
- Extended uploaded-document metadata with panel score previews and panel max-score context for workbook-aligned review.
- Updated the mirroring plan to distinguish achieved items from the remaining UI and OCR workflow work.
- Updated `README.md` to describe the mirrored backend summary payload and the remaining runtime UI gap.

### Verification

- `npm test` passed.
- `npm run build` passed.

## 2026-06-03

### Summary

This update fixes the active dashboard overlap issues and revises the printable evaluator summary sheet so it exports as an A4 portrait PDF with a table-based middle section for criteria scores.

### What Changed

- Repositioned the employee `Upload Panels` and `Upload Logs` sections so they stay in the left dashboard column.
- Repositioned the evaluator `Database Viewer` and printable summary sheet sections so they stay in the left dashboard column.
- Kept the sticky right-side scoring panels intact so the side utilities remain visible without overlapping the main workspace.
- Reworked the summary sheet document into a table-first layout with a visible criteria score section.
- Switched the export target to A4 portrait for closer alignment with the reference form.
- Kept the top name block and bottom signature area editable from the evaluator workspace.

### Verification

- Visual layout adjustment only; no automated test run was required.

## 2026-05-31

### Summary

This update tightens the employee portal's sticky approximate-scoring sidebar so it stays readable while scrolling and no longer gets visually covered by the upload panels.

### What Changed

- Lowered the employee scoring sidebar's sticky offset for a cleaner scroll position.
- Adjusted the upload panels' stacking order so they overlay the sticky summary when the layout reaches that section.

### Verification

- Visual layout adjustment only; no automated test run was required.

## 2026-05-27

### Summary

This update restructures the live employee and evaluator portals so they use desktop screen width more effectively, and it refreshes the project documentation to reflect that UI change.

### What Changed

- Expanded the active `public/` page shell and introduced a 12-column dashboard grid for large screens.
- Rebalanced the employee portal so the faculty form and uploaded files stay in the main workspace while scoring and saved profiles move into a right-side utility rail.
- Rebalanced the evaluator portal so the review queue stays primary while the scoring form becomes a sticky side panel.
- Added evaluator section navigation for quicker movement between the review queue, scoring form, and database viewer.
- Updated `README.md` to note the wider desktop-first layout now used by the live employee and evaluator dashboards.

### Verification

- `git diff --check -- public/employee.html public/evaluator.html public/styles.css` passed.

## 2026-05-22

### Summary

This update documents the new faculty-record structure so the repository notes now match the active employee portal and dashboard behavior.

### What Changed

- Revised `README.md` to explain the split between baseline profile data and current promotion-cycle data.
- Documented promotion-history capture as part of the stable baseline profile.
- Added the backend-fed faculty option catalog endpoint to the listed API areas.
- Clarified that preliminary draft-rank estimation now combines baseline profile inputs, current-cycle metrics, and uploaded evidence signals.

### Verification

- Documentation-only revision; no code changes were made in this update.

## 2026-05-21

### Summary

This update improves session consistency across the project, reduces duplication in shared backend and portal logic, adds lightweight regression coverage, and makes the employee-side uploaded files section easier to use.

### What Changed

- Unified the frontend session approach around the existing cookie-based authentication flow.
- Added shared Vue helpers for API and session access to reduce repeated auth logic.
- Extracted reusable backend helpers for cookie parsing, dashboard training-item selection, and profile filename matching.
- Added lightweight tests for the extracted utility logic and wired them into `npm test`.
- Updated the employee portal so the `Uploaded Files` section is collapsible and includes client-side filtering by filename, criterion, and summary text.

### Verification

- `npm test` passed.
- `npm run build` passed for the backend.
- `npx vue-tsc -b` passed for the Vue frontend.

### Known Environment Note

The full Vite frontend build was not completed in the local environment because the installed Node version is below Vite's required version, and the local install is missing the optional Rolldown native binding needed by this setup.
