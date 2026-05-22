export const academicRankOptions = [
  'Instructor I',
  'Instructor II',
  'Instructor III',
  'Assistant Professor I',
  'Assistant Professor II',
  'Assistant Professor III',
  'Assistant Professor IV',
  'Associate Professor I',
  'Associate Professor II',
  'Associate Professor III',
  'Associate Professor IV',
  'Associate Professor V',
  'Professor I',
  'Professor II',
  'Professor III',
  'Professor IV',
  'Professor V',
  'Professor VI',
  'College/University Professor',
] as const;

export const educationalAttainmentOptions = [
  'Doctorate Graduate',
  'Doctorate Units',
  "Master's",
  "Bachelor's",
] as const;

const academicRankAliases = academicRankOptions.reduce<Record<string, string>>((aliases, rank) => {
  aliases[normalizeKey(rank)] = rank;
  aliases[normalizeKey(rank.replace(/\bI\b/g, '1').replace(/\bII\b/g, '2').replace(/\bIII\b/g, '3').replace(/\bIV\b/g, '4').replace(/\bV\b/g, '5').replace(/\bVI\b/g, '6'))] = rank;
  return aliases;
}, {});

const attainmentAliases: Record<string, (typeof educationalAttainmentOptions)[number]> = {
  [normalizeKey('Doctorate Graduate')]: 'Doctorate Graduate',
  [normalizeKey('Doctoral Graduate')]: 'Doctorate Graduate',
  [normalizeKey('Doctorate')]: 'Doctorate Graduate',
  [normalizeKey('PhD')]: 'Doctorate Graduate',
  [normalizeKey('Doctorate Units')]: 'Doctorate Units',
  [normalizeKey('Doctoral Units')]: 'Doctorate Units',
  [normalizeKey('Doctoral Studies')]: 'Doctorate Units',
  [normalizeKey('Masteral Graduate')]: "Master's",
  [normalizeKey("Master's")]: "Master's",
  [normalizeKey('Masters')]: "Master's",
  [normalizeKey("Bachelor's")]: "Bachelor's",
  [normalizeKey('Bachelors')]: "Bachelor's",
};

export function normalizeAcademicRankOption(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return academicRankAliases[normalizeKey(value)] ?? null;
}

export function normalizeEducationalAttainmentOption(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return attainmentAliases[normalizeKey(value)] ?? null;
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}
