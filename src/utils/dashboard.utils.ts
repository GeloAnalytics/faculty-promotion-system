import { uploadPanels } from '../uploadPanels';
import { academicRankOptions, normalizeAcademicRankOption } from '../constants/faculty';
import { fixedReviewPeriodLabel, reviewCycleMetricKeys, reviewCycleYearLabels } from '../constants/reviewCycle';
import type { UploadPanelKey } from '../types';

type EvaluatorAssessmentSnapshot = {
  totalScore: number;
  criterionScores?: Record<string, number>;
};

type NameParts = {
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  extensionName: string | null;
};

type WorkbookCriterionSummary = {
  key: UploadPanelKey;
  title: string;
  maxScore: number;
  facultyScore: number | null;
  validatedScore: number | null;
  status: 'matched' | 'needs-review' | 'faculty-only' | 'validated-only' | 'missing';
  evidenceCount: number;
};

type WorkbookKraSummary = {
  title: string;
  maxScore: number;
  facultyScore: number | null;
  validatedScore: number | null;
  criteria: WorkbookCriterionSummary[];
};

type WorkbookSummaryMirror = {
  requestForm: {
    fullName: string | null;
    nameParts: NameParts;
    employeeId: string | null;
    academicRank: string | null;
    yearsInService: number | null;
    highestEducationalAttainment: string | null;
    reviewPeriod: string | null;
    department: string | null;
    notes: string | null;
  };
  kraSections: WorkbookKraSummary[];
  summarySheet: {
    facultyScore: number | null;
    validatedScore: number | null;
    scoreBracket: string | null;
    comparisonStatus: 'matched' | 'needs-review' | 'faculty-only' | 'validated-only' | 'missing';
    currentRank: string | null;
    suggestedRank: string | null;
    projectedRank: string | null;
    basis: PromotionDraftSnapshot['basis'];
  };
};

type PromotionDraftSnapshot = {
  currentRank: string | null;
  suggestedRank: string | null;
  projectedRank: string | null;
  evaluatorTotalScore: number | null;
  weightedScore: number | null;
  scoreBracket: string | null;
  subrankIncrements: number | null;
  basis: 'employee-inputs' | 'evaluator' | 'pending-review';
  status:
    | 'ready'
    | 'preliminary'
    | 'pending'
    | 'needs-exact-rank'
    | 'pending-doctoral-attainment'
    | 'pending-professor-accreditation'
    | 'pending-cup-certification';
  currentRankGroup: string | null;
  appliedWeightProfile: string | null;
  pendingRequirement: string | null;
  confidence: 'low' | 'medium' | 'high' | null;
  note: string;
};

type ParsedDocumentMetadata = {
  uploadType: string | null;
  panelKey: string | null;
  panelTitle: string | null;
  analysisSummary: string | null;
  extractedScores: Record<string, number>;
  panelScore: number | null;
  panelMaxScore: number | null;
  completenessScore: number | null;
  qualityScore: number | null;
  linkage: string | null;
};

export function summarizeDocumentMetadata(value: unknown): ParsedDocumentMetadata {
  const metadata = readJsonObject(value);
  const analysis = readJsonObject(metadata.analysis);
  const extractedScores = readNumberRecord(analysis.extractedScores);
  const linkage = readJsonObject(metadata.linkage);
  const panelKey = typeof metadata.panelKey === 'string' ? metadata.panelKey : null;
  const panelDefinition = panelKey ? uploadPanels.find((panel) => panel.key === panelKey) ?? null : null;

  return {
    uploadType: typeof metadata.uploadType === 'string' ? metadata.uploadType : null,
    panelKey,
    panelTitle: typeof metadata.panelTitle === 'string' ? metadata.panelTitle : null,
    analysisSummary: typeof analysis.summary === 'string' ? analysis.summary : null,
    extractedScores,
    panelScore: panelKey ? readOptionalNumber(extractedScores[panelKey]) : null,
    panelMaxScore: panelDefinition ? panelDefinition.maxScore : null,
    completenessScore: readOptionalNumber(analysis.completenessScore),
    qualityScore: readOptionalNumber(analysis.qualityScore),
    linkage:
      typeof linkage.matchedBy === 'string'
        ? `${linkage.matchedBy}${typeof linkage.matchedName === 'string' ? `: ${linkage.matchedName}` : ''}`
        : null,
  };
}

