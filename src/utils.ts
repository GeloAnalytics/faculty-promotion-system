import type {
  DocumentAnalysisResult,
  DocumentExtractionResult,
  FacultyIngestionPayload,
  FeatureKey,
  FeatureSelectionResult,
  FeatureVector,
  GuidelineReference,
  ModelComparisonResult,
  ModelMetrics,
  NumericSummary,
  Recommendation,
  SupportedModel,
  ThesisWorkflowResult,
  TqeBenchmarkMatch,
  TqeRecord,
  TqeReferenceSummary,
  UploadPanelKey,
} from './types';
import { featureKeys } from './types';
import { uploadPanelKeywordMap, uploadPanelLabelMap } from './uploadPanels';
import { uploadPanels } from './uploadPanels';
import fs from 'node:fs';
import path from 'node:path';

const featureLabels: Record<FeatureKey, string> = {
  age: 'Age and career maturity',
  yearsInService: 'Years in service',
  highestEducationalAttainmentLevel: 'Highest educational attainment',
  teachingEffectiveness: 'Teaching effectiveness',
  researchOutputs: 'Research outputs',
  extensionServices: 'Extension and community service',
  administrativeExperience: 'Administrative experience',
  professionalDevelopmentHours: 'Professional development hours',
  ipcrAverage: 'IPCR average',
  promotionHistoryCount: 'Promotion history count',
  documentCompleteness: 'Document completeness',
  documentQualityScore: 'Document quality score',
};

const modelOffsets: Record<SupportedModel, number> = {
  'decision-tree': -0.03,
  'random-forest': 0.02,
  adaboost: 0.04,
  'gradient-boosting': 0.05,
};

const metricProfiles: Record<SupportedModel, ModelMetrics> = {
  'decision-tree': { accuracy: 0.79, precision: 0.75, recall: 0.74, f1Score: 0.74 },
  'random-forest': { accuracy: 0.85, precision: 0.82, recall: 0.8, f1Score: 0.81 },
  adaboost: { accuracy: 0.84, precision: 0.83, recall: 0.79, f1Score: 0.81 },
  'gradient-boosting': { accuracy: 0.87, precision: 0.85, recall: 0.82, f1Score: 0.83 },
};

export const extractDocumentInsights = (text: string): DocumentExtractionResult => {
  const normalizedText = text.replace(/\s+/g, ' ').trim();
  const extractedScores: Record<string, number> = {};
  const coreScorePatterns: Array<[string, RegExp]> = [
    ['teachingEffectiveness', /teaching effectiveness[:\s]*(\d+(\.\d+)?)/i],
    ['researchOutputs', /research outputs?[:\s]*(\d+(\.\d+)?)/i],
    ['extensionServices', /extension( services)?[:\s]*(\d+(\.\d+)?)/i],
    ['ipcrAverage', /ipcr( average)?[:\s]*(\d+(\.\d+)?)/i],
    ['professionalDevelopmentHours', /(training|professional development)( hours)?[:\s]*(\d+(\.\d+)?)/i],
  ];

  for (const [key, pattern] of coreScorePatterns) {
    const score = extractScore(normalizedText, pattern);
    if (score !== undefined) {
      extractedScores[key] = score;
    }
  }

  const criterionScores = extractCriterionScores(normalizedText);
  for (const [key, value] of Object.entries(criterionScores)) {
    extractedScores[key] = value;
  }

  const detectedFields = Object.entries(extractedScores)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);

  const completenessScore = roundTo(
    detectedFields.length / 5 +
      (normalizedText.toLowerCase().includes('personal data sheet') ? 0.1 : 0) +
      (normalizedText.toLowerCase().includes('performance') ? 0.1 : 0),
  );

  const qualityScore = roundTo(Math.min(1, normalizedText.length / 5000 + detectedFields.length * 0.08));

  return {
    source: 'pdf',
    textLength: normalizedText.length,
    detectedFields,
    completenessScore,
    qualityScore,
    extractedScores,
  };
};

