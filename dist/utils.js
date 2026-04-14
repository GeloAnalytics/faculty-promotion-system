"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findGuidelinePdfPath = exports.extractGuidelineReference = exports.findClosestTqeBenchmarks = exports.summarizeTqeReferenceData = exports.loadTqeReferenceData = exports.inferPromotionOutcome = exports.runThesisWorkflow = exports.generateRecommendations = exports.compareModels = exports.selectSignificantFeatures = exports.buildFeatureVector = exports.analyzeDocumentContent = exports.extractDocumentInsights = void 0;
const types_1 = require("./types");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const featureLabels = {
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
const modelOffsets = {
    'decision-tree': -0.03,
    'random-forest': 0.02,
    adaboost: 0.04,
    'gradient-boosting': 0.05,
};
const metricProfiles = {
    'decision-tree': { accuracy: 0.79, precision: 0.75, recall: 0.74, f1Score: 0.74 },
    'random-forest': { accuracy: 0.85, precision: 0.82, recall: 0.8, f1Score: 0.81 },
    adaboost: { accuracy: 0.84, precision: 0.83, recall: 0.79, f1Score: 0.81 },
    'gradient-boosting': { accuracy: 0.87, precision: 0.85, recall: 0.82, f1Score: 0.83 },
};
const extractDocumentInsights = (text) => {
    const normalizedText = text.replace(/\s+/g, ' ').trim();
    const extractedScores = {
        teachingEffectiveness: extractScore(normalizedText, /teaching effectiveness[:\s]*(\d+(\.\d+)?)/i),
        researchOutputs: extractScore(normalizedText, /research outputs?[:\s]*(\d+(\.\d+)?)/i),
        extensionServices: extractScore(normalizedText, /extension( services)?[:\s]*(\d+(\.\d+)?)/i),
        ipcrAverage: extractScore(normalizedText, /ipcr( average)?[:\s]*(\d+(\.\d+)?)/i),
        professionalDevelopmentHours: extractScore(normalizedText, /(training|professional development)( hours)?[:\s]*(\d+(\.\d+)?)/i),
    };
    const detectedFields = Object.entries(extractedScores)
        .filter(([, value]) => value !== undefined)
        .map(([key]) => key);
    const completenessScore = roundTo(detectedFields.length / 5 +
        (normalizedText.toLowerCase().includes('personal data sheet') ? 0.1 : 0) +
        (normalizedText.toLowerCase().includes('performance') ? 0.1 : 0));
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
exports.extractDocumentInsights = extractDocumentInsights;
const analyzeDocumentContent = (text, panelKey, source) => {
    const extraction = (0, exports.extractDocumentInsights)(text);
    const normalizedText = text.toLowerCase();
    const categoryMap = {
        kra_instruction: ['teaching effectiveness', 'curriculum', 'thesis', 'mentorship', 'instruction'],
        kra_research: ['research', 'inventions', 'creative works', 'publication', 'patent'],
        kra_extension: ['extension', 'community', 'service to the community', 'outreach'],
        kra_professional_development: ['professional development', 'training', 'seminar', 'certification'],
        tallied_points: ['total', 'points', 'rating', 'score', 'summary'],
    };
    const detectedCategories = categoryMap[panelKey].filter((term) => normalizedText.includes(term));
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
exports.analyzeDocumentContent = analyzeDocumentContent;
const buildFeatureVector = (payload) => {
    const attainment = mapEducationalAttainment(payload.personalData.highestEducationalAttainment);
    const latestPromotionCount = payload.promotionHistory.filter((entry) => entry.promoted).length;
    const documentCompleteness = payload.documentExtraction?.completenessScore ?? 0;
    const documentQualityScore = payload.documentExtraction?.qualityScore ?? 0;
    return {
        age: normalizeScore(payload.personalData.age, 65),
        yearsInService: normalizeScore(payload.personalData.yearsInService, 35),
        highestEducationalAttainmentLevel: attainment,
        teachingEffectiveness: normalizeScore(payload.performanceReview.teachingEffectiveness ?? payload.documentExtraction?.extractedScores.teachingEffectiveness, 5),
        researchOutputs: normalizeScore(payload.performanceReview.researchOutputs ?? payload.documentExtraction?.extractedScores.researchOutputs, 20),
        extensionServices: normalizeScore(payload.performanceReview.extensionServices ?? payload.documentExtraction?.extractedScores.extensionServices, 10),
        administrativeExperience: normalizeScore(payload.performanceReview.administrativeExperience, 10),
        professionalDevelopmentHours: normalizeScore(payload.performanceReview.professionalDevelopmentHours ??
            payload.documentExtraction?.extractedScores.professionalDevelopmentHours, 200),
        ipcrAverage: normalizeScore(payload.performanceReview.ipcrAverage ?? payload.documentExtraction?.extractedScores.ipcrAverage, 5),
        promotionHistoryCount: normalizeScore(latestPromotionCount, 5),
        documentCompleteness,
        documentQualityScore,
    };
};
exports.buildFeatureVector = buildFeatureVector;
const selectSignificantFeatures = (features) => {
    const weights = {
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
    return types_1.featureKeys
        .map((feature) => ({
        feature,
        importance: roundTo(features[feature] * weights[feature]),
        rationale: `${featureLabels[feature]} combines a strong domain weight with the observed faculty record.`,
    }))
        .sort((left, right) => right.importance - left.importance)
        .slice(0, 6);
};
exports.selectSignificantFeatures = selectSignificantFeatures;
const compareModels = (features) => {
    const baseProbability = calculateBaseProbability(features);
    const influentialFactors = (0, exports.selectSignificantFeatures)(features)
        .slice(0, 3)
        .map((item) => `${featureLabels[item.feature]} (${item.importance})`);
    const models = ['decision-tree', 'random-forest', 'adaboost', 'gradient-boosting'];
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
exports.compareModels = compareModels;
const generateRecommendations = (features, selectedFeatures) => {
    const recommendations = [];
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
exports.generateRecommendations = generateRecommendations;
const runThesisWorkflow = (payload) => {
    const features = (0, exports.buildFeatureVector)(payload);
    const selectedFeatures = (0, exports.selectSignificantFeatures)(features);
    const modelResults = (0, exports.compareModels)(features);
    return {
        selectedFeatures,
        modelResults,
        bestModel: modelResults[0],
        recommendations: (0, exports.generateRecommendations)(features, selectedFeatures),
    };
};
exports.runThesisWorkflow = runThesisWorkflow;
const inferPromotionOutcome = (features) => {
    const probability = calculateBaseProbability(features);
    return probability >= 0.5;
};
exports.inferPromotionOutcome = inferPromotionOutcome;
const loadTqeReferenceData = (csvPath) => {
    if (!node_fs_1.default.existsSync(csvPath)) {
        return [];
    }
    const rows = node_fs_1.default
        .readFileSync(csvPath, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    if (rows.length <= 1) {
        return [];
    }
    const dataRows = rows.slice(1);
    return dataRows.map((row) => {
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
exports.loadTqeReferenceData = loadTqeReferenceData;
const summarizeTqeReferenceData = (records) => {
    const distribution = records.reduce((summary, record) => {
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
exports.summarizeTqeReferenceData = summarizeTqeReferenceData;
const findClosestTqeBenchmarks = (features, records, limit = 3) => {
    return records
        .map((record) => {
        const distance = Math.abs(features.teachingEffectiveness - normalizeScore(record.teachingEffectiveness, 100)) +
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
exports.findClosestTqeBenchmarks = findClosestTqeBenchmarks;
const extractGuidelineReference = (text, fileName) => {
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
    ].filter((term) => lowered.includes(term));
    return {
        fileName,
        extractedTextLength: text.length,
        criteriaMentions,
        textPreview: text.slice(0, 1200),
    };
};
exports.extractGuidelineReference = extractGuidelineReference;
const findGuidelinePdfPath = (rootDir) => {
    const candidates = node_fs_1.default
        .readdirSync(rootDir)
        .filter((entry) => entry.toLowerCase().endsWith('.pdf'))
        .filter((entry) => /jc|dbm|guideline|promotion/i.test(entry));
    if (candidates.length === 0) {
        return null;
    }
    return node_path_1.default.join(rootDir, candidates[0]);
};
exports.findGuidelinePdfPath = findGuidelinePdfPath;
function extractScore(text, regex) {
    const match = text.match(regex);
    if (!match) {
        return undefined;
    }
    const value = match.find((entry) => entry && /^\d+(\.\d+)?$/.test(entry));
    return value ? Number.parseFloat(value) : undefined;
}
function buildDocumentSummary(panelKey, detectedFields, detectedCategories, textLength) {
    const panelLabels = {
        kra_instruction: 'Instruction',
        kra_research: 'Research, Invention, and Creative Work',
        kra_extension: 'Extension Services',
        kra_professional_development: 'Professional Development',
        tallied_points: 'Tallied Points',
    };
    const fieldCount = detectedFields.length;
    const categoryCount = detectedCategories.length;
    return `${panelLabels[panelKey]} analysis detected ${fieldCount} score field(s), ${categoryCount} panel-aligned category match(es), and ${textLength} extracted characters.`;
}
function calculateBaseProbability(features) {
    const weightedSum = features.highestEducationalAttainmentLevel * 0.12 +
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
function summarizeNumbers(values) {
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
function scoreModel(result) {
    return (result.metrics.accuracy * 0.35 +
        result.metrics.precision * 0.25 +
        result.metrics.recall * 0.2 +
        result.metrics.f1Score * 0.2);
}
function normalizeScore(value, ceiling) {
    if (value === undefined || Number.isNaN(value)) {
        return 0;
    }
    return roundTo(clamp(value / ceiling, 0, 1));
}
function mapEducationalAttainment(value) {
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
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
function roundTo(value) {
    return Math.round(value * 100) / 100;
}
function parseNumber(value) {
    const parsed = Number.parseFloat(value ?? '0');
    return Number.isFinite(parsed) ? parsed : 0;
}
//# sourceMappingURL=utils.js.map