export function buildDraftPointSummary(
  profile: { features: unknown; semester: string | null } | null,
  documents: Array<{ extractionMetadata: unknown }>,
  latestEvaluation?: { assessment: EvaluatorAssessmentSnapshot | null; status: string | null },
  submissionRawInput?: unknown,
) {
  const rawInput = mergeFacultyRecordInput(profile?.features, submissionRawInput);
  const personalData = readJsonObject(rawInput.personalData);
  const performanceReview = readJsonObject(rawInput.performanceReview);
  const promotionHistory = Array.isArray(rawInput.promotionHistory) ? rawInput.promotionHistory : [];
  const uploadedPanels = new Set<string>();
  const panelScoreByKey = new Map<UploadPanelKey, number>();
  const panelEvidenceCount = new Map<UploadPanelKey, number>();

  let instruction = resolvePerformanceMetricValue(performanceReview, 'teachingEffectiveness') ?? 0;
  let research = resolvePerformanceMetricValue(performanceReview, 'researchOutputs') ?? 0;
  let extension = resolvePerformanceMetricValue(performanceReview, 'extensionServices') ?? 0;
  let professionalDevelopment = readOptionalNumber(performanceReview.professionalDevelopmentHours) ?? 0;
  let ipcrAverage = resolvePerformanceMetricValue(performanceReview, 'ipcrAverage') ?? 0;
  let completenessTotal = 0;
  let completenessSamples = 0;

  for (const document of documents) {
    const metadata = summarizeDocumentMetadata(document.extractionMetadata);
    if (metadata.panelKey) {
      uploadedPanels.add(metadata.panelKey);
      const panelKey = metadata.panelKey as UploadPanelKey;
      panelEvidenceCount.set(panelKey, (panelEvidenceCount.get(panelKey) ?? 0) + 1);
      if (metadata.panelScore !== null) {
        panelScoreByKey.set(panelKey, Math.max(panelScoreByKey.get(panelKey) ?? 0, metadata.panelScore));
      }
    }
    if (metadata.completenessScore !== null) {
      completenessTotal += metadata.completenessScore;
      completenessSamples += 1;
    }
    instruction = Math.max(
      instruction,
      getBestScore(metadata.extractedScores, ['teachingEffectiveness', 'kra1_teaching_effectiveness']),
    );
    research = Math.max(
      research,
      getBestScore(metadata.extractedScores, ['researchOutputs', 'kra2_research_outputs']),
    );
    extension = Math.max(
      extension,
      getBestScore(metadata.extractedScores, [
        'extensionServices',
        'kra3_service_to_institution',
        'kra3_service_to_community',
        'kra3_extension_involvement',
      ]),
    );
    professionalDevelopment = Math.max(
      professionalDevelopment,
      getBestScore(metadata.extractedScores, [
        'professionalDevelopmentHours',
        'kra4_professional_organizations',
        'kra4_continuing_development',
        'kra4_awards_recognition',
        'kra4_academic_experience',
        'kra4_industry_experience',
      ]),
    );
    ipcrAverage = Math.max(ipcrAverage, metadata.extractedScores.ipcrAverage ?? 0);
  }

  const coverage = uploadPanels.length ? uploadedPanels.size / uploadPanels.length : 0;
  const averagedCompleteness = completenessSamples ? completenessTotal / completenessSamples : 0;
  const overallEstimate = instruction + research + extension + professionalDevelopment + ipcrAverage;
  const approximateKraTotals = computeApproximateKraTotals({
    instruction,
    research,
    extension,
    professionalDevelopment,
    ipcrAverage,
    coverage,
    averagedCompleteness,
  });
  const currentRank =
    typeof personalData.academicRank === 'string' ? normalizeAcademicRank(personalData.academicRank) : null;
  const highestEducationalAttainment =
    typeof personalData.highestEducationalAttainment === 'string' ? personalData.highestEducationalAttainment : null;
  const hasDoctoralGraduateBonus = canUseDoctoralGraduateBonus(
    normalizeAttainment(highestEducationalAttainment),
    promotionHistory,
  );
  const preliminaryOutcome =
    currentRank && getAcademicRankIndex(currentRank) >= 0
      ? resolveOfficialRankOutcome(currentRank, approximateKraTotals, highestEducationalAttainment, hasDoctoralGraduateBonus)
      : null;
  const evaluatorAssessment = latestEvaluation?.assessment ?? null;
  const hasEvaluatorScore =
    (latestEvaluation?.status === 'LABELED' || latestEvaluation?.status === 'VALIDATED') &&
    evaluatorAssessment !== null &&
    Number.isFinite(evaluatorAssessment.totalScore);
  const validatedCriterionScores = hasEvaluatorScore ? readNumberRecord(evaluatorAssessment?.criterionScores) : {};
  const validatedKraTotals = hasEvaluatorScore ? computeKraTotals(validatedCriterionScores) : null;
  const validatedOutcome =
    currentRank && validatedKraTotals
      ? resolveOfficialRankOutcome(currentRank, validatedKraTotals, highestEducationalAttainment, hasDoctoralGraduateBonus)
      : null;
  const promotionDraft = buildPromotionDraftSnapshot(
    currentRank,
    highestEducationalAttainment,
    promotionHistory,
    {
      instruction,
      research,
      extension,
      professionalDevelopment,
      ipcrAverage,
      coverage,
      averagedCompleteness,
      uploadedPanelCount: uploadedPanels.size,
    },
    evaluatorAssessment,
    latestEvaluation?.status ?? null,
  );

  return {
    note: 'Approximate estimate only. Evaluator review is still required for the official score.',
    facultyName: typeof personalData.fullName === 'string' ? personalData.fullName : null,
    semester:
      (typeof performanceReview.reviewPeriod === 'string' && performanceReview.reviewPeriod) ||
      profile?.semester ||
      fixedReviewPeriodLabel,
    categories: {
      instruction: roundScore(instruction),
      research: roundScore(research),
      extension: roundScore(extension),
      professionalDevelopment: roundScore(professionalDevelopment),
      ipcrAverage: roundScore(ipcrAverage),
    },
    overallEstimate: roundScore(overallEstimate),
    evidenceCoverage: {
      uploadedPanels: Array.from(uploadedPanels),
      uploadedPanelCount: uploadedPanels.size,
      expectedPanelCount: uploadPanels.length,
      documentCompletenessAverage: roundScore(averagedCompleteness * 100),
      workflowCoveragePercent: roundScore(coverage * 100),
    },
    promotionDraft,
    workbookMirror: buildWorkbookMirrorSummary({
      rawInput,
      semester: profile?.semester ?? null,
      highestEducationalAttainment,
      currentRank,
      panelScoreByKey,
      panelEvidenceCount,
      approximateKraTotals,
      approximateOutcome: preliminaryOutcome,
      validatedOutcome,
      validatedKraTotals,
      assessment: evaluatorAssessment,
      promotionDraft,
    }),
  };
}

export function mergeFacultyRecordInput(profileFeatures: unknown, submissionRawInput?: unknown) {
  const featureEnvelope = readJsonObject(profileFeatures);
  const legacyRawInput = readJsonObject(featureEnvelope.rawInput);
  const baselineData = readJsonObject(featureEnvelope.baselineData);
  const baselinePersonalData = readJsonObject(baselineData.personalData);
  const legacyPersonalData = readJsonObject(legacyRawInput.personalData);
  const baselinePromotionHistory = Array.isArray(baselineData.promotionHistory)
    ? baselineData.promotionHistory
    : Array.isArray(legacyRawInput.promotionHistory)
      ? legacyRawInput.promotionHistory
      : [];

  const submission = readJsonObject(submissionRawInput);
  const submissionPerformanceReview = readJsonObject(submission.performanceReview);
  const legacyPerformanceReview = readJsonObject(legacyRawInput.performanceReview);

  return {
    personalData: {
      ...legacyPersonalData,
      ...baselinePersonalData,
    },
    performanceReview: Object.keys(submissionPerformanceReview).length ? submissionPerformanceReview : legacyPerformanceReview,
    promotionHistory: baselinePromotionHistory,
    notes:
      typeof submission.notes === 'string'
        ? submission.notes
        : typeof legacyRawInput.notes === 'string'
          ? legacyRawInput.notes
          : '',
  };
}

