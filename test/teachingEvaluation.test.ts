import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTeachingEffectivenessPoints,
  extractTeachingEvaluationRatings,
  parseEvaluationPeriod,
} from '../src/utils/teachingEvaluation';
import { analyzeDocumentContent, isGuidelineReferenceDocument } from '../src/utils';
import { buildDraftPointSummary } from '../src/utils/dashboard.utils';

// OCR output of real LSPU forms, names replaced. Line order is as OCR returned it.
const LETTER_FORM = `Republic of the Philippines
Laguna State Polptechnic Unibersity
COLLEGE OF COMPUTER STUDIES
EVALUATION OF TEACHING EFFECTIVENESS
(Supervisor's Evaluation)
Date: October 3, 2025
Name of Faculty: Cruz, Juan D.
1st Semester 2025-2026
I am pleased to inform you of your performance during the first semester A.Y. 2025-2026.
Criteria
Course/ Subject Matter Organization
Grand Mean
Equivalent
Percentage
4.74
97.4
Descriptive
Interpretation
Excellent
CS CamScanner`;

// Title lost in OCR, comma decimal, percentage printed before "Criteria".
const LETTER_FORM_NO_TITLE = `COLLEGE OF COMPUTER STUDIES
(Student's Evaluation)
Date: June 06, 2025
2nd Semester 2024-2025
Grand Mean
Equivalent
Percentage
4,53
95.26
Criteria
Course/ Subject Matter Organization
Excellent`;

const CMO19_FORM = `EVALUATION OF TEACHING EFFECTIVENESS
(Supervisor's Evaluation)
Date: March 23, 2026
2nd Semester 2025-2026
Criteria
Total Score
Computed
Rating
Management of Teaching and Learning
73.00
97.33333333
Adjectival Rating
Always manifested`;

const BLANK_CMO19_TEMPLATE = `SUPERVISOR'S EVALUATION OF FACULTY
Scale 4.21-5.00 3.41-4.20
Evident in nearly all relevant situations (91–100% of instances).
Sometimes manifested Evident about half the time (31-60%).
: Second Semester 2025-2026
TOTAL SCORE
COMPUTED RATING
(Total Score/75) x 100
ADJECTIVAL RATING
34 3 2 1 54`;

const BLANK_LETTER_FORM = `EVALUATION OF TEACHING EFFECTIVENESS
(Supervisor's Evaluation)
Date: October 2,2023
1st Semester 2023-2024
Criteria
Grand Mean
Equivalent
Percentage
0.00
50
#N/A`;

const WEIGHTED_SET_TABLE = `EVALUATION OF TEACHING EFFECTIVENESS
(Student's Evaluation)
Date: July 27, 2026
2nd Semester 2025-2026
Course Code EE 2 EEP 2 TOTAL
Average SET No. of Students Rating 31 90.28 22 37 90.61 94.52 28 118 96.48
SET RATING
Weighted SET Score
2 798.66 1993.33 3 497.33 10 990.65
93.14%`;

const FEDAF = `INDIVIDUAL FACULTY EVALUATION REPORT
Semester/Term & Academic Ycar: Scond Semester - AY 2025-2026
B. Summary of Average SET Rating Computation*
(4) Average SET Rating 20.08 96.85 3,200.12
C. SET and SEF Ratings
OVERALL RATING
SET Rating
95.56
*SEF Rating
97.33`;

test('reads the letter form percentage and its term', () => {
  assert.deepEqual(extractTeachingEvaluationRatings(LETTER_FORM), [
    { evaluator: 'supervisor', rating: 97.4, period: '1-2025' },
  ]);
  assert.deepEqual(extractTeachingEvaluationRatings(LETTER_FORM_NO_TITLE), [
    { evaluator: 'student', rating: 95.26, period: '2-2024' },
  ]);
});

test('reads the CMO 19 computed rating from its total score', () => {
  assert.deepEqual(extractTeachingEvaluationRatings(CMO19_FORM), [
    { evaluator: 'supervisor', rating: 97.33, period: '2-2025' },
  ]);
});

test('reads weighted SET tables and FEDAF summaries', () => {
  assert.deepEqual(extractTeachingEvaluationRatings(WEIGHTED_SET_TABLE), [
    { evaluator: 'student', rating: 93.14, period: '2-2025' },
  ]);
  assert.deepEqual(extractTeachingEvaluationRatings(FEDAF), [
    { evaluator: 'student', rating: 95.56, period: '2-2025' },
    { evaluator: 'supervisor', rating: 97.33, period: '2-2025' },
  ]);
});

test('reads FEDAF labels even when OCR garbles the words around (SET)/(SEF)', () => {
  const garbled = `Faculty Evaluation Summary Student Evaluation ofTeachers (SET) 95.56 Supervisor's Evaluation nf Faculty (SEF) 97.33 C. Development Plan`;
  assert.deepEqual(extractTeachingEvaluationRatings(garbled), [
    { evaluator: 'student', rating: 95.56, period: null },
    { evaluator: 'supervisor', rating: 97.33, period: null },
  ]);
});

