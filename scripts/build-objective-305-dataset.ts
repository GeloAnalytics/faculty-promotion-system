import fs from 'node:fs';
import path from 'node:path';
import pdf from 'pdf-parse';

type TqeRow = {
  teacherId: string;
  courseId: string;
  semester: string;
  teachingEffectiveness: number;
  curriculumDevelopment: number;
  thesisMentorship: number;
  researchOutputs: number;
  inventions: number;
  creativeWorks: number;
  serviceInstitution: number;
  serviceCommunity: number;
  extensionInvolvement: number;
  professionalDevelopment: number;
  teachingQuality: string;
};

type TrainingRow = {
  trainingExampleId: string;
  profileId: string;
  status: 'VALIDATED';
  datasetSplit: 'fallback-file-based';
  labelPromoted: 0 | 1;
  createdAt: string;
  age: number;
  yearsInService: number;
  highestEducationalAttainmentLevel: number;
  teachingEffectiveness: number;
  researchOutputs: number;
  extensionServices: number;
  administrativeExperience: number;
  professionalDevelopmentHours: number;
  ipcrAverage: number;
  promotionHistoryCount: number;
  documentCompleteness: number;
  documentQualityScore: number;
};

type CriterionConfig = {
  key: string;
  terms: string[];
  value: (row: TqeRow) => number;
};

const repoRoot = process.cwd();
const defaultOutputPath = path.join(repoRoot, 'data', 'exports', 'objective-305-training-dataset.csv');
const defaultMetadataPath = path.join(repoRoot, 'data', 'exports', 'objective-305-training-dataset.metadata.json');
const requestedOutputPath = process.argv[2];
const outputPath = path.resolve(requestedOutputPath ?? defaultOutputPath);
const metadataPath = requestedOutputPath
  ? `${outputPath}.metadata.json`
  : defaultMetadataPath;

const tqePath = path.join(repoRoot, 'TQE.csv');
const guidelinePdfPath = path.join(repoRoot, 'DBM-JC-No-3-s-2022-9th-cycle-NBC-461-with-Annexes.pdf');

const criterionConfigs: CriterionConfig[] = [
  {
    key: 'teachingEffectiveness',
    terms: ['teaching effectiveness'],
    value: (row) => row.teachingEffectiveness / 100,
  },
  {
    key: 'researchOutputs',
    terms: ['research outputs', 'research'],
    value: (row) => row.researchOutputs / 5,
  },
  {
    key: 'extensionServices',
    terms: ['extension', 'service to the community', 'service to the institution'],
    value: (row) => (row.serviceCommunity + row.extensionInvolvement + row.serviceInstitution / 10) / 30,
  },
  {
    key: 'professionalDevelopmentHours',
    terms: ['professional development', 'continuing development'],
    value: (row) => row.professionalDevelopment / 10,
  },
  {
    key: 'documentQualityScore',
    terms: ['creative works', 'inventions', 'curriculum', 'instructional materials', 'mentorship'],
    value: (row) =>
      (row.creativeWorks / 100 +
        row.inventions / 100 +
        row.curriculumDevelopment / 10 +
        row.thesisMentorship / 100) /
      4,
  },
];

void main();

async function main() {
  try {
    ensureFileExists(tqePath);
    ensureFileExists(guidelinePdfPath);

    const tqeRows = readTqeRows(tqePath);
    if (tqeRows.length === 0) {
      throw new Error(`No rows found in ${tqePath}`);
    }

    const guidelineText = await extractPdfText(guidelinePdfPath);
    const activeCriteria = criterionConfigs.filter((config) =>
      config.terms.some((term) => guidelineText.includes(term)),
    );

    const teacherStats = buildTeacherStats(tqeRows);
    const timestamp = new Date().toISOString();
    const trainingRows = tqeRows.map((row, index) => toTrainingRow(row, index, timestamp, teacherStats, activeCriteria));

    ensureDirectory(path.dirname(outputPath));
    fs.writeFileSync(outputPath, toCsv(trainingRows), 'utf8');

    const metadata = {
      generatedAt: timestamp,
      sourceFiles: {
        tqeCsv: tqePath,
        guidelinePdf: guidelinePdfPath,
      },
      rowCount: trainingRows.length,
      labelRule: "Teaching_Quality === 'Excellent' mapped to labelPromoted = 1; all other values mapped to 0.",
      proxyFeatureNotes: {
        age: 'Proxy based on teacher record frequency across semesters.',
        yearsInService: 'Proxy based on teacher record frequency across semesters.',
        highestEducationalAttainmentLevel:
          'Proxy based on curriculum development, thesis mentorship, and professional development.',
        administrativeExperience: 'Proxy based on service to the institution.',
        ipcrAverage: 'Composite proxy derived from teaching, research, service, and development indicators.',
        promotionHistoryCount: "Proxy based on prior 'Excellent' records for the same teacher.",
      },
      activeGuidelineCriteria: activeCriteria.map((config) => config.key),
      inactiveGuidelineCriteria: criterionConfigs
        .filter((config) => !activeCriteria.includes(config))
        .map((config) => config.key),
    };

    fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

    console.log(`Built ${trainingRows.length} fallback training row(s) at ${outputPath}`);
    console.log(`Saved dataset metadata at ${metadataPath}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

function ensureFileExists(filePath: string) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required file not found: ${filePath}`);
  }
}