export function extractBaselineDataFromProfileFeatures(
  profileFeatures: unknown,
  fallbackName: string,
  fallbackEmployeeId: string | null,
) {
  const featureEnvelope = readJsonObject(profileFeatures);
  const baselineData = readJsonObject(featureEnvelope.baselineData);
  const legacyRawInput = readJsonObject(featureEnvelope.rawInput);
  const personalData = readJsonObject(
    Object.keys(readJsonObject(baselineData.personalData)).length ? baselineData.personalData : legacyRawInput.personalData,
  );
  const promotionHistory = Array.isArray(baselineData.promotionHistory)
    ? baselineData.promotionHistory
    : Array.isArray(legacyRawInput.promotionHistory)
      ? legacyRawInput.promotionHistory
      : [];

  return {
    personalData: {
      fullName: typeof personalData.fullName === 'string' ? personalData.fullName : fallbackName,
      employeeId: typeof personalData.employeeId === 'string' ? personalData.employeeId : fallbackEmployeeId,
      academicRank: typeof personalData.academicRank === 'string' ? personalData.academicRank : '',
      yearsInService: readOptionalNumber(personalData.yearsInService),
      highestEducationalAttainment:
        typeof personalData.highestEducationalAttainment === 'string' ? personalData.highestEducationalAttainment : '',
      age: readOptionalNumber(personalData.age),
      sex: typeof personalData.sex === 'string' ? personalData.sex : '',
      civilStatus: typeof personalData.civilStatus === 'string' ? personalData.civilStatus : '',
      department: typeof personalData.department === 'string' ? personalData.department : '',
      nameParts: splitFullName(
        typeof personalData.fullName === 'string' ? personalData.fullName : fallbackName,
      ),
    },
    requestForm: {
      fullName: typeof personalData.fullName === 'string' ? personalData.fullName : fallbackName,
      employeeId: typeof personalData.employeeId === 'string' ? personalData.employeeId : fallbackEmployeeId,
      academicRank: typeof personalData.academicRank === 'string' ? personalData.academicRank : '',
      yearsInService: readOptionalNumber(personalData.yearsInService),
      highestEducationalAttainment:
        typeof personalData.highestEducationalAttainment === 'string' ? personalData.highestEducationalAttainment : '',
      department: typeof personalData.department === 'string' ? personalData.department : '',
      nameParts: splitFullName(
        typeof personalData.fullName === 'string' ? personalData.fullName : fallbackName,
      ),
    },
    promotionHistory,
  };
}

export function extractCycleSubmissionData(profileFeatures: unknown, submissionRawInput: unknown, fallbackSemester: string | null) {
  const featureEnvelope = readJsonObject(profileFeatures);
  const legacyRawInput = readJsonObject(featureEnvelope.rawInput);
  const submission = readJsonObject(submissionRawInput);
  const performanceReview = readJsonObject(
    Object.keys(readJsonObject(submission.performanceReview)).length ? submission.performanceReview : legacyRawInput.performanceReview,
  );

  return {
    performanceReview: {
      reviewPeriod:
        (typeof performanceReview.reviewPeriod === 'string' && performanceReview.reviewPeriod) ||
        fallbackSemester ||
        fixedReviewPeriodLabel,
      ipcrAverage: resolvePerformanceMetricValue(performanceReview, 'ipcrAverage'),
      teachingEffectiveness: resolvePerformanceMetricValue(performanceReview, 'teachingEffectiveness'),
      researchOutputs: resolvePerformanceMetricValue(performanceReview, 'researchOutputs'),
      extensionServices: resolvePerformanceMetricValue(performanceReview, 'extensionServices'),
      administrativeExperience: readOptionalNumber(performanceReview.administrativeExperience),
      professionalDevelopmentHours: readOptionalNumber(performanceReview.professionalDevelopmentHours),
      cycleMetrics: Object.fromEntries(
        reviewCycleMetricKeys.map((metricKey) => [metricKey, extractCycleMetricSummary(performanceReview, metricKey)]),
      ),
    },
    notes:
      typeof submission.notes === 'string'
        ? submission.notes
        : typeof legacyRawInput.notes === 'string'
          ? legacyRawInput.notes
          : '',
  };
}

