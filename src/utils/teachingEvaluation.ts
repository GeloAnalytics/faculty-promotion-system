/**
 * Reads student (SET) and supervisor (SEF) teaching-effectiveness ratings off
 * LSPU evaluation forms and turns them into KRA 1 Criterion A points using the
 * DBM-JC No. 3 s. 2022 (NBC 461) formula:
 *
 *   Student points    = average SET rating ÷ 100 × 36
 *   Supervisor points = average SEF rating ÷ 100 × 24
 *
 * Layouts recognized, all as they come out of OCR (line order is often
 * scrambled, so labels and values are rarely adjacent):
 *   - Letter form: "Grand Mean 4.74 / Equivalent Percentage 97.4"
 *   - CMO 19 form: "Total Score 72.00 / Computed Rating 96"
 *   - SET Rating letter / weighted SET table: "SET Rating 95.56", "93.14%"
 *   - FEDAF / acknowledgement: "SET Rating 95.56 ... SEF Rating 97.33"
 */

export type TeachingEvaluator = 'student' | 'supervisor';

export interface TeachingEvaluationRating {
  evaluator: TeachingEvaluator;
  /** Rating on the 0-100 scale the NBC 461 formula divides by 100. */
  rating: number;
  /** "1-2024" = 1st semester of AY 2024-2025; null when the form has no readable term. */
  period: string | null;
}

export interface TeachingEffectivenessPoints {
  points: number;
  studentPoints: number;
  supervisorPoints: number;
  studentAverage: number | null;
  supervisorAverage: number | null;
  studentSemesters: number;
  supervisorSemesters: number;
}

export const STUDENT_EVALUATION_MAX_POINTS = 36;
export const SUPERVISOR_EVALUATION_MAX_POINTS = 24;

// A 1.00-5.00 grand mean transmutes to 60-100 on LSPU's letter form
// (percentage = 50 + 10 x mean), so anything below 60 there is a blank sheet.
const MIN_EQUIVALENT_PERCENTAGE = 60;
// The CMO 19 form rates 15 statements 1-5: Total/75 x 100 is at least 20.
const MIN_COMPUTED_RATING = 20;

// Spreadsheet-exported forms print ratings like 97.33333333.
const RATING_NUMBER = String.raw`(\d{1,3}(?:\.\d+)?)(?!\d)`;

const MONTH_DATE_PATTERN =
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4}/gi;
const NUMBER_RANGE_PATTERN = /\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?\s*%?/g;
// Printed under the CMO 19 "Computed Rating" label; its 75 and 100 would
// otherwise pair up as a perfect score on a blank form.
const COMPUTED_RATING_FORMULA_PATTERN = /\(?\s*total\s*score\s*\/\s*75\s*\)?\s*x\s*100/gi;
const AY_RANGE_PATTERN =/\b(20\d{2})\s*[-–]\s*(2\.?0\d{2})\b/g;

function inRange(value: number, min: number, max = 100) {
  return Number.isFinite(value) && value >= min && value <= max;
}

function roundTo2(value: number) {
  return Math.round(value * 100) / 100;
}

function numbersIn(text: string) {
  return [...text.matchAll(new RegExp(String.raw`(?<![\d.])${RATING_NUMBER}`, 'g'))].map((match) => Number(match[1]));
}

/** Last number captured by `pattern` that falls in [min, 100]. */
function lastRatingMatch(text: string, pattern: RegExp, min: number): number | null {
  const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  let last: number | null = null;
  for (const match of text.matchAll(global)) {
    const value = Number(match[1]);
    if (inRange(value, min)) {
      last = roundTo2(value);
    }
  }
  return last;
}