export const analyzeDocumentContent = (
  text: string,
  panelKey: UploadPanelKey,
  source: DocumentAnalysisResult['source'],
): DocumentAnalysisResult => {
  const extraction = extractDocumentInsights(text);
  const normalizedText = text.toLowerCase();

  const detectedCategories = uploadPanelKeywordMap[panelKey].filter((term) => normalizedText.includes(term));
  const keywordHits = [
    'teaching effectiveness',
    'curriculum',
    'research outputs',
    'inventions',
    'creative works',
    'service to the institution',
    'service to the community',
    'extension',
    'professional development',
    'ipcr',
  ].filter((term) => normalizedText.includes(term));

  const summary = buildDocumentSummary(panelKey, extraction.detectedFields, detectedCategories, extraction.textLength);

  return {
    source,
    panelKey,
    textLength: extraction.textLength,
    completenessScore: extraction.completenessScore,
    qualityScore: extraction.qualityScore,
    extractedScores: extraction.extractedScores,
    detectedFields: extraction.detectedFields,
    detectedCategories,
    keywordHits,
    summary,
  };
};

export function inferBestUploadPanelKey(text: string, fallback: UploadPanelKey = 'kra1_teaching_effectiveness') {
  const normalizedText = text.toLowerCase();
  let bestPanelKey = fallback;
  let bestScore = -1;

  for (const [panelKey, keywords] of Object.entries(uploadPanelKeywordMap) as Array<[UploadPanelKey, string[]]>) {
    let score = 0;
    for (const keyword of keywords) {
      if (normalizedText.includes(keyword.toLowerCase())) {
        score += 1;
      }
    }

    const label = uploadPanelLabelMap[panelKey].toLowerCase();
    if (normalizedText.includes(label)) {
      score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      bestPanelKey = panelKey;
    }
  }

  return bestScore > 0 ? bestPanelKey : fallback;
}

export const buildFeatureVector = (payload: FacultyIngestionPayload): FeatureVector => {
  const attainment = mapEducationalAttainment(payload.personalData.highestEducationalAttainment);
  const latestPromotionCount = payload.promotionHistory.filter((entry) => entry.promoted).length;
  const documentCompleteness = payload.documentExtraction?.completenessScore ?? 0;
  const documentQualityScore = payload.documentExtraction?.qualityScore ?? 0;

  return {
    age: normalizeScore(payload.personalData.age, 65),
    yearsInService: normalizeScore(payload.personalData.yearsInService, 35),
    highestEducationalAttainmentLevel: attainment,
    teachingEffectiveness: normalizeScore(
      payload.performanceReview.teachingEffectiveness ?? payload.documentExtraction?.extractedScores.teachingEffectiveness,
      5,
    ),
    researchOutputs: normalizeScore(
      payload.performanceReview.researchOutputs ?? payload.documentExtraction?.extractedScores.researchOutputs,
      20,
    ),
    extensionServices: normalizeScore(
      payload.performanceReview.extensionServices ?? payload.documentExtraction?.extractedScores.extensionServices,
      10,
    ),
    administrativeExperience: normalizeScore(payload.performanceReview.administrativeExperience, 10),
    professionalDevelopmentHours: normalizeScore(
      payload.performanceReview.professionalDevelopmentHours ??
        payload.documentExtraction?.extractedScores.professionalDevelopmentHours,
      200,
    ),
    ipcrAverage: normalizeScore(
      payload.performanceReview.ipcrAverage ?? payload.documentExtraction?.extractedScores.ipcrAverage,
      5,
    ),
    promotionHistoryCount: normalizeScore(latestPromotionCount, 5),
    documentCompleteness,
    documentQualityScore,
  };
};