function buildPromotionDraftSnapshot(
  academicRank: string | null,
  highestEducationalAttainment: string | null,
  promotionHistory: unknown,
  approximateInputs: {
    instruction: number;
    research: number;
    extension: number;
    professionalDevelopment: number;
    ipcrAverage: number;
    coverage: number;
    averagedCompleteness: number;
    uploadedPanelCount: number;
  },
  assessment: EvaluatorAssessmentSnapshot | null,
  trainingStatus: string | null,
): PromotionDraftSnapshot {
  const currentRank = normalizeAcademicRank(academicRank);
  const normalizedAttainment = normalizeAttainment(highestEducationalAttainment);
  const hasDoctoralGraduateBonus = canUseDoctoralGraduateBonus(normalizedAttainment, promotionHistory);
  const hasEvaluatorScore =
    (trainingStatus === 'LABELED' || trainingStatus === 'VALIDATED') &&
    assessment !== null &&
    Number.isFinite(assessment.totalScore);

  if (!currentRank || getAcademicRankIndex(currentRank) < 0) {
    return {
      currentRank,
      suggestedRank: null,
      projectedRank: null,
      evaluatorTotalScore: hasEvaluatorScore ? roundScore(assessment?.totalScore ?? 0) : null,
      weightedScore: null,
      scoreBracket: null,
      subrankIncrements: null,
      basis: hasEvaluatorScore ? 'evaluator' : 'employee-inputs',
      status: 'needs-exact-rank',
      currentRankGroup: null,
      appliedWeightProfile: null,
      pendingRequirement: 'Enter the exact current sub-rank, such as Instructor III or Assistant Professor II.',
      confidence: null,
      note: hasEvaluatorScore
        ? 'Evaluator scoring is available, but the official NBC 461 draft-rank computation still needs an exact current sub-rank.'
        : 'A preliminary rank estimate can appear after you provide an exact current sub-rank, such as Instructor III or Assistant Professor II.',
    };
  }

  const approximateKraTotals = computeApproximateKraTotals(approximateInputs);
  const preliminaryConfidence = derivePreliminaryConfidence(
    approximateInputs.coverage,
    approximateInputs.averagedCompleteness,
    approximateInputs.uploadedPanelCount,
  );

  if (!hasEvaluatorScore) {
    const approximateOutcome = resolveOfficialRankOutcome(
      currentRank,
      approximateKraTotals,
      highestEducationalAttainment,
      hasDoctoralGraduateBonus,
    );
    return {
      currentRank,
      suggestedRank: approximateOutcome.suggestedRank,
      projectedRank: approximateOutcome.projectedRank,
      evaluatorTotalScore: null,
      weightedScore: approximateOutcome.weightedScore,
      scoreBracket: getScoreBracketLabel(approximateOutcome.weightedScore),
      subrankIncrements: approximateOutcome.subrankIncrements,
      basis: 'employee-inputs',
      status: approximateOutcome.status === 'ready' ? 'preliminary' : approximateOutcome.status,
      currentRankGroup: approximateOutcome.rankGroupLabel,
      appliedWeightProfile: approximateOutcome.appliedWeightProfile,
      pendingRequirement: approximateOutcome.pendingRequirement,
      confidence: preliminaryConfidence,
      note: buildPreliminaryRankNote(approximateOutcome.note, preliminaryConfidence),
    };
  }

  const evaluatorTotalScore = roundScore(assessment.totalScore);
  const criterionScores = readNumberRecord(assessment.criterionScores);
  const kraTotals = computeKraTotals(criterionScores);
  const rankOutcome = resolveOfficialRankOutcome(
    currentRank,
    kraTotals,
    highestEducationalAttainment,
    hasDoctoralGraduateBonus,
  );

  return {
    currentRank,
    suggestedRank: rankOutcome.suggestedRank,
    projectedRank: rankOutcome.projectedRank,
    evaluatorTotalScore,
    weightedScore: rankOutcome.weightedScore,
    scoreBracket: getScoreBracketLabel(rankOutcome.weightedScore),
    subrankIncrements: rankOutcome.subrankIncrements,
    basis: 'evaluator',
    status: rankOutcome.status,
    currentRankGroup: rankOutcome.rankGroupLabel,
    appliedWeightProfile: rankOutcome.appliedWeightProfile,
    pendingRequirement: rankOutcome.pendingRequirement,
    confidence: 'high',
    note: `${rankOutcome.note} This evaluator-backed result takes priority over the preliminary employee-side estimate.`,
  };
}

const academicRankLadder = academicRankOptions;

type RankGroupKey = 'instructor' | 'assistant-professor' | 'associate-professor' | 'professor' | 'college-university-professor';

type RankResolution = {
  suggestedRank: string;
  projectedRank: string;
  weightedScore: number;
  subrankIncrements: number;
  status: PromotionDraftSnapshot['status'];
  rankGroupLabel: string;
  appliedWeightProfile: string;
  pendingRequirement: string | null;
  note: string;
};

const rankGroups: Array<{
  key: RankGroupKey;
  label: string;
  ranks: string[];
  weights: { instruction: number; research: number; extension: number; professionalDevelopment: number };
}> = [
  {
    key: 'instructor',
    label: 'Instructor',
    ranks: ['Instructor I', 'Instructor II', 'Instructor III'],
    weights: { instruction: 0.6, research: 0.1, extension: 0.2, professionalDevelopment: 0.1 },
  },
  {
    key: 'assistant-professor',
    label: 'Assistant Professor',
    ranks: ['Assistant Professor I', 'Assistant Professor II', 'Assistant Professor III', 'Assistant Professor IV'],
    weights: { instruction: 0.5, research: 0.2, extension: 0.2, professionalDevelopment: 0.1 },
  },
  {
    key: 'associate-professor',
    label: 'Associate Professor',
    ranks: [
      'Associate Professor I',
      'Associate Professor II',
      'Associate Professor III',
      'Associate Professor IV',
      'Associate Professor V',
    ],
    weights: { instruction: 0.4, research: 0.3, extension: 0.2, professionalDevelopment: 0.1 },
  },
  {
    key: 'professor',
    label: 'Professor',
    ranks: ['Professor I', 'Professor II', 'Professor III', 'Professor IV', 'Professor V', 'Professor VI'],
    weights: { instruction: 0.3, research: 0.4, extension: 0.2, professionalDevelopment: 0.1 },
  },
  {
    key: 'college-university-professor',
    label: 'College/University Professor',
    ranks: ['College/University Professor'],
    weights: { instruction: 0.2, research: 0.5, extension: 0.2, professionalDevelopment: 0.1 },
  },
];

const rankGroupByRank = rankGroups.reduce<Record<string, RankGroupKey>>((groups, group) => {
  for (const rank of group.ranks) {
    groups[rank] = group.key;
  }
  return groups;
}, {});

function computeKraTotals(criterionScores: Record<string, number>) {
  let instruction = 0;
  let research = 0;
  let extension = 0;
  let professionalDevelopment = 0;

  for (const [key, value] of Object.entries(criterionScores)) {
    if (key.startsWith('kra1_')) {
      instruction += value;
      continue;
    }
    if (key.startsWith('kra2_')) {
      research += value;
      continue;
    }
    if (key.startsWith('kra3_')) {
      extension += value;
      continue;
    }
    if (key.startsWith('kra4_')) {
      professionalDevelopment += value;
    }
  }

  return {
    instruction: Math.min(100, roundScore(instruction)),
    research: Math.min(100, roundScore(research)),
    extension: Math.min(100, roundScore(extension)),
    professionalDevelopment: Math.min(100, roundScore(professionalDevelopment)),
  };
}

