// This promotion cycle's filing window: documents must show relevance to
// August 2023 - July 2026. Deliberately separate from `fixedReviewPeriodLabel`
// in constants/reviewCycle.ts, which drives the profile "semester" label and
// dashboard year-by-year scoring and covers a different span (July 2022-June
// 2026) - conflating the two would change scoring output, not just uploads.
export const PROMOTION_WINDOW_START = new Date(Date.UTC(2023, 7, 1)); // Aug 1, 2023
export const PROMOTION_WINDOW_END = new Date(Date.UTC(2026, 6, 31, 23, 59, 59)); // Jul 31, 2026
export const PROMOTION_WINDOW_LABEL = 'August 2023 - July 2026';

export type DocumentDateCheckStatus = 'in_range' | 'out_of_range' | 'undetected';

export interface DocumentDateCheck {
  status: DocumentDateCheckStatus;
  matchedDate: string | null;
  detectedDates: string[];
}

const MONTH_NAMES: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

const MONTH_ALTERNATION = Object.keys(MONTH_NAMES).sort((a, b) => b.length - a.length).join('|');

// "August 15, 2023" / "Aug. 15 2023"
const MONTH_DAY_YEAR = new RegExp(`\\b(${MONTH_ALTERNATION})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'gi');
// "15 August 2023" / "15th of August, 2023" / "15th day of August 2023"
const DAY_MONTH_YEAR = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:day\\s+of\\s+|of\\s+)?(${MONTH_ALTERNATION})\\.?,?\\s+(\\d{4})\\b`, 'gi');
// "2023-08-15" (ISO)
const ISO_DATE = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g;
// "08/15/2023" or "15/08/2023" - ambiguous, resolved by trying month-first then day-first
const SLASH_DATE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
// "A.Y. 2023-2024", "S.Y. 2023-24", "School Year 2023-2024"
const ACADEMIC_YEAR = /\b(?:A\.?Y\.?|S\.?Y\.?|Academic Year|School Year)\s*(\d{4})\s*[-–]\s*(\d{2,4})/gi;

function buildDate(year: number, monthIndex: number, day: number): Date | null {
  if (year < 1900 || year > 2100) return null;
  if (monthIndex < 0 || monthIndex > 11) return null;
  if (day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, monthIndex, day));
  // Reject impossible combinations like Feb 30 (Date would roll over into March)
  if (date.getUTCMonth() !== monthIndex) return null;
  return date;
}

function normalizeAcademicYearEnd(startYear: number, endYearRaw: number): number {
  if (endYearRaw >= 1900) return endYearRaw;
  // 2-digit end year, e.g. "2023-24" -> 2024
  const century = Math.floor(startYear / 100) * 100;
  return century + endYearRaw;
}

export function extractCandidateDates(text: string): Date[] {
  const dates: Date[] = [];
  let match: RegExpExecArray | null;

  MONTH_DAY_YEAR.lastIndex = 0;
  while ((match = MONTH_DAY_YEAR.exec(text))) {
    const monthIndex = MONTH_NAMES[match[1].toLowerCase()];
    const day = Number.parseInt(match[2], 10);
    const year = Number.parseInt(match[3], 10);
    const date = buildDate(year, monthIndex, day);
    if (date) dates.push(date);
  }

  DAY_MONTH_YEAR.lastIndex = 0;
  while ((match = DAY_MONTH_YEAR.exec(text))) {
    const day = Number.parseInt(match[1], 10);
    const monthIndex = MONTH_NAMES[match[2].toLowerCase()];
    const year = Number.parseInt(match[3], 10);
    const date = buildDate(year, monthIndex, day);
    if (date) dates.push(date);
  }

  ISO_DATE.lastIndex = 0;
  while ((match = ISO_DATE.exec(text))) {
    const year = Number.parseInt(match[1], 10);
    const monthIndex = Number.parseInt(match[2], 10) - 1;
    const day = Number.parseInt(match[3], 10);
    const date = buildDate(year, monthIndex, day);
    if (date) dates.push(date);
  }

  SLASH_DATE.lastIndex = 0;
  while ((match = SLASH_DATE.exec(text))) {
    const first = Number.parseInt(match[1], 10);
    const second = Number.parseInt(match[2], 10);
    const year = Number.parseInt(match[3], 10);
    // Try month-first (US/PH form convention); fall back to day-first if the
    // first number can't be a month.
    const monthFirst = buildDate(year, first - 1, second);
    if (monthFirst) {
      dates.push(monthFirst);
    } else {
      const dayFirst = buildDate(year, second - 1, first);
      if (dayFirst) dates.push(dayFirst);
    }
  }

  ACADEMIC_YEAR.lastIndex = 0;
  while ((match = ACADEMIC_YEAR.exec(text))) {
    const startYear = Number.parseInt(match[1], 10);
    const endYear = normalizeAcademicYearEnd(startYear, Number.parseInt(match[2], 10));
    // Represent the academic year as its start (Aug 1) - anchoring on either
    // boundary would misclassify a straddling A.Y. the same way; the start
    // is what OCR most consistently surfaces first.
    const date = buildDate(startYear, 7, 1);
    if (date) dates.push(date);
    void endYear;
  }

  return dates;
}

function isWithinPromotionWindow(date: Date): boolean {
  return date.getTime() >= PROMOTION_WINDOW_START.getTime() && date.getTime() <= PROMOTION_WINDOW_END.getTime();
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Fail-open by design: OCR text from scanned certificates/forms is often
// noisy or missing a printed date entirely, and rejecting every undetected
// case would punish legitimate uploads for an OCR limitation rather than an
// actual policy violation. Only a document where every detected date falls
// outside the window is blocked; "undetected" is returned for the evaluator
// to review manually instead of hard-failing the upload.
export function checkPromotionWindow(text: string): DocumentDateCheck {
  const dates = extractCandidateDates(text);

  if (!dates.length) {
    return { status: 'undetected', matchedDate: null, detectedDates: [] };
  }

  const detectedDates = dates.map(formatDate);
  const inRangeDate = dates.find(isWithinPromotionWindow);

  if (inRangeDate) {
    return { status: 'in_range', matchedDate: formatDate(inRangeDate), detectedDates };
  }

  return { status: 'out_of_range', matchedDate: detectedDates[0] ?? null, detectedDates };
}