export const selectSignificantFeatures = (features: FeatureVector): FeatureSelectionResult[] => {
  const weights: Record<FeatureKey, number> = {
    age: 0.45,
    yearsInService: 0.62,
    highestEducationalAttainmentLevel: 0.83,
    teachingEffectiveness: 0.88,
    researchOutputs: 0.91,
    extensionServices: 0.66,
    administrativeExperience: 0.58,
    professionalDevelopmentHours: 0.69,
    ipcrAverage: 0.93,
    promotionHistoryCount: 0.55,
    documentCompleteness: 0.5,
    documentQualityScore: 0.47,
  };

  return featureKeys
    .map((feature) => ({
      feature,
      importance: roundTo(features[feature] * weights[feature]),
      rationale: `${featureLabels[feature]} combines a strong domain weight with the observed faculty record.`,
    }))
    .sort((left, right) => right.importance - left.importance)
    .slice(0, 6);
};

export const compareModels = (features: FeatureVector): ModelComparisonResult[] => {
  const baseProbability = calculateBaseProbability(features);
  const influentialFactors = selectSignificantFeatures(features)
    .slice(0, 3)
    .map((item) => `${featureLabels[item.feature]} (${item.importance})`);

  const models: SupportedModel[] = ['decision-tree', 'random-forest', 'adaboost', 'gradient-boosting'];

  return models
    .map((model) => {
      const promotionProbability = clamp(baseProbability + modelOffsets[model], 0.05, 0.99);
      return {
        model,
        metrics: metricProfiles[model],
        promotionProbability: roundTo(promotionProbability),
        predictedPromotion: promotionProbability >= 0.5,
        keyFactors: influentialFactors,
      };
    })
    .sort((left, right) => scoreModel(right) - scoreModel(left));
};

export const generateRecommendations = (
  features: FeatureVector,
  selectedFeatures: FeatureSelectionResult[],
): Recommendation[] => {
  const recommendations: Recommendation[] = [];

  if (features.documentCompleteness < 0.7 || features.documentQualityScore < 0.7) {
    recommendations.push({
      area: 'data-quality',
      recommendation: 'Standardize PDS and performance-review digitization before model scoring.',
      evidence: 'Document completeness and quality are below the threshold needed for reliable predictions.',
    });
  }

  if (features.researchOutputs < 0.55 || features.professionalDevelopmentHours < 0.5) {
    recommendations.push({
      area: 'faculty-development',
      recommendation: 'Prioritize research mentoring and development programs for promotion candidates.',
      evidence: 'Research output and professional development features are weaker than the strongest promotion signals.',
    });
  }

  if (selectedFeatures.some((item) => item.feature === 'ipcrAverage')) {
    recommendations.push({
      area: 'review-process',
      recommendation: 'Audit IPCR scoring consistency across units to reduce subjectivity in promotion decisions.',
      evidence: 'IPCR average is one of the most influential features in the current predictive workflow.',
    });
  }

  recommendations.push({
    area: 'policy',
    recommendation: 'Use the model output as decision support and publish the criteria used for promotion reviews.',
    evidence: 'The thesis emphasizes transparency, fairness, and actionable policy improvement rather than full automation.',
  });

  return recommendations;
};

export const runThesisWorkflow = (payload: FacultyIngestionPayload): ThesisWorkflowResult => {
  const features = buildFeatureVector(payload);
  const selectedFeatures = selectSignificantFeatures(features);
  const modelResults = compareModels(features);

  return {
    selectedFeatures,
    modelResults,
    bestModel: modelResults[0],
    recommendations: generateRecommendations(features, selectedFeatures),
  };
};

export const inferPromotionOutcome = (features: FeatureVector): boolean => {
  const probability = calculateBaseProbability(features);
  return probability >= 0.5;
};