function computeApproximateKraTotals(inputs: {
  instruction: number;
  research: number;
  extension: number;
  professionalDevelopment: number;
  ipcrAverage: number;
  coverage: number;
  averagedCompleteness: number;
}) {
  const coverageBoost = clampScore(inputs.coverage * 100);
  const completenessBoost = clampScore(inputs.averagedCompleteness * 100);
  const instruction = clampScore(inputs.instruction);
  const research = clampScore(Math.max(inputs.research * 20, coverageBoost * 0.75, completenessBoost * 0.55));
  const extension = clampScore(Math.max(inputs.extension * 20, coverageBoost * 0.7, completenessBoost * 0.5));
  const professionalDevelopment = clampScore(
    Math.max(inputs.professionalDevelopment / 60 * 100, coverageBoost * 0.6, completenessBoost * 0.45),
  );

  return {
    instruction: clampScore(instruction * 0.75 + clampScore(inputs.ipcrAverage * 20) * 0.25),
    research,
    extension,
    professionalDevelopment,
  };
}

function derivePreliminaryConfidence(coverage: number, averagedCompleteness: number, uploadedPanelCount: number) {
  const coveragePct = coverage * 100;
  const completenessPct = averagedCompleteness * 100;

  if (uploadedPanelCount >= 8 && coveragePct >= 60 && completenessPct >= 60) {
    return 'high';
  }
  if (uploadedPanelCount >= 4 && coveragePct >= 30 && completenessPct >= 35) {
    return 'medium';
  }
  return 'low';
}

function buildPreliminaryRankNote(baseNote: string, confidence: 'low' | 'medium' | 'high') {
  const confidenceLabel = confidence.charAt(0).toUpperCase() + confidence.slice(1);
  return `Preliminary estimate from employee inputs and uploaded evidence. Confidence: ${confidenceLabel}. ${baseNote} Evaluator scoring, when available, will strengthen and refine this result.`;
}

function resolveOfficialRankOutcome(
  currentRank: string,
  kraTotals: { instruction: number; research: number; extension: number; professionalDevelopment: number },
  highestEducationalAttainment: string | null,
  hasDoctoralGraduateBonus: boolean,
): RankResolution {
  let activeRank = currentRank;
  let activeGroup = getRankGroup(activeRank);
  let weightedScore = computeWeightedScore(kraTotals, activeGroup.weights);
  let incrementRule = applyRankIncrementRules(
    activeGroup.key,
    getSubrankIncrement(weightedScore),
    hasDoctoralGraduateBonus,
  );
  let subrankIncrements = incrementRule.adjustedIncrements;
  let projectedRank = getRankAfterIncrements(activeRank, subrankIncrements);
  let guard = 0;
  let bonusApplied = incrementRule.bonusApplied;

  while (guard < 8 && rankGroupByRank[projectedRank] !== activeGroup.key) {
    const nextGroup = getNextRankGroup(activeGroup.key);
    if (!nextGroup) {
      break;
    }

    const recomputedScore = computeWeightedScore(kraTotals, nextGroup.weights);
    const recomputedIncrementRule = applyRankIncrementRules(
      nextGroup.key,
      getSubrankIncrement(recomputedScore),
      hasDoctoralGraduateBonus,
    );
    const recomputedIncrements = recomputedIncrementRule.adjustedIncrements;
    const recomputedProjectedRank = getRankAfterIncrements(activeRank, recomputedIncrements);

    if (!isWithinOrBeyondGroup(recomputedProjectedRank, nextGroup.key)) {
      const fallbackRank = activeGroup.ranks[activeGroup.ranks.length - 1];
      return {
        suggestedRank: fallbackRank,
        projectedRank: fallbackRank,
        weightedScore: recomputedScore,
        subrankIncrements: recomputedIncrements,
        status: 'ready',
        rankGroupLabel: activeGroup.label,
        appliedWeightProfile: nextGroup.label,
        pendingRequirement: null,
        note: buildRankResolutionNote(
          `Official ranking was recomputed using ${nextGroup.label} weights. The employee did not qualify for the next rank, so the highest ${activeGroup.label} sub-rank was retained.`,
          recomputedIncrementRule.bonusApplied,
        ),
      };
    }

    activeGroup = nextGroup;
    weightedScore = recomputedScore;
    subrankIncrements = recomputedIncrements;
    projectedRank = recomputedProjectedRank;
    bonusApplied = recomputedIncrementRule.bonusApplied;
    guard += 1;
  }

  const normalizedProjectedRank = projectedRank;
  const normalizedAttainment = normalizeAttainment(highestEducationalAttainment);
  const currentGroupLabel = getRankGroupLabel(currentRank) ?? activeGroup.label;
  const doctoralQualified = hasDoctoralQualification(normalizedAttainment);
  const highestQualifiedRank = getHighestQualifiedRank(currentRank, normalizedAttainment);
  const highestQualifiedRankIndex = getAcademicRankIndex(highestQualifiedRank);
  const projectedRankIndex = getAcademicRankIndex(normalizedProjectedRank);

  if (projectedRankIndex > highestQualifiedRankIndex) {
    return {
      suggestedRank: highestQualifiedRank,
      projectedRank: normalizedProjectedRank,
      weightedScore,
      subrankIncrements,
      status: 'pending-doctoral-attainment',
      rankGroupLabel: currentGroupLabel,
      appliedWeightProfile: activeGroup.label,
      pendingRequirement:
        'Associate Professor and Professor ranks require at least doctorate-level units or a completed doctorate degree.',
      note: buildRankResolutionNote(
        `The weighted KRA result reaches ${normalizedProjectedRank}, but the award is capped at ${highestQualifiedRank} until the faculty member has at least doctorate-level units or a completed doctorate degree.`,
        bonusApplied,
      ),
    };
  }

  if (rankGroupByRank[normalizedProjectedRank] === 'professor' && rankGroupByRank[currentRank] !== 'professor') {
    return {
      suggestedRank: 'Associate Professor V',
      projectedRank: normalizedProjectedRank,
      weightedScore,
      subrankIncrements,
      status: 'pending-professor-accreditation',
      rankGroupLabel: currentGroupLabel,
      appliedWeightProfile: activeGroup.label,
      pendingRequirement: doctoralQualified
        ? 'EAC accreditation is still required before the Professor rank can be awarded for the first time.'
        : 'Professor rank requires doctorate-level units or a completed doctorate degree, plus EAC accreditation.',
      note: buildRankResolutionNote(
        'The employee qualifies for a Professor rank based on the official score, but the award remains pending until EAC accreditation is completed.',
        bonusApplied,
      ),
    };
  }

  if (normalizedProjectedRank === 'College/University Professor') {
    return {
      suggestedRank: 'Professor VI',
      projectedRank: normalizedProjectedRank,
      weightedScore,
      subrankIncrements,
      status: 'pending-cup-certification',
      rankGroupLabel: currentGroupLabel,
      appliedWeightProfile: activeGroup.label,
      pendingRequirement: 'Certification Committee approval is required for College/University Professor.',
      note: buildRankResolutionNote(
        'The computed sub-rank increments reach College/University Professor, but the official award remains pending until Certification Committee approval is completed.',
        bonusApplied,
      ),
    };
  }

  return {
    suggestedRank: normalizedProjectedRank,
    projectedRank: normalizedProjectedRank,
    weightedScore,
    subrankIncrements,
    status: 'ready',
    rankGroupLabel: currentGroupLabel,
    appliedWeightProfile: activeGroup.label,
    pendingRequirement: null,
    note: buildRankResolutionNote(
      'Draft rank is based on the official 2022 NBC 461 weighted score and sub-rank increment rules. Final committee confirmation is still required.',
      bonusApplied,
    ),
  };
}

