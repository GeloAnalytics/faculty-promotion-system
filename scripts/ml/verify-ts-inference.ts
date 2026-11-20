/**
 * Cross-checks src/services/model.service.ts's pure-TS inference against the Python-trained
 * model's own predict_proba on the held-out test split (data/ml/test_predictions_reference.json,
 * written by scripts/ml/train_models.py), confirming the Node backend -- which has no Python
 * runtime at deploy time -- reproduces the trained model's output closely enough that its
 * classification decisions match.
 */
import fs from 'node:fs';
import path from 'node:path';
import { predictPromotion, PROMOTION_MODEL_FEATURES, type PromotionModelFeatureVector } from '../../src/services/model.service';

function parseCsv(text: string) {
  const [headerLine, ...lines] = text.trim().split('\n');
  const header = headerLine.split(',');
  return lines.map((line) => {
    const cells = line.split(',');
    return Object.fromEntries(header.map((key, i) => [key, cells[i]])) as Record<string, string>;
  });
}

function main() {
  const csvPath = path.join(__dirname, '../../data/ml/promotion_training_dataset.csv');
  const referencePath = path.join(__dirname, '../../data/ml/test_predictions_reference.json');

  const rows = parseCsv(fs.readFileSync(csvPath, 'utf-8')).filter((row) => row.split === 'test');
  const reference: Array<{ seq: number; probability: number; predictedClass: boolean }> = JSON.parse(
    fs.readFileSync(referencePath, 'utf-8'),
  );
  const referenceBySeq = new Map(reference.map((r) => [r.seq, r]));

  let maxDiff = 0;
  let classMismatches = 0;
  for (const row of rows) {
    const ref = referenceBySeq.get(Number(row.seq));
    if (!ref) throw new Error(`No reference prediction for seq ${row.seq}`);
    const features = Object.fromEntries(
      PROMOTION_MODEL_FEATURES.map((key) => [key, Number(row[key])]),
    ) as PromotionModelFeatureVector;
    const prediction = predictPromotion(features);

    maxDiff = Math.max(maxDiff, Math.abs(prediction.probability - ref.probability));
    if (prediction.predictedClass !== ref.predictedClass) classMismatches += 1;
  }

  console.log(`Compared TS inference against the Python reference on ${rows.length} held-out test rows.`);
  console.log(`Max |probability difference| = ${maxDiff.toFixed(6)} (expected: small, from XGBoost's float32 split thresholds).`);
  console.log(`Classification mismatches: ${classMismatches} / ${rows.length}.`);

  if (classMismatches > 0) {
    console.error('TS inference disagrees with the trained model on at least one row -- do not ship this artifact.');
    process.exit(1);
  }
}

main();
