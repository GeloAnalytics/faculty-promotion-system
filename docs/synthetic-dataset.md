# Synthetic faculty dataset and scoring-accuracy testing

Tooling in `scripts/synthetic/` generates a reproducible cohort of fictional faculty with known ground-truth scores, loads it through the same code path real uploads use, and measures how closely the scoring mechanism recovers the truth.

> **Disclosure.** Records created by this tooling are fictional. They carry no marker inside the database (by design, so they exercise the system exactly like real data), so the only way to tell them apart is the local registry file described below. Anyone who includes them in accuracy figures or ML training data must disclose them as synthetic.

## What it generates

`buildCohort(seed, count)` in `build.ts` is deterministic: the same seed always yields the same people and documents.

- **People:** fictional names, 10-digit employee IDs, `@lspu.edu.ph` emails, a rank (Instructor I to Professor IV, weighted toward the middle ranks), a college, education level, and years in service.
- **Evidence profile ("archetype"):** `strong` 20%, `solid` 35%, `average` 25%, `weak` 20%. It sets how many criteria have evidence, how complete that evidence is, how many outputs each criterion has, and the mean teaching rating.
- **Documents (about 20 per faculty):**
  - KRA I Criterion A: a SET and a SEF per semester (2 to 6 semesters), in the layouts the extractor reads (letter form, CMO 19 form, weighted table, FEDAF).
  - Every other criterion: one document per output, built from the keyword rules in `src/utils/evidenceRules.ts` so the text contains the evidence the scorer looks for. Optional criteria (inventions, creative works, administrative designation, new-entrant experience) appear for a minority of faculty.
  - All dates fall inside the Aug 2023 to Jul 2026 promotion window.
- **Delivery formats:** 25% of faculty are loaded as OCR-style text rows only (no stored file, with simulated scan damage). The other 75% are rendered as real PDFs uploaded to the configured storage bucket: born-digital text-layer PDFs and scanned-style image PDFs that go through real OCR.

## Ground truth and its assumptions

- **Teaching effectiveness** uses the exact NBC 461 formula already in the app: `SET / 100 x 36 + SEF / 100 x 24`, averaged over the semesters evidenced.
- **Every other criterion:** `max score x evidence completeness x min(1, outputs / outputs needed for the maximum)`.
  - *Evidence completeness* is the share of the criterion's required-evidence checklist the generated documents contain.
  - *Outputs needed for the maximum* is a per-criterion constant in `build.ts` (`UNITS_FOR_MAX`).
  - **This quantity rule is an assumption.** It encodes that points accumulate with the number of outputs. Check the constants against the circular before treating the quantity-related findings below as defects.
- Expected KRA totals, weighted score, bracket and rank outcome come from running the app's own `buildDraftPointSummary` on the true values.

The ground truth tests extraction robustness and pipeline consistency. It is not a measure of agreement with human evaluators.

## Tools

| Script | Purpose |
|---|---|
| `build.ts` | Deterministic cohort and ground truth |
| `templates.ts`, `noise.ts`, `pdf.ts` | Document text, scan-style degradation, PDF writers |
| `evaluate.ts` | Offline accuracy run on simulated noise (no database) |
| `diagnose.ts` | Splits error into extraction error and quantity error; per-layout teaching-form read rates |
| `load.ts` | Loads the cohort into the database and storage bucket through the real upload path (pdf-parse, then OCR, then `analyzeDocumentContent`) |
| `live-report.ts` | Accuracy run on the text actually stored in the database |
| `verify-final.ts` | Post-load integrity counts |
| `unload.ts` | Removes everything listed in the local registry |
| `write-registry-md.ts` | Writes the human-readable registry |

```bash
# Offline accuracy on simulated noise (no database needed)
npx tsx scripts/synthetic/evaluate.ts 20261120
npx tsx scripts/synthetic/diagnose.ts

# Load (writes to the configured database and storage bucket)
OCR_PROVIDER=tesseract OCR_API_URL= OCR_API_KEY= GOOGLE_VISION_API_KEY= \
  npx tsx --env-file=.env scripts/synthetic/load.ts --pilot        # 3 faculty
OCR_PROVIDER=tesseract OCR_API_URL= OCR_API_KEY= GOOGLE_VISION_API_KEY= \
  npx tsx --env-file=.env scripts/synthetic/load.ts --all          # whole cohort, resumable

# Verify, measure, and remove
npx tsx --env-file=.env scripts/synthetic/verify-final.ts
npx tsx --env-file=.env scripts/synthetic/live-report.ts docs/synthetic-accuracy-live.txt
npx tsx --env-file=.env scripts/synthetic/unload.ts --all --dry
```

### Safety rules built into the loader