function computeWeightedScore(
  kraTotals: { instruction: number; research: number; extension: number; professionalDevelopment: number },
  weights: { instruction: number; research: number; extension: number; professionalDevelopment: number },
) {
  return roundScore(
    kraTotals.instruction * weights.instruction +
      kraTotals.research * weights.research +
      kraTotals.extension * weights.extension +
      kraTotals.professionalDevelopment * weights.professionalDevelopment,
  );
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, roundScore(value)));
}

function getSubrankIncrement(score: number) {
  if (score >= 91) return 6;
  if (score >= 81) return 5;
  if (score >= 71) return 4;
  if (score >= 61) return 3;
  if (score >= 51) return 2;
  if (score >= 41) return 1;
  return 0;
}

function applyRankIncrementRules(
  activeGroupKey: RankGroupKey,
  subrankIncrements: number,
  hasDoctoralGraduateBonus: boolean,
) {
  const cappedBaseIncrements = activeGroupKey === 'professor' ? Math.min(subrankIncrements, 1) : subrankIncrements;
  const adjustedIncrements =
    activeGroupKey === 'professor'
      ? Math.min(cappedBaseIncrements + (hasDoctoralGraduateBonus ? 1 : 0), 1)
      : cappedBaseIncrements + (hasDoctoralGraduateBonus ? 1 : 0);

  return {
    adjustedIncrements,
    bonusApplied: hasDoctoralGraduateBonus && adjustedIncrements > cappedBaseIncrements,
  };
}

function getRankAfterIncrements(rank: string, increments: number) {
  const currentIndex = getAcademicRankIndex(rank);
  if (currentIndex < 0) {
    return rank;
  }
  return academicRankLadder[Math.min(currentIndex + increments, academicRankLadder.length - 1)];
}

function isWithinOrBeyondGroup(rank: string, groupKey: RankGroupKey) {
  const group = rankGroups.find((entry) => entry.key === groupKey);
  if (!group) {
    return false;
  }
  return group.ranks.includes(rank) || getAcademicRankIndex(rank) > getAcademicRankIndex(group.ranks[group.ranks.length - 1]);
}

function getRankGroup(rank: string) {
  const groupKey = rankGroupByRank[rank];
  const group = rankGroups.find((entry) => entry.key === groupKey);
  if (!group) {
    throw new Error(`Unknown academic rank group for ${rank}`);
  }
  return group;
}

function getNextRankGroup(groupKey: RankGroupKey) {
  const currentIndex = rankGroups.findIndex((group) => group.key === groupKey);
  return currentIndex >= 0 ? rankGroups[currentIndex + 1] ?? null : null;
}

function getRankGroupLabel(rank: string) {
  const groupKey = rankGroupByRank[rank];
  return rankGroups.find((group) => group.key === groupKey)?.label ?? null;
}

function normalizeAttainment(attainment: string | null) {
  if (!attainment) {
    return 'unknown';
  }

  const normalized = attainment.trim().toLowerCase();
  if (
    /(doctor|doctoral).*(unit|units|candidate|candidacy|ongoing|level)|\bunit(s)?\b.*(doctor|doctoral)|doctoral studies/.test(
      normalized,
    )
  ) {
    return 'doctorate-units';
  }
  if (/ph\.?d|edd|dpa|dba|doctor of|doctoral graduate|doctorate graduate|earned doctoral|completed doctoral|doctorate/.test(normalized)) {
    return 'doctorate-graduate';
  }
  if (/master|mba|ma\b|ms\b|msc|m\.?a|m\.?s/.test(normalized)) {
    return 'masters';
  }
  return 'other';
}

function hasDoctoralQualification(attainment: string) {
  return attainment === 'doctorate-units' || attainment === 'doctorate-graduate';
}

function canUseDoctoralGraduateBonus(attainment: string, promotionHistory: unknown) {
  if (attainment !== 'doctorate-graduate') {
    return false;
  }

  const history = Array.isArray(promotionHistory) ? promotionHistory : [];
  return !history.some((entry) => readJsonObject(entry).promoted === true);
}