/** Reads "1st Semester A.Y. 2024-2025" style terms, tolerating common OCR slips. */
export function parseEvaluationPeriod(text: string): string | null {
  const semesterMatch =
    /\b(1st|first|ist|1\W{0,2}s?t?|2nd|second|s\w?cond|2\W{0,2}n?d?)\s*sem(?:ester)?\b/i.exec(text) ??
    /\b(summer|midyear)\b/i.exec(text);
  if (!semesterMatch) {
    return null;
  }
  const token = semesterMatch[1].toLowerCase();
  const semester = /^(summer|midyear)/.test(token) ? 'S' : /^(2|second|s\w?cond)/.test(token) ? '2' : '1';

  // OCR garbles one year of the range now and then ("2033-2024",
  // "2025-2020"), so prefer a range whose years are consecutive.
  const afterSemester = text.slice(semesterMatch.index);
  const ranges = [...afterSemester.matchAll(AY_RANGE_PATTERN), ...text.matchAll(AY_RANGE_PATTERN)].map((match) => ({
    start: Number(match[1]),
    end: Number(match[2].replace('.', '')),
  }));
  const consistent = ranges.find((range) => range.end - range.start === 1);
  if (consistent) {
    return `${semester}-${consistent.start}`;
  }
  const [first] = ranges;
  if (!first) {
    return null;
  }
  const latestPlausibleYear = new Date().getFullYear() + 1;
  return `${semester}-${first.start <= latestPlausibleYear ? first.start : first.end - 1}`;
}

function detectSingleEvaluator(text: string): TeachingEvaluator | null {
  const match = /\b(students?|supervisor)\W{0,3}s?\W{0,2}\s*evaluation/i.exec(text);
  if (!match) {
    return null;
  }
  return match[1].toLowerCase().startsWith('student') ? 'student' : 'supervisor';
}

function readComputedRating(text: string): number | null {
  if (!/computed\s*rating/i.test(text)) {
    return null;
  }
  // The label and its value are rarely adjacent after OCR, so look for the
  // pair the form itself defines: Computed Rating = Total Score / 75 x 100.
  const numbers = numbersIn(
    text
      .replace(COMPUTED_RATING_FORMULA_PATTERN, ' ')
      .replace(MONTH_DATE_PATTERN, ' ')
      .replace(NUMBER_RANGE_PATTERN, ' '),
  );
  for (const total of numbers.filter((value) => inRange(value, 15, 75))) {
    const expected = (total / 75) * 100;
    const rating = numbers.find((value) => value !== total && Math.abs(value - expected) <= 0.5);
    if (rating !== undefined) {
      return roundTo2(rating);
    }
  }
  // Skip the "(Total Score/75) x 100" formula printed under the label so its
  // 75 is never read as the rating.
  return lastRatingMatch(
    text,
    new RegExp(String.raw`computed\s*rating\s*(?:\([^)]{0,40}\)\s*(?:x\s*100)?)?\s*[:=\-]?\s*${RATING_NUMBER}`, 'i'),
    MIN_COMPUTED_RATING,
  );
}

function readEquivalentPercentage(text: string): number | null {
  if (!/equivalent|grand\s*(?:equivalent\s*)?mean/i.test(text)) {
    return null;
  }
  const numbers = numbersIn(text.replace(MONTH_DATE_PATTERN, ' ').replace(NUMBER_RANGE_PATTERN, ' '));
  const means = numbers.filter((value) => inRange(value, 1, 5));
  const percentages = numbers.filter((value) => inRange(value, MIN_EQUIVALENT_PERCENTAGE));

  // Prefer a percentage that matches a mean on the same sheet; that rules out
  // stray numbers such as control codes.
  const confirmed = percentages.filter((percentage) =>
    means.some((mean) => Math.abs(50 + mean * 10 - percentage) <= 0.6),
  );
  const candidates = confirmed.length ? confirmed : percentages;
  const distinct = [...new Set(candidates.map(roundTo2))];
  return distinct.length === 1 ? distinct[0] : null;
}

/** Weighted SET tables end with the overall rating as a percentage ("93.14%"). */
function readWeightedRatingPercentage(text: string): number | null {
  if (!/\b(?:SET|SEF)\s*rating|weighted/i.test(text)) {
    return null;
  }
  return lastRatingMatch(
    text.replace(NUMBER_RANGE_PATTERN, ' '),
    new RegExp(String.raw`(?<![\d.])${RATING_NUMBER}\s*%`),
    MIN_COMPUTED_RATING,
  );
}

/**
 * Returns every SET/SEF rating found on the document. A FEDAF carries both;
 * a single-evaluator letter carries one.
 */