test('an undated rating that repeats a dated one is not counted as another semester', () => {
  const result = computeTeachingEffectivenessPoints([
    { evaluator: 'student', rating: 95.56, period: '2-2025' },
    { evaluator: 'student', rating: 90, period: '1-2025' },
    { evaluator: 'student', rating: 95.56, period: null },
  ]);
  assert.equal(result?.studentSemesters, 2);
  assert.equal(result?.studentAverage, 92.78);
});

test('does not score blank forms or templates', () => {
  assert.deepEqual(extractTeachingEvaluationRatings(BLANK_LETTER_FORM), []);
  assert.deepEqual(extractTeachingEvaluationRatings(BLANK_CMO19_TEMPLATE), []);
  assert.deepEqual(extractTeachingEvaluationRatings('CERTIFICATE OF PARTICIPATION awarded on December 9-11, 2023'), []);
  assert.deepEqual(extractTeachingEvaluationRatings(''), []);
});

test('repairs OCR-garbled academic years', () => {
  assert.equal(parseEvaluationPeriod('1st Semester 2033-2024'), '1-2023');
  assert.equal(parseEvaluationPeriod('Second Semester 2025-2020 ... Second Semester 2025-2026'), '2-2025');
  assert.equal(parseEvaluationPeriod('No term here'), null);
});

test('applies the NBC 461 36/24 split over evidenced semesters', () => {
  // Circular sample: student 95 89 88 92 94 85 -> 32.58; supervisor 90 92 94 90 91 95 -> 22.08.
  const student = [95, 89, 88, 92, 94, 85].map((rating, index) => ({
    evaluator: 'student' as const,
    rating,
    period: `${(index % 2) + 1}-${2020 + Math.floor(index / 2)}`,
  }));
  const supervisor = [90, 92, 94, 90, 91, 95].map((rating, index) => ({
    evaluator: 'supervisor' as const,
    rating,
    period: `${(index % 2) + 1}-${2020 + Math.floor(index / 2)}`,
  }));
  const result = computeTeachingEffectivenessPoints([...student, ...supervisor, student[0]]);
  assert.equal(result?.studentPoints, 32.58);
  assert.equal(result?.supervisorPoints, 22.08);
  assert.equal(result?.points, 54.66);
  assert.equal(result?.studentSemesters, 6);

  const studentOnly = computeTeachingEffectivenessPoints([{ evaluator: 'student', rating: 90, period: '1-2024' }]);
  assert.equal(studentOnly?.points, 32.4);
  assert.equal(studentOnly?.supervisorAverage, null);
  assert.equal(computeTeachingEffectivenessPoints([]), null);
});

test('dashboard scores the teaching panel from uploaded evaluation forms', () => {
  const document = (text: string) => ({
    extractionMetadata: {
      uploadType: 'evidence',
      panelKey: 'kra1_teaching_effectiveness',
      analysis: analyzeDocumentContent(text, 'kra1_teaching_effectiveness', 'pdf'),
    },
  });
  const summary = buildDraftPointSummary(
    { features: { personalData: { academicRank: 'Instructor I' } }, semester: null },
    [document(LETTER_FORM), document(WEIGHTED_SET_TABLE), document(BLANK_LETTER_FORM)],
  );
  const panel = summary.scoreComputation.panelScores.find((item) => item.key === 'kra1_teaching_effectiveness');
  // 93.14 / 100 x 36 + 97.4 / 100 x 24
  assert.equal(panel?.usedScore, 56.91);
  assert.equal(panel?.scoreSource, 'ocr-detected');
  assert.match(panel?.note ?? '', /NBC 461/);
});

test('the uploaded promotion circular itself earns no points', () => {
  const circular = `ANNEX I – Evaluation Criteria Page 1 of 6 KRA I - INSTRUCTION 100 Criterion A – Teaching Effectiveness Maximum of 60
ANNEX II – Implementing Guidelines Points = OR (Overall Rating) ÷ 100 x 36 Teaching Effectiveness 60 Research Outputs 100`;
  assert.equal(isGuidelineReferenceDocument(circular), true);
  assert.equal(isGuidelineReferenceDocument(LETTER_FORM), false);
  const analysis = analyzeDocumentContent(circular, 'kra1_teaching_effectiveness', 'pdf');
  assert.deepEqual(analysis.extractedScores, {});
  assert.equal(analysis.referenceDocument, true);

  const summary = buildDraftPointSummary({ features: {}, semester: null }, [
    { extractionMetadata: { uploadType: 'evidence', panelKey: 'kra1_teaching_effectiveness', analysis } },
  ]);
  const panel = summary.scoreComputation.panelScores.find((item) => item.key === 'kra1_teaching_effectiveness');
  assert.equal(panel?.usedScore, 0);
});