function ensureDirectory(directoryPath: string) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function readTqeRows(csvPath: string): TqeRow[] {
  const lines = fs
    .readFileSync(csvPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length <= 1) {
    return [];
  }

  const rows = lines.slice(1);
  return rows.map(parseTqeRow).filter((row): row is TqeRow => row !== null);
}

function parseTqeRow(line: string): TqeRow | null {
  const values = parseCsvLine(line);
  if (values.length < 14) {
    return null;
  }

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
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === ',' && !insideQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

async function extractPdfText(filePath: string) {
  const buffer = fs.readFileSync(filePath);
  const parsed = await pdf(buffer);
  return parsed.text.toLowerCase();
}

function buildTeacherStats(rows: TqeRow[]) {
  const byTeacher = new Map<string, { recordCount: number; excellentCount: number }>();

  for (const row of rows) {
    const current = byTeacher.get(row.teacherId) ?? { recordCount: 0, excellentCount: 0 };
    current.recordCount += 1;
    if (isExcellent(row.teachingQuality)) {
      current.excellentCount += 1;
    }
    byTeacher.set(row.teacherId, current);
  }

  const maxRecordCount = Math.max(...Array.from(byTeacher.values(), (item) => item.recordCount), 1);
  const maxExcellentCount = Math.max(...Array.from(byTeacher.values(), (item) => item.excellentCount), 1);

  return { byTeacher, maxRecordCount, maxExcellentCount };
}

function toTrainingRow(
  row: TqeRow,
  index: number,
  timestamp: string,
  teacherStats: ReturnType<typeof buildTeacherStats>,
  activeCriteria: CriterionConfig[],
): TrainingRow {
  const teacherStat = teacherStats.byTeacher.get(row.teacherId) ?? { recordCount: 1, excellentCount: 0 };
  const age = clamp(teacherStat.recordCount / teacherStats.maxRecordCount);
  const yearsInService = clamp((teacherStat.recordCount - 1) / teacherStats.maxRecordCount);
  const highestEducationalAttainmentLevel = clamp(
    (row.curriculumDevelopment / 10 + row.thesisMentorship / 100 + row.professionalDevelopment / 10) / 3,
  );
  const teachingEffectiveness = clamp(row.teachingEffectiveness / 100);
  const researchOutputs = clamp(row.researchOutputs / 5);
  const extensionServices = clamp((row.serviceCommunity + row.extensionInvolvement) / 20);
  const administrativeExperience = clamp(row.serviceInstitution / 100);
  const professionalDevelopmentHours = clamp(row.professionalDevelopment / 10);
  const ipcrAverage = clamp(
    (
      teachingEffectiveness +
      researchOutputs +
      extensionServices +
      professionalDevelopmentHours +
      administrativeExperience
    ) / 5,
  );
  const promotionHistoryCount = clamp(
    Math.max(teacherStat.excellentCount - (isExcellent(row.teachingQuality) ? 1 : 0), 0) / teacherStats.maxExcellentCount,
  );

  const activeCriterionValues = activeCriteria.map((criterion) => clamp(criterion.value(row)));
  const documentCompleteness =
    activeCriterionValues.length === 0
      ? 0
      : clamp(activeCriterionValues.filter((value) => value > 0).length / activeCriterionValues.length);
  const documentQualityScore =
    activeCriterionValues.length === 0
      ? 0
      : clamp(activeCriterionValues.reduce((sum, value) => sum + value, 0) / activeCriterionValues.length);

  return {
    trainingExampleId: `fallback-${index + 1}`,
    profileId: row.teacherId,
    status: 'VALIDATED',
    datasetSplit: 'fallback-file-based',
    labelPromoted: isExcellent(row.teachingQuality) ? 1 : 0,
    createdAt: timestamp,
    age: roundTo(age),
    yearsInService: roundTo(yearsInService),
    highestEducationalAttainmentLevel: roundTo(highestEducationalAttainmentLevel),
    teachingEffectiveness: roundTo(teachingEffectiveness),
    researchOutputs: roundTo(researchOutputs),
    extensionServices: roundTo(extensionServices),
    administrativeExperience: roundTo(administrativeExperience),
    professionalDevelopmentHours: roundTo(professionalDevelopmentHours),
    ipcrAverage: roundTo(ipcrAverage),
    promotionHistoryCount: roundTo(promotionHistoryCount),
    documentCompleteness: roundTo(documentCompleteness),
    documentQualityScore: roundTo(documentQualityScore),
  };
}

function isExcellent(value: string) {
  return value.trim().toLowerCase() === 'excellent';
}

function toCsv(rows: TrainingRow[]) {
  const headers = Object.keys(rows[0] ?? {}) as Array<keyof TrainingRow>;
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

function parseNumber(value: string | undefined) {
  const parsed = Number.parseFloat(value ?? '0');
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function roundTo(value: number) {
  return Math.round(value * 100) / 100;
}
