import fs from 'node:fs';
import { promotionModelPath, modelComparisonPath } from '../config/globals';
import { academicRankOptions } from '../constants/faculty';
import type { buildDraftPointSummary } from '../utils/dashboard.utils';

type DraftPointSummary = ReturnType<typeof buildDraftPointSummary>;

/**
 * Loads and evaluates the trained promotion-prediction model.
 *
 * The model is trained offline in Python (scripts/ml/train_models.py) on a synthetic,
 * policy-grounded dataset (scripts/ml/build-training-dataset.ts) and exported as a portable
 * JSON ensemble so the deployed Node/TypeScript backend can run inference without a Python
 * runtime. See docs/model-training-results.md for the full methodology, metrics, and
 * disclosure that the training data is synthetic.
 *
 * This is a research-grade advisory signal, not a substitute for the evaluator-reviewed,
 * evidence-based score computed by buildDraftPointSummary. See
 * src/controllers/faculty.controller.ts for how the two are kept distinct.
 */

export const PROMOTION_MODEL_FEATURES = [
  'yearsInService',
  'rankOrdinal',
  'attainmentDoctorate',
  'observedTeachingPoints',
  'observedKraInstruction',
  'observedKraResearch',
  'observedKraExtension',
  'observedKraProfessionalDevelopment',
  'observedWeightedScore',
  'observedCompletenessScore',
  'documentCount',
] as const;

export type PromotionModelFeatureVector = Record<(typeof PROMOTION_MODEL_FEATURES)[number], number>;

interface StumpNode {
  featureIndex: number;
  featureName: string;
  threshold: number;
  leftVote: 1 | -1;
  rightVote: 1 | -1;
  alpha: number;
}

interface AdaBoostArtifact {
  kind: 'adaboost-samme-stumps';
  featureNames: string[];
  stumps: StumpNode[];
  modelName: string;
  metrics: Record<string, unknown>;
  featureImportance: Array<{ feature: string; importance: number }>;
}

type TreeNode = { leaf: number } | { featureIndex: number; threshold: number; left: TreeNode; right: TreeNode };

interface TreeEnsembleArtifact {
  kind: 'additive-regression-trees';
  comparison: 'lt' | 'lte';
  featureNames: string[];
  baseScore: number;
  learningRate: number;
  trees: TreeNode[];
  modelName: string;
  metrics: Record<string, unknown>;
  featureImportance: Array<{ feature: string; importance: number }>;
}

type ModelArtifact = AdaBoostArtifact | TreeEnsembleArtifact;

let cachedArtifact: ModelArtifact | null = null;
let cachedComparison: unknown | null = null;

function loadArtifact(): ModelArtifact | null {
  if (cachedArtifact) return cachedArtifact;
  if (!fs.existsSync(promotionModelPath)) return null;
  cachedArtifact = JSON.parse(fs.readFileSync(promotionModelPath, 'utf-8')) as ModelArtifact;
  return cachedArtifact;
}

export function isPromotionModelAvailable(): boolean {
  return loadArtifact() !== null;
}

function evalTree(node: TreeNode, values: number[], comparison: 'lt' | 'lte'): number {
  let current = node;
  while (!('leaf' in current)) {
    const value = values[current.featureIndex];
    const goesLeft = comparison === 'lt' ? value < current.threshold : value <= current.threshold;
    current = goesLeft ? current.left : current.right;
  }
  return current.leaf;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export interface PromotionPrediction {
  probability: number;
  predictedClass: boolean;
  modelUsed: string;
  topFactors: Array<{ feature: string; value: number; importance: number }>;
}

export function predictPromotion(features: PromotionModelFeatureVector): PromotionPrediction {
  const artifact = loadArtifact();
  if (!artifact) {
    throw new Error('Promotion model artifact is not present. Run scripts/ml/train_models.py to generate models/promotion-model.json.');
  }

  const values = artifact.featureNames.map((name) => {
    const value = (features as Record<string, number>)[name];
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new Error(`Missing or invalid feature "${name}" for promotion prediction.`);
    }
    return value;
  });

  let probability: number;
  if (artifact.kind === 'adaboost-samme-stumps') {
    const score = artifact.stumps.reduce((sum, stump) => {
      const vote = values[stump.featureIndex] <= stump.threshold ? stump.leftVote : stump.rightVote;
      return sum + stump.alpha * vote;
    }, 0);
    probability = sigmoid(2 * score);
  } else {
    const raw =
      artifact.baseScore +
      artifact.learningRate * artifact.trees.reduce((sum, tree) => sum + evalTree(tree, values, artifact.comparison), 0);
    probability = sigmoid(raw);
  }

  const topFactors = artifact.featureImportance.slice(0, 5).map((entry) => ({
    feature: entry.feature,
    value: (features as Record<string, number>)[entry.feature],
    importance: entry.importance,
  }));

  return {
    probability,
    predictedClass: probability >= 0.5,
    modelUsed: `${artifact.modelName.toLowerCase()}-v1`,
    topFactors,
  };
}

export function getModelComparison(): unknown | null {
  if (cachedComparison) return cachedComparison;
  if (!fs.existsSync(modelComparisonPath)) return null;
  cachedComparison = JSON.parse(fs.readFileSync(modelComparisonPath, 'utf-8'));
  return cachedComparison;
}

export function getFeatureImportance(): Array<{ feature: string; importance: number }> {
  const artifact = loadArtifact();
  return artifact?.featureImportance ?? [];
}

/**
 * Builds the model's feature vector for a real faculty profile from the same
 * buildDraftPointSummary() result the dashboard and evaluator-approval flow already compute,
 * so training and live inference derive features through one shared pipeline (no
 * train/serve skew). See scripts/ml/build-training-dataset.ts for the training-time
 * equivalent, which uses the same fields on synthetic ground truth.
 */
export function buildFeatureVectorFromDraftPoints(
  draftPoints: DraftPointSummary,
  personalData: { academicRank?: string | null; highestEducationalAttainment?: string | null; yearsInService?: number | null },
  documentCount: number,
): PromotionModelFeatureVector {
  const { scoreComputation, teachingEffectiveness } = draftPoints;
  const panelFractions = scoreComputation.panelScores
    .filter((panel) => panel.maxScore > 0)
    .map((panel) => Math.min(1, Math.max(0, panel.usedScore / panel.maxScore)));
  const observedCompletenessScore = panelFractions.length
    ? panelFractions.reduce((a, b) => a + b, 0) / panelFractions.length
    : 0;

  const rankOrdinal = personalData.academicRank ? academicRankOptions.indexOf(personalData.academicRank as (typeof academicRankOptions)[number]) : -1;

  return {
    yearsInService: personalData.yearsInService ?? 0,
    rankOrdinal: rankOrdinal >= 0 ? rankOrdinal : 0,
    attainmentDoctorate: personalData.highestEducationalAttainment === 'Doctorate Graduate' ? 1 : 0,
    observedTeachingPoints: teachingEffectiveness ? teachingEffectiveness.points : 0,
    observedKraInstruction: scoreComputation.kraTotals.instruction,
    observedKraResearch: scoreComputation.kraTotals.research,
    observedKraExtension: scoreComputation.kraTotals.extension,
    observedKraProfessionalDevelopment: scoreComputation.kraTotals.professionalDevelopment,
    observedWeightedScore: scoreComputation.weightedScore ?? 0,
    observedCompletenessScore,
    documentCount,
  };
}
