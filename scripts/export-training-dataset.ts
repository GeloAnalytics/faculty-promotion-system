import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient, TrainingExampleStatus } from '@prisma/client';
import { featureKeys, type FeatureKey, type FeatureVector } from '../src/types';

const prisma = new PrismaClient();

const defaultOutputPath = path.join(process.cwd(), 'data', 'exports', 'objective-305-training-dataset.csv');
const requestedOutputPath = process.argv[2];
const outputPath = path.resolve(requestedOutputPath ?? defaultOutputPath);

type TrainingRow = {
  trainingExampleId: string;
  profileId: string;
  status: TrainingExampleStatus;
  datasetSplit: string;
  labelPromoted: 0 | 1;
  createdAt: string;
} & FeatureVector;

void main();

async function main() {
  try {
    const examples = await prisma.trainingExample.findMany({
      where: {
        status: {
          in: [TrainingExampleStatus.LABELED, TrainingExampleStatus.VALIDATED],
        },
        labelPromoted: {
          not: null,
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        profileId: true,
        status: true,
        datasetSplit: true,
        labelPromoted: true,
        createdAt: true,
        featureSnapshot: true,
      },
    });

    const rows = examples.flatMap((example) => {
      const featureSnapshot = readFeatureVector(example.featureSnapshot);
      if (!featureSnapshot) {
        return [];
      }

      return [
        {
          trainingExampleId: example.id,
          profileId: example.profileId ?? '',
          status: example.status,
          datasetSplit: example.datasetSplit ?? '',
          labelPromoted: example.labelPromoted ? (1 as const) : (0 as const),
          createdAt: example.createdAt.toISOString(),
          ...featureSnapshot,
        },
      ];
    });

    ensureDirectory(path.dirname(outputPath));
    fs.writeFileSync(outputPath, toCsv(rows), 'utf8');

    console.log(`Exported ${rows.length} training example(s) to ${outputPath}`);

    const skippedCount = examples.length - rows.length;
    if (skippedCount > 0) {
      console.warn(`Skipped ${skippedCount} example(s) with incomplete or invalid feature snapshots.`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

function readFeatureVector(value: unknown): FeatureVector | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const vector = {} as FeatureVector;

  for (const key of featureKeys) {
    const parsed = readFiniteNumber(candidate[key]);
    if (parsed === null) {
      return null;
    }
    vector[key] = parsed;
  }

  return vector;
}

function readFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function ensureDirectory(directoryPath: string) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function toCsv(rows: TrainingRow[]) {
  const headers = [
    'trainingExampleId',
    'profileId',
    'status',
    'datasetSplit',
    'labelPromoted',
    'createdAt',
    ...featureKeys,
  ] satisfies Array<keyof TrainingRow | FeatureKey>;

  const lines = [headers.join(',')];

  for (const row of rows) {
    const values = headers.map((header) => escapeCsvValue(row[header]));
    lines.push(values.join(','));
  }

  return `${lines.join('\n')}\n`;
}

function escapeCsvValue(value: string | number) {
  const stringValue = String(value);
  if (/[,"\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}
