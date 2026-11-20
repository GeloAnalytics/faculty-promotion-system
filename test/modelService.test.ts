import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  isPromotionModelAvailable,
  predictPromotion,
  getModelComparison,
  getFeatureImportance,
  buildFeatureVectorFromDraftPoints,
  PROMOTION_MODEL_FEATURES,
  type PromotionModelFeatureVector,
} from '../src/services/model.service';
import { buildDraftPointSummary } from '../src/utils/dashboard.utils';

const repoRoot = path.join(__dirname, '..');
const hasArtifact = fs.existsSync(path.join(repoRoot, 'models', 'promotion-model.json'));

test('isPromotionModelAvailable reflects whether models/promotion-model.json exists', () => {
  assert.equal(isPromotionModelAvailable(), hasArtifact);
});

test(
  'predictPromotion returns a probability in [0,1], a boolean class, and ranked top factors',
  { skip: !hasArtifact },
  () => {
    const features: PromotionModelFeatureVector = {
      yearsInService: 10,
      rankOrdinal: 5,
      attainmentDoctorate: 1,
      observedTeachingPoints: 50,
      observedKraInstruction: 80,
      observedKraResearch: 60,
      observedKraExtension: 40,
      observedKraProfessionalDevelopment: 70,
      observedWeightedScore: 75,
      observedCompletenessScore: 0.8,
      documentCount: 20,
    };
    const prediction = predictPromotion(features);
    assert.ok(prediction.probability >= 0 && prediction.probability <= 1);
    assert.equal(typeof prediction.predictedClass, 'boolean');
    assert.equal(prediction.predictedClass, prediction.probability >= 0.5);
    assert.ok(prediction.topFactors.length > 0);
    assert.ok(prediction.modelUsed.length > 0);
  },
);

test('predictPromotion throws a clear error for a missing feature rather than silently using NaN', { skip: !hasArtifact }, () => {
  const incomplete = {} as PromotionModelFeatureVector;
  assert.throws(() => predictPromotion(incomplete), /Missing or invalid feature/);
});

test('getModelComparison, when present, reports metrics for every PROMOTION_MODEL_FEATURES-consuming model', { skip: !hasArtifact }, () => {
  const comparison = getModelComparison() as { results: Record<string, { recall: number }>; winningModel: string } | null;
  assert.ok(comparison);
  assert.ok(comparison!.winningModel in comparison!.results);
  for (const metrics of Object.values(comparison!.results)) {
    assert.ok(metrics.recall >= 0 && metrics.recall <= 1);
  }
});

test('getFeatureImportance only ever ranks the model\'s own declared features', { skip: !hasArtifact }, () => {
  const importance = getFeatureImportance();
  assert.ok(importance.length > 0);
  for (const entry of importance) {
    assert.ok((PROMOTION_MODEL_FEATURES as readonly string[]).includes(entry.feature));
  }
});

test(
  'buildFeatureVectorFromDraftPoints + predictPromotion runs end-to-end on a real buildDraftPointSummary() output',
  { skip: !hasArtifact },
  () => {
    const profile = {
      features: {
        rawInput: {
          personalData: {
            fullName: 'Test Faculty',
            academicRank: 'Associate Professor II',
            highestEducationalAttainment: 'Doctorate Graduate',
            yearsInService: 12,
          },
          promotionHistory: [],
        },
      },
      semester: null,
    };
    const draftPoints = buildDraftPointSummary(profile, []);
    const features = buildFeatureVectorFromDraftPoints(
      draftPoints,
      { academicRank: 'Associate Professor II', highestEducationalAttainment: 'Doctorate Graduate', yearsInService: 12 },
      0,
    );
    const prediction = predictPromotion(features);
    assert.ok(prediction.probability >= 0 && prediction.probability <= 1);
  },
);