- **Local OCR only.** The app prefers OCR.space whenever `OCR_API_URL` and `OCR_API_KEY` are set, even with `OCR_PROVIDER=tesseract`, which would spend a quota shared with real users. The loader refuses to run unless OCR resolves to local Tesseract, which is why the OCR variables are blanked on the command line.
- **R2 only.** It refuses to run unless the active storage provider is Cloudflare R2.
- **Resumable and recorded.** Every created user, profile, document and storage key is written to `scripts/synthetic/registry.json` as it is created. A rerun skips faculty already loaded, and the loader stops at the first failure.
- **Scoped removal.** `unload.ts` only touches registry entries, and skips any account whose email no longer matches the generated record or that owns documents not in the registry.
- **The registry is not committed.** The repository is public, so `scripts/synthetic/registry.json` and `docs/synthetic-faculty-registry.md` (names, emails, employee IDs and account IDs) are git-ignored and kept locally.

## Findings (2026-11-20 run, 100 faculty, 2,041 documents)

Measured on the text the live pipeline stored: real `pdf-parse` for text-layer PDFs and real Tesseract for scans. The aggregate report is in [`synthetic-accuracy-live.txt`](synthetic-accuracy-live.txt).

| Measure | Result |
|---|---|
| Teaching ratings read correctly | 92.6% recall, 96.9% precision |
| Teaching points error (max 60) | 0.28 mean absolute error; within 1 point for 98% of faculty |
| Other criteria, points error | 6.6 mean absolute error, all of it overscoring |
| Suggested rank equals ground truth | 80% |
| Score bracket equals ground truth | 40% |

1. **Quantity blindness is the dominant error, and the circular confirms it is a real defect.** One complete set of evidence earns full credit regardless of how many outputs there are. DBM-JC No. 3 s. 2022 Annex II awards points per output and sums them to the cap (KRA II Criterion A: book 100, journal article 50, book chapter 35, each times the author's percentage contribution; KRA III Criterion B: 8 points per local-agency engagement), so a single journal article is credited 100 instead of 50. The generator's `UNITS_FOR_MAX` constants simplify those per-type values. Under that model, Research Outputs is overscored by about 22 points on average, Continuing Development by 12, and Service to the Community by 10. Real OCR moved these numbers by about one point or less compared with the simulated-noise run, so OCR is not the cause.
2. **Teaching-form extraction is fragile under heavy damage (partly fixed 2026-11-20).** On simulated noise, forms are read correctly 63% to 79% of the time, falling to 25% for CMO 19 forms under heavy noise. Two causes are visible: `detectSingleEvaluator` needs the exact word "evaluation" (an OCR typo such as "Evaluotion" drops the whole form), and a garbled academic-year range such as "2024-225" loses the semester.
3. **Underscore keywords never matched real OCR (fixed 2026-11-20).** Rules such as `certificate of contribution form_translated research` need the underscore, which OCR drops. This produced a Research Outputs score of 33 against a true 100 before the writer bug below was fixed.
4. **Keyword matching is a plain substring test (wrapped lines fixed 2026-11-20; short-keyword precision still open).** Short terms (`set`, `role`, `program`, `moa`, `cav`, `ched`) match inside ordinary words, so on about 90% of Thesis and Continuing Development panels the scorer saw keywords that were not part of the evidence. The effect on totals nets out to about one point, but it is a precision weakness. Multi-word keywords split across a wrapped line are also missed, because the text is not whitespace-normalized before matching.

### Limits of these numbers

- The synthetic scans are cleaner than real scans, so the 99%+ OCR fidelity on scanned PDFs is optimistic. The 25% text-only faculty carry simulated damage and are the harder case (teaching error about 1.1 points).
- The noise levels are assumptions, not measurements of real scanner output.
- A pass here does not show agreement with human evaluators.

## Implementation notes

- PDFs are written with `@napi-rs/canvas` (`PDFDocument`). An earlier hand-written PDF writer produced files that `pdf-parse`'s bundled pdf.js rejected for about 45% of documents, which silently pushed those through slow OCR of badly rendered glyphs. If you change the writer, re-run a batch parse of every generated text PDF before loading.
- The loader writes `ocrError` only when no text was recovered, matching the real upload endpoint.

## Effect of the 2026-11-20 fixes

Matching now normalizes underscores and whitespace, the single-evaluator detector tolerates OCR typos in "Evaluation", and an academic year with a mangled end keeps its start year. Same seed, before and after:

| Measure | Before | After |
|---|---|---|
| Rating recall, simulated noise | 76.2% | 77.4% |
| Rating recall, live stored text | 92.6% | 93.0% |
| Rating precision, live stored text | 96.9% | 97.2% |
| Teaching points error, live text | 0.28 | 0.28 |
| Other criteria points error, live text | 6.64 | 6.64 |
| Suggested rank / bracket agreement | 80% / 40% | 80% / 40% |

The improvement is small and there is no regression. Panel-level error did not move because quantity blindness, not extraction, drives it.
