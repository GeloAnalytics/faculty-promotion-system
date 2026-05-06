import { uploadPanels } from '../uploadPanels';

type EvaluatorAssessmentSnapshot = {
  totalScore: number;
};

type PromotionDraftSnapshot = {
  currentRank: string | null;
  suggestedRank: string | null;
  evaluatorTotalScore: number | null;
  basis: 'evaluator' | 'pending-review';
  status: 'ready' | 'pending';
  note: string;
};

type ParsedDocumentMetadata = {
  panelKey: string | null;
  panelTitle: string | null;
  analysisSummary: string | null;
  extractedScores: Record<string, number>;
  completenessScore: number | null;
  qualityScore: number | null;
  linkage: string | null;
};

export function summarizeDocumentMetadata(value: unknown): ParsedDocumentMetadata {
  const metadata = readJsonObject(value);
  const analysis = readJsonObject(metadata.analysis);
  const extractedScores = readNumberRecord(analysis.extractedScores);
  const linkage = readJsonObject(metadata.linkage);

  return {
    panelKey: typeof metadata.panelKey === 'string' ? metadata.panelKey : null,
    panelTitle: typeof metadata.panelTitle === 'string' ? metadata.panelTitle : null,
    analysisSummary: typeof analysis.summary === 'string' ? analysis.summary : null,
    extractedScores,
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
) {
  const featureEnvelope = readJsonObject(profile?.features);
  const rawInput = readJsonObject(featureEnvelope.rawInput);
  const personalData = readJsonObject(rawInput.personalData);
  const performanceReview = readJsonObject(rawInput.performanceReview);
  const uploadedPanels = new Set<string>();

  let instruction = readOptionalNumber(performanceReview.teachingEffectiveness) ?? 0;
  let research = readOptionalNumber(performanceReview.researchOutputs) ?? 0;
  let extension = readOptionalNumber(performanceReview.extensionServices) ?? 0;
  let professionalDevelopment = readOptionalNumber(performanceReview.professionalDevelopmentHours) ?? 0;
  let ipcrAverage = readOptionalNumber(performanceReview.ipcrAverage) ?? 0;
  let completenessTotal = 0;
  let completenessSamples = 0;

  for (const document of documents) {
    const metadata = summarizeDocumentMetadata(document.extractionMetadata);
    if (metadata.panelKey) {
      uploadedPanels.add(metadata.panelKey);
    }
    if (metadata.completenessScore !== null) {
      completenessTotal += metadata.completenessScore;
      completenessSamples += 1;
    }
    instruction = Math.max(instruction, metadata.extractedScores.teachingEffectiveness ?? 0);
    research = Math.max(research, metadata.extractedScores.researchOutputs ?? 0);
    extension = Math.max(extension, metadata.extractedScores.extensionServices ?? 0);
    professionalDevelopment = Math.max(
      professionalDevelopment,
      metadata.extractedScores.professionalDevelopmentHours ?? 0,
    );
    ipcrAverage = Math.max(ipcrAverage, metadata.extractedScores.ipcrAverage ?? 0);
  }

  const coverage = uploadPanels.length ? uploadedPanels.size / uploadPanels.length : 0;
  const averagedCompleteness = completenessSamples ? completenessTotal / completenessSamples : 0;
  const overallEstimate = instruction + research + extension + professionalDevelopment + ipcrAverage;
  const promotionDraft = buildPromotionDraftSnapshot(
    typeof personalData.academicRank === 'string' ? personalData.academicRank : null,
    latestEvaluation?.assessment ?? null,
    latestEvaluation?.status ?? null,
  );

  return {
    note: 'Approximate estimate only. Evaluator review is still required for the official score.',
    facultyName: typeof personalData.fullName === 'string' ? personalData.fullName : null,
    semester: profile?.semester ?? null,
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
  };
}

function buildPromotionDraftSnapshot(
  academicRank: string | null,
  assessment: EvaluatorAssessmentSnapshot | null,
  trainingStatus: string | null,
): PromotionDraftSnapshot {
  const currentRank = normalizeAcademicRank(academicRank);
  const hasEvaluatorScore =
    (trainingStatus === 'LABELED' || trainingStatus === 'VALIDATED') &&
    assessment !== null &&
    Number.isFinite(assessment.totalScore);

  if (!hasEvaluatorScore) {
    return {
      currentRank,
      suggestedRank: null,
      evaluatorTotalScore: null,
      basis: 'pending-review',
      status: 'pending',
      note: 'Draft rank will appear after evaluator scoring is completed.',
    };
  }

  const evaluatorTotalScore = roundScore(assessment.totalScore);
  const scoreBasedRank = getRankFromScore(evaluatorTotalScore);
  const currentRankIndex = currentRank ? getAcademicRankIndex(currentRank) : null;
  const scoreRankIndex = getAcademicRankIndex(scoreBasedRank);
  const suggestedRank =
    currentRankIndex !== null && scoreRankIndex < currentRankIndex ? currentRank : scoreBasedRank;

  return {
    currentRank,
    suggestedRank,
    evaluatorTotalScore,
    basis: 'evaluator',
    status: 'ready',
    note: 'Draft rank is based on the latest evaluator-scored total and should still undergo committee confirmation.',
  };
}

const academicRankLadder = [
  'Instructor I',
  'Instructor II',
  'Instructor III',
  'Assistant Professor I',
  'Assistant Professor II',
  'Assistant Professor III',
  'Assistant Professor IV',
  'Associate Professor I',
  'Associate Professor II',
  'Associate Professor III',
  'Associate Professor IV',
  'Associate Professor V',
  'Professor I',
  'Professor II',
  'Professor III',
  'Professor IV',
  'Professor V',
  'Professor VI',
];

const academicRankAliases = academicRankLadder.reduce<Record<string, string>>((aliases, rank) => {
  aliases[normalizeRankKey(rank)] = rank;
  aliases[normalizeRankKey(rank.replace(/\bI\b/g, '1').replace(/\bII\b/g, '2').replace(/\bIII\b/g, '3').replace(/\bIV\b/g, '4').replace(/\bV\b/g, '5').replace(/\bVI\b/g, '6'))] = rank;
  return aliases;
}, {});

function normalizeAcademicRank(rank: string | null) {
  if (!rank) {
    return null;
  }

  return academicRankAliases[normalizeRankKey(rank)] ?? rank.trim();
}

function normalizeRankKey(rank: string) {
  return rank.trim().toLowerCase().replace(/\s+/g, ' ');
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