function getHighestQualifiedRank(currentRank: string, attainment: string) {
  if (hasDoctoralQualification(attainment)) {
    return 'College/University Professor';
  }

  const highestNonDoctoralRank = 'Assistant Professor IV';
  const currentRankIndex = getAcademicRankIndex(currentRank);
  const highestNonDoctoralRankIndex = getAcademicRankIndex(highestNonDoctoralRank);

  return currentRankIndex > highestNonDoctoralRankIndex ? currentRank : highestNonDoctoralRank;
}

function buildRankResolutionNote(baseNote: string, bonusApplied: boolean) {
  if (!bonusApplied) {
    return baseNote;
  }

  return `${baseNote} A one-time +1 rank adjustment for a doctorate qualification was applied.`;
}

function normalizeAcademicRank(rank: string | null) {
  if (!rank) {
    return null;
  }

  return normalizeAcademicRankOption(rank) ?? rank.trim();
}

function getAcademicRankIndex(rank: string) {
  return academicRankLadder.findIndex((entry) => entry === rank);
}

function getRankFromScore(score: number) {
  const boundedScore = Math.max(0, Math.min(score, 500));
  const ladderIndex = Math.min(Math.floor(boundedScore / 25), academicRankLadder.length - 1);
  return academicRankLadder[ladderIndex];
}

function readJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function readNumberRecord(value: unknown): Record<string, number> {
  const record = readJsonObject(value);
  return Object.entries(record).reduce<Record<string, number>>((numbers, [key, entry]) => {
    const parsed = readOptionalNumber(entry);
    if (parsed !== null) {
      numbers[key] = parsed;
    }
    return numbers;
  }, {});
}

function readOptionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function roundScore(value: number) {
  return Math.round(value * 100) / 100;
}

function resolvePerformanceMetricValue(
  performanceReview: Record<string, unknown>,
  metricKey: (typeof reviewCycleMetricKeys)[number],
) {
  return readOptionalNumber(performanceReview[metricKey]) ?? extractCycleMetricSummary(performanceReview, metricKey)?.average ?? null;
}

function extractCycleMetricSummary(
  performanceReview: Record<string, unknown>,
  metricKey: (typeof reviewCycleMetricKeys)[number],
) {
  const cycleMetrics = readJsonObject(performanceReview.cycleMetrics);
  const metricSummary = readJsonObject(cycleMetrics[metricKey]);
  const sourceEntries = Array.isArray(metricSummary.yearlyEntries) ? metricSummary.yearlyEntries : [];
  const entryMap = new Map(
    sourceEntries.map((entry) => {
      const record = readJsonObject(entry);
      return [typeof record.yearLabel === 'string' ? record.yearLabel : '', record];
    }),
  );

  const yearlyEntries = reviewCycleYearLabels.map((yearLabel) => {
    const entry = readJsonObject(entryMap.get(yearLabel));
    const firstSemester = readOptionalNumber(entry.firstSemester);
    const secondSemester = readOptionalNumber(entry.secondSemester);
    const yearlyAverage =
      readOptionalNumber(entry.yearlyAverage) ?? computeAverage([firstSemester, secondSemester]);

    return {
      yearLabel,
      firstSemester: firstSemester ?? undefined,
      secondSemester: secondSemester ?? undefined,
      yearlyAverage: yearlyAverage ?? undefined,
    };
  });

  const average =
    readOptionalNumber(metricSummary.average) ??
    computeAverage(
      yearlyEntries.flatMap((entry) => [entry.firstSemester ?? null, entry.secondSemester ?? null]),
    );

  const hasValues =
    average !== null ||
    yearlyEntries.some((entry) => entry.firstSemester !== undefined || entry.secondSemester !== undefined);

  if (!hasValues) {
    return null;
  }

  return {
    average: average ?? undefined,
    yearlyEntries,
  };
}

function computeAverage(values: Array<number | null>) {
  const numericValues = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!numericValues.length) {
    return null;
  }

  return roundScore(numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length);
}

function buildWorkbookMirrorSummary(args: {
  rawInput: ReturnType<typeof mergeFacultyRecordInput>;
  semester: string | null;
  highestEducationalAttainment: string | null;
  currentRank: string | null;
  panelScoreByKey: Map<UploadPanelKey, number>;
  panelEvidenceCount: Map<UploadPanelKey, number>;
  approximateKraTotals: { instruction: number; research: number; extension: number; professionalDevelopment: number };
  approximateOutcome: RankResolution | null;
  validatedOutcome: RankResolution | null;
  validatedKraTotals: { instruction: number; research: number; extension: number; professionalDevelopment: number } | null;
  assessment: EvaluatorAssessmentSnapshot | null;
  promotionDraft: PromotionDraftSnapshot;
}): WorkbookSummaryMirror {
  const requestPersonalData = readJsonObject(args.rawInput.personalData);
  const performanceReview = readJsonObject(args.rawInput.performanceReview);
  const nameParts = splitFullName(
    typeof requestPersonalData.fullName === 'string' ? requestPersonalData.fullName : '',
  );
  const sections = groupUploadPanelsByKra();
  const evaluatorCriterionScores = readNumberRecord(args.assessment?.criterionScores);

  const kraSections = sections.map((section) => {
    const criteria = section.panels.map((panel) => {
      const facultyScore = readOptionalNumber(args.panelScoreByKey.get(panel.key));
      const validatedScore = readOptionalNumber(evaluatorCriterionScores[panel.key]);

      return {
        key: panel.key,
        title: panel.title,
        maxScore: panel.maxScore,
        facultyScore,
        validatedScore,
        status: deriveScoreValidationStatus(facultyScore, validatedScore),
        evidenceCount: args.panelEvidenceCount.get(panel.key) ?? 0,
      } satisfies WorkbookCriterionSummary;
    });

    const criteriaFacultyScore = sumNullableScores(criteria.map((criterion) => criterion.facultyScore));
    const criteriaValidatedScore = sumNullableScores(criteria.map((criterion) => criterion.validatedScore));
    const fallbackFacultyScore = args.approximateKraTotals[section.metricKey];
    const fallbackValidatedScore = args.validatedKraTotals?.[section.metricKey] ?? null;

    return {
      title: section.title,
      maxScore: section.maxScore,
      facultyScore: criteriaFacultyScore ?? fallbackFacultyScore,
      validatedScore: criteriaValidatedScore ?? fallbackValidatedScore,
      criteria,
    } satisfies WorkbookKraSummary;
  });

  const facultyScore = args.approximateOutcome?.weightedScore ?? null;
  const validatedScore = args.validatedOutcome?.weightedScore ?? null;
  const comparisonStatus =
    facultyScore !== null && validatedScore !== null
      ? Math.abs(facultyScore - validatedScore) <= 0.01
        ? 'matched'
        : 'needs-review'
      : facultyScore !== null
        ? 'faculty-only'
        : validatedScore !== null
          ? 'validated-only'
          : 'missing';

  return {
    requestForm: {
      fullName: typeof requestPersonalData.fullName === 'string' ? requestPersonalData.fullName : null,
      nameParts,
      employeeId: typeof requestPersonalData.employeeId === 'string' ? requestPersonalData.employeeId : null,
      academicRank: typeof requestPersonalData.academicRank === 'string' ? requestPersonalData.academicRank : null,
      yearsInService: readOptionalNumber(requestPersonalData.yearsInService),
      highestEducationalAttainment:
        typeof requestPersonalData.highestEducationalAttainment === 'string'
          ? requestPersonalData.highestEducationalAttainment
          : args.highestEducationalAttainment,
      reviewPeriod:
        (typeof performanceReview.reviewPeriod === 'string' && performanceReview.reviewPeriod) ||
        args.semester ||
        fixedReviewPeriodLabel,
      department: typeof requestPersonalData.department === 'string' ? requestPersonalData.department : null,
      notes: typeof args.rawInput.notes === 'string' ? args.rawInput.notes : null,
    },
    kraSections,
    summarySheet: {
      facultyScore,
      validatedScore,
      scoreBracket: getScoreBracketLabel(validatedScore ?? facultyScore),
      comparisonStatus,
      currentRank: args.currentRank,
      suggestedRank: args.promotionDraft.suggestedRank,
      projectedRank: args.promotionDraft.projectedRank,
      basis: args.promotionDraft.basis,
    },
  };
}