export const loadTqeReferenceData = (csvPath: string): TqeRecord[] => {
  if (!fs.existsSync(csvPath)) {
    return [];
  }

  const rows = fs
    .readFileSync(csvPath, 'utf8')
    .split(/\r?\n/)
    .map((line: string) => line.trim())
    .filter(Boolean);

  if (rows.length <= 1) {
    return [];
  }

  const dataRows = rows.slice(1);

  return dataRows.map((row: string) => {
    const values = row.split(',');

    return {
      teacherId: values[0] ?? '',
      courseId: values[1] ?? '',
      semester: values[2] ?? '',
      teachingEffectiveness: parseNumber(values[3]),
      curriculumDevelopment: parseNumber(values[4]),
      thesisMentorship: parseNumber(values[5]),
      researchOutputs: parseNumber(values[6]),
      inventions: parseNumber(values[7]),
      creativeWorks: parseNumber(values[8]),
      serviceInstitution: parseNumber(values[9]),
      serviceCommunity: parseNumber(values[10]),
      extensionInvolvement: parseNumber(values[11]),
      professionalDevelopment: parseNumber(values[12]),
      teachingQuality: values[13] ?? '',
    };
  });
};

export const summarizeTqeReferenceData = (records: TqeRecord[]): TqeReferenceSummary => {
  const distribution = records.reduce<Record<string, number>>((summary, record) => {
    summary[record.teachingQuality] = (summary[record.teachingQuality] ?? 0) + 1;
    return summary;
  }, {});

  return {
    rowCount: records.length,
    teachingQualityDistribution: distribution,
    numericSummaries: {
      teachingEffectiveness: summarizeNumbers(records.map((record) => record.teachingEffectiveness)),
      curriculumDevelopment: summarizeNumbers(records.map((record) => record.curriculumDevelopment)),
      thesisMentorship: summarizeNumbers(records.map((record) => record.thesisMentorship)),
      researchOutputs: summarizeNumbers(records.map((record) => record.researchOutputs)),
      inventions: summarizeNumbers(records.map((record) => record.inventions)),
      creativeWorks: summarizeNumbers(records.map((record) => record.creativeWorks)),
      serviceInstitution: summarizeNumbers(records.map((record) => record.serviceInstitution)),
      serviceCommunity: summarizeNumbers(records.map((record) => record.serviceCommunity)),
      extensionInvolvement: summarizeNumbers(records.map((record) => record.extensionInvolvement)),
      professionalDevelopment: summarizeNumbers(records.map((record) => record.professionalDevelopment)),
    },
  };
};

export const findClosestTqeBenchmarks = (
  features: FeatureVector,
  records: TqeRecord[],
  limit = 3,
): TqeBenchmarkMatch[] => {
  return records
    .map((record) => {
      const distance =
        Math.abs(features.teachingEffectiveness - normalizeScore(record.teachingEffectiveness, 100)) +
        Math.abs(features.researchOutputs - normalizeScore(record.researchOutputs, 20)) +
        Math.abs(features.extensionServices - normalizeScore(record.extensionInvolvement, 10)) +
        Math.abs(features.professionalDevelopmentHours - normalizeScore(record.professionalDevelopment, 200));

      return {
        teacherId: record.teacherId,
        courseId: record.courseId,
        semester: record.semester,
        teachingQuality: record.teachingQuality,
        distance: roundTo(distance),
      };
    })
    .sort((left, right) => left.distance - right.distance)
    .slice(0, limit);
};

export const extractGuidelineReference = (text: string, fileName: string): GuidelineReference => {
  const lowered = text.toLowerCase();
  const criteriaMentions = [
    'teaching effectiveness',
    'research outputs',
    'extension',
    'professional development',
    'service to the institution',
    'service to the community',
    'creative works',
    'inventions',
  ].filter((term: string) => lowered.includes(term));

  return {
    fileName,
    extractedTextLength: text.length,
    criteriaMentions,
    textPreview: text.slice(0, 1200),
  };
};

export const findGuidelinePdfPath = (rootDir: string): string | null => {
  const candidates = fs
    .readdirSync(rootDir)
    .filter((entry: string) => entry.toLowerCase().endsWith('.pdf'))
    .filter((entry: string) => /jc|dbm|guideline|promotion/i.test(entry));

  if (candidates.length === 0) {
    return null;
  }

  return path.join(rootDir, candidates[0]);
};

function extractScore(text: string, regex: RegExp): number | undefined {
  const match = text.match(regex);
  if (!match) {
    return undefined;
  }

  const value = match.find((entry: string | undefined) => entry && /^\d+(\.\d+)?$/.test(entry));

  return value ? Number.parseFloat(value) : undefined;
}

