"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findGuidelinePdfPath = exports.extractGuidelineReference = exports.findClosestTqeBenchmarks = exports.summarizeTqeReferenceData = exports.loadTqeReferenceData = exports.inferPromotionOutcome = exports.generateRecommendations = exports.compareModels = exports.selectSignificantFeatures = exports.analyzeDocumentContent = exports.extractDocumentInsights = void 0;
exports.inferBestUploadPanelKey = inferBestUploadPanelKey;
const types_1 = require("./types");
const uploadPanels_1 = require("./uploadPanels");
const uploadPanels_2 = require("./uploadPanels");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const evidenceRules_1 = require("./utils/evidenceRules");
function extractAllEvidenceKeywords(rules) {
    const keywords = new Set();
    function traverse(rule) {
        if (typeof rule === 'string') {
            keywords.add(rule.toLowerCase());
        }
        else {
            rule.conditions.forEach(traverse);
        }
    }
    for (const rule of Object.values(rules)) {
        traverse(rule);
    }
    return Array.from(keywords);
}
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
    const extractedScores = {};
    const coreScorePatterns = [
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
    const detectedCategories = uploadPanels_1.uploadPanelKeywordMap[panelKey].filter((term) => normalizedText.includes(term));
    const evidenceKeywords = extractAllEvidenceKeywords(evidenceRules_1.evidenceRules);
    const baseKeywords = [
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
    ];
    const allKeywords = Array.from(new Set([...baseKeywords, ...evidenceKeywords]));
    const keywordHits = allKeywords.filter((term) => normalizedText.includes(term));
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
function inferBestUploadPanelKey(text, fallback = 'kra1_teaching_effectiveness') {
    const normalizedText = text.toLowerCase();
    let bestPanelKey = fallback;
    let bestScore = -1;
    for (const [panelKey, keywords] of Object.entries(uploadPanels_1.uploadPanelKeywordMap)) {
        let score = 0;
        for (const keyword of keywords) {
            if (normalizedText.includes(keyword.toLowerCase())) {
                score += 1;
            }
        }
        const label = uploadPanels_1.uploadPanelLabelMap[panelKey].toLowerCase();
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
// Score patterns match "<label>...<number within ~70 chars>", which also
// happily grabs the nearest date, page number, or ID in scanned evaluation
// forms (e.g. "Research Advising and Mentorship Services ... 2021" from
// an "A.Y. 2020-2021" header). Anything that reads as a bare calendar year,
// or is implausibly large for any real KRA score/hour count, is almost
// certainly not the score field and is rejected rather than propagated as a
// detected score.
const MAX_PLAUSIBLE_EXTRACTED_SCORE = 999;
const CALENDAR_YEAR_PATTERN = /^(19|20)\d{2}$/;
// Catches the day-of-month in "Date: June 11, 2020" or "11/2020" immediately
// after a matched number - a bare calendar year is rejected above, but the day
// right before it slips through unless we also check what follows the match.
const TRAILING_DATE_PATTERN = /^\s*[,/-]?\s*(19|20)\d{2}\b/;
function extractScore(text, regex) {
    const match = text.match(regex);
    if (!match || match.index === undefined) {
        return undefined;
    }
    const value = match.find((entry) => entry && /^\d+(\.\d+)?$/.test(entry));
    if (!value) {
        return undefined;
    }
    if (CALENDAR_YEAR_PATTERN.test(value)) {
        return undefined;
    }
    const matchEnd = match.index + match[0].length;
    if (TRAILING_DATE_PATTERN.test(text.slice(matchEnd, matchEnd + 8))) {
        return undefined;
    }
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed) || parsed > MAX_PLAUSIBLE_EXTRACTED_SCORE) {
        return undefined;
    }
    return parsed;
}
function buildDocumentSummary(panelKey, detectedFields, detectedCategories, textLength) {
    const fieldCount = detectedFields.length;
    const categoryCount = detectedCategories.length;
    return `${uploadPanels_1.uploadPanelLabelMap[panelKey]} analysis detected ${fieldCount} score field(s), ${categoryCount} panel-aligned category match(es), and ${textLength} extracted characters.`;
}
function extractCriterionScores(text) {
    return uploadPanels_2.uploadPanels.reduce((scores, panel) => {
        const patterns = buildCriterionScorePatterns(panel.title, panel.kraTitle);
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
function buildCriterionScorePatterns(title, kraTitle) {
    // Deliberately anchored to the full panel title / KRA heading only - not
    // individual words from them. An earlier version also matched on the first
    // few tokens of title/kraTitle/description individually, but those tokens
    // are often generic words ("and", "development", "services") that show up
    // incidentally anywhere in a document. In production this matched a thesis
    // approval sheet's internal control number ("Control No. gsinfo-(MP)-26-00S")
    // as the "detected score" for an unrelated KRA panel, because a generic
    // word from that panel's description happened to appear within 70 chars of
    // the number "26" - fabricating a plausible-looking but meaningless score
    // that then outranked the more honest evidence-checklist estimate. The full
    // multi-word title/kraTitle phrases are official form section headers and
    // don't have that problem.
    const escapedTitle = escapeRegex(title);
    const escapedKra = escapeRegex(kraTitle);
    return [
        new RegExp(`${escapedTitle}[\\s\\S]{0,70}?(\\d+(?:\\.\\d+)?)`, 'i'),
        new RegExp(`${escapedKra}[\\s\\S]{0,70}?(\\d+(?:\\.\\d+)?)`, 'i'),
    ];
}
function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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