function groupUploadPanelsByKra() {
  const sections = new Map<
    string,
    {
      title: string;
      metricKey: 'instruction' | 'research' | 'extension' | 'professionalDevelopment';
      maxScore: number;
      panels: Array<(typeof uploadPanels)[number]>;
    }
  >();

  for (const panel of uploadPanels) {
    const existing = sections.get(panel.kraTitle);
    if (existing) {
      existing.panels.push(panel);
      existing.maxScore += panel.maxScore;
      continue;
    }

    sections.set(panel.kraTitle, {
      title: panel.kraTitle,
      metricKey: getKraMetricKey(panel.kraTitle),
      maxScore: panel.maxScore,
      panels: [panel],
    });
  }

  return Array.from(sections.values());
}

function getKraMetricKey(kraTitle: string): 'instruction' | 'research' | 'extension' | 'professionalDevelopment' {
  if (kraTitle.includes('Instruction')) {
    return 'instruction';
  }
  if (kraTitle.includes('Research')) {
    return 'research';
  }
  if (kraTitle.includes('Extension')) {
    return 'extension';
  }
  return 'professionalDevelopment';
}

function deriveScoreValidationStatus(
  facultyScore: number | null,
  validatedScore: number | null,
): WorkbookCriterionSummary['status'] {
  if (facultyScore !== null && validatedScore !== null) {
    return Math.abs(facultyScore - validatedScore) <= 0.01 ? 'matched' : 'needs-review';
  }
  if (facultyScore !== null) {
    return 'faculty-only';
  }
  if (validatedScore !== null) {
    return 'validated-only';
  }
  return 'missing';
}

function sumNullableScores(values: Array<number | null>) {
  const numericValues = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!numericValues.length) {
    return null;
  }

  return roundScore(numericValues.reduce((sum, value) => sum + value, 0));
}

function splitFullName(fullName: string): NameParts {
  const normalized = fullName.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return {
      firstName: null,
      middleName: null,
      lastName: null,
      extensionName: null,
    };
  }

  const commaParts = normalized.split(',').map((part) => part.trim()).filter(Boolean);
  if (commaParts.length >= 2) {
    return splitNameTokens(commaParts[0] ?? null, commaParts.slice(1).join(' '));
  }

  return splitNameTokens(null, normalized);
}

function splitNameTokens(lastName: string | null, value: string): NameParts {
  const tokens = value.split(' ').filter(Boolean);
  let extensionName: string | null = null;
  let workingTokens = [...tokens];

  const extensionCandidate = workingTokens[workingTokens.length - 1];
  if (extensionCandidate && /^(JR\.?|SR\.?|I{1,3}|IV|V|VI)$/i.test(extensionCandidate)) {
    extensionName = extensionCandidate.replace(/\.$/, '');
    workingTokens = workingTokens.slice(0, -1);
  }

  if (lastName) {
    return {
      firstName: workingTokens[0] ?? null,
      middleName: workingTokens.slice(1).join(' ') || null,
      lastName,
      extensionName,
    };
  }

  if (workingTokens.length === 1) {
    return {
      firstName: workingTokens[0] ?? null,
      middleName: null,
      lastName: null,
      extensionName,
    };
  }

  return {
    firstName: workingTokens[0] ?? null,
    middleName: workingTokens.length > 2 ? workingTokens.slice(1, -1).join(' ') || null : null,
    lastName: workingTokens[workingTokens.length - 1] ?? null,
    extensionName,
  };
}

function getBestScore(scores: Record<string, number>, keys: string[]) {
  return keys.reduce((best, key) => {
    const value = readOptionalNumber(scores[key]);
    return value !== null ? Math.max(best, value) : best;
  }, 0);
}

function getScoreBracketLabel(score: number | null) {
  if (score === null) {
    return null;
  }
  if (score >= 91) return '91-100';
  if (score >= 81) return '81-90';
  if (score >= 71) return '71-80';
  if (score >= 61) return '61-70';
  if (score >= 51) return '51-60';
  if (score >= 41) return '41-50';
  return '0-40';
}