function buildDocumentSummary(
  panelKey: UploadPanelKey,
  detectedFields: string[],
  detectedCategories: string[],
  textLength: number,
): string {
  const fieldCount = detectedFields.length;
  const categoryCount = detectedCategories.length;

  return `${uploadPanelLabelMap[panelKey]} analysis detected ${fieldCount} score field(s), ${categoryCount} panel-aligned category match(es), and ${textLength} extracted characters.`;
}

function extractCriterionScores(text: string): Record<string, number> {
  return uploadPanels.reduce<Record<string, number>>((scores, panel) => {
    const patterns = buildCriterionScorePatterns(panel.title, panel.kraTitle, panel.description);
    for (const pattern of patterns) {
      const value = extractScore(text, pattern);
      if (value !== undefined) {
        scores[panel.key] = value;
        break;
      }
    }
    return scores;
  }, {});
}

function buildCriterionScorePatterns(title: string, kraTitle: string, description: string) {
  const tokens = [title, kraTitle, description]
    .flatMap((value) => value.split(/[\s,/-]+/g))
    .map((value) => value.trim())
    .filter(Boolean);
  const escapedTitle = escapeRegex(title);
  const escapedKra = escapeRegex(kraTitle);
  const tokenPattern = tokens
    .slice(0, 6)
    .map((token) => escapeRegex(token))
    .join('|');
  const patterns = [
    new RegExp(`${escapedTitle}[\\s\\S]{0,70}?(\\d+(?:\\.\\d+)?)`, 'i'),
    new RegExp(`${escapedKra}[\\s\\S]{0,70}?(\\d+(?:\\.\\d+)?)`, 'i'),
  ];

  if (tokenPattern) {
    patterns.push(new RegExp(`(?:${tokenPattern})[\\s\\S]{0,70}?(\\d+(?:\\.\\d+)?)`, 'i'));
  }

  return patterns;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function calculateBaseProbability(features: FeatureVector): number {
  const weightedSum =
    features.highestEducationalAttainmentLevel * 0.12 +
    features.teachingEffectiveness * 0.16 +
    features.researchOutputs * 0.18 +
    features.extensionServices * 0.09 +
    features.administrativeExperience * 0.07 +
    features.professionalDevelopmentHours * 0.09 +
    features.ipcrAverage * 0.2 +
    features.yearsInService * 0.04 +
    features.promotionHistoryCount * 0.03 +
    features.documentCompleteness * 0.01 +
    features.documentQualityScore * 0.01;

  return roundTo(weightedSum);
}

function summarizeNumbers(values: number[]): NumericSummary {
  if (values.length === 0) {
    return { min: 0, max: 0, average: 0 };
  }

  const total = values.reduce((sum, value) => sum + value, 0);

  return {
    min: roundTo(Math.min(...values)),
    max: roundTo(Math.max(...values)),
    average: roundTo(total / values.length),
  };
}

function scoreModel(result: ModelComparisonResult): number {
  return (
    result.metrics.accuracy * 0.35 +
    result.metrics.precision * 0.25 +
    result.metrics.recall * 0.2 +
    result.metrics.f1Score * 0.2
  );
}

function normalizeScore(value: number | undefined, ceiling: number): number {
  if (value === undefined || Number.isNaN(value)) {
    return 0;
  }

  return roundTo(clamp(value / ceiling, 0, 1));
}

function mapEducationalAttainment(value: string | undefined): number {
  const normalizedValue = value?.toLowerCase() ?? '';

  if (normalizedValue.includes('doctor')) {
    return 1;
  }

  if (normalizedValue.includes('master')) {
    return 0.75;
  }

  if (normalizedValue.includes('bachelor')) {
    return 0.45;
  }

  return 0.2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundTo(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseNumber(value: string | undefined): number {
  const parsed = Number.parseFloat(value ?? '0');
  return Number.isFinite(parsed) ? parsed : 0;
}
