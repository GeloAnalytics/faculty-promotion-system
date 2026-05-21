import path from 'node:path';

export type ProfileLinkCandidate = {
  id: string;
  name: string;
  employeeId: string | null;
};

export function findBestMatchingProfile(profiles: ProfileLinkCandidate[], originalName: string) {
  let bestMatch: ProfileLinkCandidate | null = null;
  let bestScore = 0;

  for (const profile of profiles) {
    const score = scoreProfileFilename(profile.name, profile.employeeId ?? undefined, originalName);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = profile;
    }
  }

  return bestScore > 0 ? bestMatch : null;
}

export function scoreProfileFilename(fullName: string, employeeId: string | undefined, originalName: string) {
  const normalizedFileName = normalizeForMatch(path.parse(originalName).name);
  const fileTokens = new Set(tokenizeForMatch(originalName));
  const nameTokens = tokenizeForMatch(fullName);

  let score = 0;

  if (employeeId) {
    const normalizedEmployeeId = normalizeForMatch(employeeId);
    if (normalizedEmployeeId && normalizedFileName.includes(normalizedEmployeeId)) {
      score += 100;
    }
  }

  if (!nameTokens.length) {
    return score;
  }

  const matchedNameTokenCount = nameTokens.filter((token) => fileTokens.has(token)).length;
  if (matchedNameTokenCount === nameTokens.length) {
    score += 50 + matchedNameTokenCount;
  } else if (matchedNameTokenCount >= Math.max(2, nameTokens.length - 1)) {
    score += 15 + matchedNameTokenCount;
  }

  return score;
}

export function tokenizeForMatch(value: string) {
  return normalizeForMatch(value)
    .split(' ')
    .filter((token) => token.length >= 2);
}

export function normalizeForMatch(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
