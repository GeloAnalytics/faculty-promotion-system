# Release Notes

## 2026-06-03

### Summary

This update fixes overlapping panels in both active dashboards by keeping the employee upload panels on the left side and the evaluator database viewer on the left side, while their sticky scoring summaries remain in the right rail.

### What Changed

- Repositioned the employee `Upload Panels` section so it stays in the left dashboard column instead of spanning under the sticky approximate-scoring card.
- Repositioned the evaluator `Database Viewer` section so it stays in the left dashboard column instead of spanning under the sticky scoring form.
- Kept the sticky right-side scoring panels intact so the side utilities remain visible without overlapping the main workspace.

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
