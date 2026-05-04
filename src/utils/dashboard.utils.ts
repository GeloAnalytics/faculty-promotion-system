import { uploadPanels } from '../uploadPanels';

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
  };
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
