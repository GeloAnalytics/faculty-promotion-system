# Rank Draft Feature Implementation Plan

## Goal

Add a promotion draft rank feature where:

- employees can see only their own current rank, latest evaluator-backed score, and draft target rank
- evaluators can see the same draft-rank recommendation for all employee submissions
- OCR remains a supporting evidence-extraction tool and not the sole basis for promotion rank decisions

## Current State

The system already supports:

- faculty profile capture including `academicRank`
- KRA-based document uploads aligned with the scoring workflow
- OCR and PDF text extraction for uploaded evidence
- evaluator criterion scoring with a stored total score
- separate employee and evaluator dashboard endpoints

The system does not yet fully support:

- an official CHED/NBC rank progression matrix
- a formal score-to-rank rules engine
- explicit promotion recommendation status labels in the UI
- audit-ready explanations showing exactly why a draft rank was suggested

## Scope

This implementation covers:

- showing a draft rank only to the relevant employee on the employee dashboard
- showing draft rank recommendations for all employees in the evaluator queue
- computing the draft rank from server-side data
- keeping rank visibility separated by role

This implementation does not yet cover:

- final committee approval logic
- automatic promotion decisions
- exact CHED/NBC score-threshold tables unless separately encoded and approved
- fairness or calibration analytics

## Functional Requirements

1. The employee dashboard must expose only the signed-in employee's own draft-rank snapshot.
2. The evaluator queue must expose draft-rank snapshots for all reviewable employee records.
3. The draft-rank snapshot must include:
   - current academic rank
   - latest evaluator total score when available
   - suggested draft rank
   - note explaining whether the result is pending or evaluator-backed
4. If no evaluator score exists yet, the draft rank must remain pending.
5. The system must avoid recommending a rank lower than the employee's current normalized rank.

## Architecture Plan

### Phase 1: Backend Rank Snapshot

Implement a backend helper that:

- reads the employee's current academic rank from saved profile input
- reads the latest evaluator assessment total score
- normalizes academic-rank naming
- maps score to a provisional rank
- returns a `promotionDraft` snapshot object for the dashboards

Primary files:

- `src/utils/dashboard.utils.ts`
- `src/controllers/dashboard.controller.ts`

## Phase 2: Employee Visibility Rules

Ensure the employee dashboard response includes only:

- that employee's own profiles
- that employee's own uploads
- that employee's own draft-rank snapshot

Primary file:

- `src/controllers/dashboard.controller.ts`

## Phase 3: Evaluator Visibility Rules

Ensure the evaluator review queue includes:

- each employee's current rank
- each employee's draft-rank recommendation
- latest evaluator-backed score where available

Primary files:

- `src/controllers/dashboard.controller.ts`
- `public/app.js`

## Phase 4: UI Presentation

Add UI fields for:

- current rank
- draft rank
- evaluator total
- pending-review messaging

Employee UI behavior:

- only show the signed-in employee's result
- clearly label pending evaluator review

Evaluator UI behavior:

- show rank recommendation alongside queue items
- keep evaluator scoring workflow unchanged

Primary file:

- `public/app.js`

## Phase 5: Official Rules Upgrade

Replace the provisional score-to-rank ladder with the institution's official CHED/NBC mapping.

Needed inputs:

- official rank order
- official point thresholds
- any special eligibility gates
- any promotion caps or stepwise movement rules

Potential implementation:

- `src/config/promotion-rules.ts`
- `src/utils/promotion.utils.ts`

## Data Rules

- OCR text may support extracted evidence, completeness, and quality indicators.
- Evaluator scores should remain the primary source for draft-rank recommendation.
- Employee-side rank output should never include other employees' records.
- Draft rank should be treated as advisory until formally approved.

## Risks

- Rank naming may be inconsistent in user-entered profile data.
- Heuristic score-to-rank mapping may not match official CHED/NBC rules.
- Missing evaluator scores can lead to incomplete employee expectations if not clearly labeled.
- OCR extraction quality may affect upstream evidence review if documents are poor quality.

## Acceptance Criteria

- Employees can log in and see only their own current rank and draft-rank result.
- Evaluators can see draft-rank recommendations for all queued employee records.
- Records without evaluator scoring show a pending status instead of a misleading rank.
- The backend computes the rank snapshot server-side.
- The feature builds successfully and does not break existing upload or scoring flows.

## Next Recommended Tasks

1. Encode the official CHED/NBC promotion rules in a dedicated backend module.
2. Add unit tests for rank normalization and score-to-rank mapping.
3. Add an explanation panel showing why a draft rank was produced.
4. Add committee-review states such as `Pending`, `For Validation`, `Committee Approved`, and `Final`.
5. Add audit logging for changes to evaluator scores and draft-rank outputs.
