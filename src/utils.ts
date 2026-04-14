// Mock feature extractor from PDF text (improve with NLP/regex for CHED docs)
export const extractFeatures = (text: string): Record<string, number> => {
  const features: Record<string, number> = {
    teaching_effectiveness: extractScore(text, /Teaching Effectiveness[:\\s]*(\\d+[\\.\\d]*)?/i) || 0,
    curriculum_dev: extractScore(text, /Curriculum[:\\s]*(\\d+[\\.\\d]*)?/i) || 0,
    thesis_mentorship: extractScore(text, /Thesis[:\\s]*(\\d+[\\.\\d]*)?/i) || 0,
    research_outputs: extractScore(text, /Research[:\\s]*(\\d+[\\.\\d]*)?/i) || 0,
    inventions: extractScore(text, /Inventions[:\\s]*(\\d+[\\.\\d]*)?/i) || 0,
    creative_works: extractScore(text, /Creative Works[:\\s]*(\\d+[\\.\\d]*)?/i) || 0,
    service_institution: extractScore(text, /Service Institution[:\\s]*(\\d+[\\.\\d]*)?/i) || 0,
    service_community: extractScore(text, /Service Community[:\\s]*(\\d+[\\.\\d]*)?/i) || 0,
    extension: extractScore(text, /Extension[:\\s]*(\\d+[\\.\\d]*)?/i) || 0,
    professional_dev: extractScore(text, /Professional Development[:\\s]*(\\d+[\\.\\d]*)?/i) || 0,
  };
  return features;
};

function extractScore(text: string, regex: RegExp): number | null {
  const match = text.match(regex);
  return match ? parseFloat(match[1]) : null;
}

// Improved predict (use fixed feature order)
export const predictPromotion = (features: Record<string, number>): { probability: number; predicted: boolean } => {
  const featureValues = Object.values(features).map(v => v || 0);
  // Mock coeffs from Python notebook order (adjust after training)
  const coeffs = [0.5, 0.4, 0.3, 0.6, 0.2, 0.2, 0.1, 0.1, 0.1, 0.2];
  let logit = 0.0;
  featureValues.forEach((val, i) => {
    if (i < coeffs.length) logit += coeffs[i] * val;
  });
  logit -= 0.5; // bias
  const prob = 1 / (1 + Math.exp(-logit));
  return { probability: Math.round(prob * 100) / 100, predicted: prob > 0.5 };
};
