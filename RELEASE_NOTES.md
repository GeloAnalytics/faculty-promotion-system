# Release Notes

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