export function extractTeachingEvaluationRatings(rawText: string): TeachingEvaluationRating[] {
  // "4,95" is a decimal comma; "3,200.12" (a thousands separator) is left alone.
  const text = rawText
    .replace(/\s+/g, ' ')
    .replace(/\b(\d),(\d{1,2})(?![\d,])/g, '$1.$2')
    .trim();
  if (!text) {
    return [];
  }
  const period = parseEvaluationPeriod(text);
  const ratings: TeachingEvaluationRating[] = [];

  // Explicitly labeled SET/SEF ratings (FEDAF, SET Rating letters). The last
  // occurrence is the overall rating; earlier ones are per-class rows or the
  // "SET Rating Computation" heading. A short gap is allowed for a
  // neighbouring label ("SET Rating / Adjectival Rating / 95.56").
  // The bracketed acronyms are matched on their own because OCR mangles the
  // words around them ("Evaluation nf Faculty (SEF)", "ofTeachers (SET)").
  const labeled = [
    ['student', String.raw`(?:\bSET\s*rating|\(\s*SET\s*\))`],
    ['supervisor', String.raw`(?:\bSEF\s*rating|\(\s*SEF\s*\))`],
  ] as const;
  for (const [evaluator, label] of labeled) {
    const rating = lastRatingMatch(
      text,
      new RegExp(String.raw`${label}[^\d]{0,30}?${RATING_NUMBER}`, 'i'),
      MIN_COMPUTED_RATING,
    );
    if (rating !== null) {
      ratings.push({ evaluator, rating, period });
    }
  }
  if (ratings.length) {
    return ratings;
  }

  const evaluator = detectSingleEvaluator(text);
  // OCR sometimes drops the form title, so the rating block itself also
  // identifies an evaluation form.
  const isEvaluationForm =
    /teaching\s*effectiveness|evaluation\s*of\s*(?:faculty|teachers?)|grand\s*(?:equivalent\s*)?mean|computed\s*rating|\((?:students?|supervisor)\W{0,3}s?\W{0,2}\s*evaluation\)/i.test(
      text,
    );
  if (!evaluator || !isEvaluationForm) {
    return [];
  }
  const rating = readComputedRating(text) ?? readEquivalentPercentage(text) ?? readWeightedRatingPercentage(text);
  return rating === null ? [] : [{ evaluator, rating, period }];
}

/**
 * Averages each evaluator's ratings over the semesters actually evidenced
 * (the circular's divisor for faculty with leave semesters) and applies the
 * 36/24 point split. The same semester uploaded twice counts once.
 */
export function computeTeachingEffectivenessPoints(
  ratings: TeachingEvaluationRating[],
): TeachingEffectivenessPoints | null {
  if (!ratings.length) {
    return null;
  }

  // A form with an unreadable term (often a FEDAF) usually repeats a rating
  // already uploaded on that semester's own letter; don't count it twice.
  const dated = ratings.filter((rating) => rating.period !== null);
  const undatedDuplicates = (rating: TeachingEvaluationRating) =>
    rating.period === null &&
    dated.some((other) => other.evaluator === rating.evaluator && Math.abs(other.rating - rating.rating) < 0.01);

  const bySemester = new Map<string, TeachingEvaluationRating>();
  for (const rating of ratings.filter((rating) => !undatedDuplicates(rating))) {
    const key = `${rating.evaluator}|${rating.period ?? `unknown-${rating.rating}`}`;
    const existing = bySemester.get(key);
    if (!existing || rating.rating > existing.rating) {
      bySemester.set(key, rating);
    }
  }

  const averageOf = (evaluator: TeachingEvaluator) => {
    const values = [...bySemester.values()].filter((r) => r.evaluator === evaluator).map((r) => r.rating);
    return {
      average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
      count: values.length,
    };
  };
  const student = averageOf('student');
  const supervisor = averageOf('supervisor');
  const studentPoints = student.average === null ? 0 : (student.average / 100) * STUDENT_EVALUATION_MAX_POINTS;
  const supervisorPoints =
    supervisor.average === null ? 0 : (supervisor.average / 100) * SUPERVISOR_EVALUATION_MAX_POINTS;

  return {
    points: roundTo2(studentPoints + supervisorPoints),
    studentPoints: roundTo2(studentPoints),
    supervisorPoints: roundTo2(supervisorPoints),
    studentAverage: student.average === null ? null : roundTo2(student.average),
    supervisorAverage: supervisor.average === null ? null : roundTo2(supervisor.average),
    studentSemesters: student.count,
    supervisorSemesters: supervisor.count,
  };
}
