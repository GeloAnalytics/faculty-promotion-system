import { uploadPanels } from '../uploadPanels';

type EvaluatorAssessmentSnapshot = {
  totalScore: number;
  criterionScores?: Record<string, number>;
};

type PromotionDraftSnapshot = {
  currentRank: string | null;
  suggestedRank: string | null;
  projectedRank: string | null;
  evaluatorTotalScore: number | null;
  weightedScore: number | null;
  subrankIncrements: number | null;
  basis: 'evaluator' | 'pending-review';
  status: 'ready' | 'pending' | 'needs-exact-rank' | 'pending-professor-accreditation' | 'pending-cup-certification';
  currentRankGroup: string | null;
  appliedWeightProfile: string | null;
  pendingRequirement: string | null;
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
    typeof personalData.highestEducationalAttainment === 'string'
      ? personalData.highestEducationalAttainment
      : null,
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
  highestEducationalAttainment: string | null,
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
      projectedRank: null,
      evaluatorTotalScore: null,
      weightedScore: null,
      subrankIncrements: null,
      basis: 'pending-review',
      status: 'pending',
      currentRankGroup: currentRank ? getRankGroupLabel(currentRank) : null,
      appliedWeightProfile: null,
      pendingRequirement: null,
      note: 'Draft rank will appear after evaluator scoring is completed.',
    };
  }

  if (!currentRank || getAcademicRankIndex(currentRank) < 0) {
    return {
      currentRank,
      suggestedRank: null,
      projectedRank: null,
      evaluatorTotalScore: roundScore(assessment.totalScore),
      weightedScore: null,
      subrankIncrements: null,
      basis: 'evaluator',
      status: 'needs-exact-rank',
      currentRankGroup: null,
      appliedWeightProfile: null,
      pendingRequirement: 'Enter the exact current sub-rank, such as Instructor III or Assistant Professor II.',
      note: 'The official NBC 461 draft-rank computation needs an exact current sub-rank before ranking can be determined.',
    };
  }

  const evaluatorTotalScore = roundScore(assessment.totalScore);
  const criterionScores = readNumberRecord(assessment.criterionScores);
  const kraTotals = computeKraTotals(criterionScores);
  const rankOutcome = resolveOfficialRankOutcome(currentRank, kraTotals, highestEducationalAttainment);

  return {
    currentRank,
    suggestedRank: rankOutcome.suggestedRank,
    projectedRank: rankOutcome.projectedRank,
    evaluatorTotalScore,
    weightedScore: rankOutcome.weightedScore,
    subrankIncrements: rankOutcome.subrankIncrements,
    basis: 'evaluator',
    status: rankOutcome.status,
    currentRankGroup: rankOutcome.rankGroupLabel,
    appliedWeightProfile: rankOutcome.appliedWeightProfile,
    pendingRequirement: rankOutcome.pendingRequirement,
    note: rankOutcome.note,
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

function resolveOfficialRankOutcome(
  currentRank: string,
  kraTotals: { instruction: number; research: number; extension: number; professionalDevelopment: number },
  highestEducationalAttainment: string | null,
): RankResolution {
  let activeRank = currentRank;
  let activeGroup = getRankGroup(activeRank);
  let weightedScore = computeWeightedScore(kraTotals, activeGroup.weights);
  let subrankIncrements = getSubrankIncrement(weightedScore);
  let projectedRank = getRankAfterIncrements(activeRank, subrankIncrements);
  let guard = 0;

  while (guard < 8 && crossesIntoNextRank(activeRank, projectedRank)) {
    const nextGroup = getNextRankGroup(activeGroup.key);
    if (!nextGroup) {
      break;
    }

    const recomputedScore = computeWeightedScore(kraTotals, nextGroup.weights);
    const recomputedIncrements = getSubrankIncrement(recomputedScore);
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
        note: `Official ranking was recomputed using ${nextGroup.label} weights. The employee did not qualify for the next rank, so the highest ${activeGroup.label} sub-rank was retained.`,
      };
    }

    activeGroup = nextGroup;
    weightedScore = recomputedScore;
    subrankIncrements = recomputedIncrements;
    projectedRank = recomputedProjectedRank;
    guard += 1;
  }

  const normalizedProjectedRank = projectedRank;
  const normalizedAttainment = normalizeAttainment(highestEducationalAttainment);
  const currentGroupLabel = getRankGroupLabel(currentRank) ?? activeGroup.label;

  if (rankGroupByRank[normalizedProjectedRank] === 'professor' && rankGroupByRank[currentRank] !== 'professor') {
    if (normalizedAttainment !== 'doctorate') {
      return {
        suggestedRank: 'Associate Professor V',
        projectedRank: normalizedProjectedRank,
        weightedScore,
        subrankIncrements,
        status: 'pending-professor-accreditation',
        rankGroupLabel: currentGroupLabel,
        appliedWeightProfile: activeGroup.label,
        pendingRequirement: 'Professor rank requires an earned doctoral degree and EAC accreditation.',
        note: 'The computed sub-rank increments reach the Professor level, but the employee cannot be awarded a Professor rank without an earned doctoral degree and EAC accreditation.',
      };
    }

    return {
      suggestedRank: 'Associate Professor V',
      projectedRank: normalizedProjectedRank,
      weightedScore,
      subrankIncrements,
      status: 'pending-professor-accreditation',
      rankGroupLabel: currentGroupLabel,
      appliedWeightProfile: activeGroup.label,
      pendingRequirement: 'EAC accreditation is still required before the Professor rank can be awarded for the first time.',
      note: 'The employee qualifies for a Professor rank based on the official score, but the award remains pending until EAC accreditation is completed.',
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
      note: 'The computed sub-rank increments reach College/University Professor, but the official award remains pending until Certification Committee approval is completed.',
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
    note: 'Draft rank is based on the official 2022 NBC 461 weighted score and sub-rank increment rules. Final committee confirmation is still required.',
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

function getSubrankIncrement(score: number) {
  if (score >= 91) return 6;
  if (score >= 81) return 5;
  if (score >= 71) return 4;
  if (score >= 61) return 3;
  if (score >= 51) return 2;
  if (score >= 41) return 1;
  return 0;
}

function getRankAfterIncrements(rank: string, increments: number) {
  const currentIndex = getAcademicRankIndex(rank);
  if (currentIndex < 0) {
    return rank;
  }
  return academicRankLadder[Math.min(currentIndex + increments, academicRankLadder.length - 1)];
}

function crossesIntoNextRank(currentRank: string, projectedRank: string) {
  return rankGroupByRank[currentRank] !== rankGroupByRank[projectedRank];
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
  if (/doctor|ph\.?d|edd|dpa|dba/.test(normalized)) {
    return 'doctorate';
  }
  if (/master|mba|ma\b|ms\b|msc|m\.?a|m\.?s/.test(normalized)) {
    return 'masters';
  }
  return 'other';
}

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
