import { z } from 'zod';
import { facultyIngestionSchema } from './faculty.validation';

export const trainingSubmissionSchema = z.object({
  profileId: z.string().trim().optional(),
  datasetSplit: z.string().trim().optional(),
  labelPromoted: z.boolean().optional(),
  labelSource: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  rawInput: facultyIngestionSchema,
  featureSnapshot: z.record(z.number()),
  modelSnapshot: z
    .object({
      selectedFeatures: z.array(z.object({ feature: z.string(), importance: z.number(), rationale: z.string() })),
      modelResults: z.array(
        z.object({
          model: z.string(),
          metrics: z.object({
            accuracy: z.number(),
            precision: z.number(),
            recall: z.number(),
            f1Score: z.number(),
          }),
          promotionProbability: z.number(),
          predictedPromotion: z.boolean(),
          keyFactors: z.array(z.string()),
        }),
      ),
      bestModel: z.object({
        model: z.string(),
        metrics: z.object({
          accuracy: z.number(),
          precision: z.number(),
          recall: z.number(),
          f1Score: z.number(),
        }),
        promotionProbability: z.number(),
        predictedPromotion: z.boolean(),
        keyFactors: z.array(z.string()),
      }),
      recommendations: z.array(
        z.object({
          area: z.string(),
          recommendation: z.string(),
          evidence: z.string(),
        }),
      ),
    })
    .optional(),
});

export const trainingLabelSchema = z.object({
  labelPromoted: z.boolean(),
  labelSource: z.string().trim().optional(),
  datasetSplit: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  criterionScores: z.record(z.coerce.number().min(0)).optional(),
  validated: z.boolean().optional(),
});
