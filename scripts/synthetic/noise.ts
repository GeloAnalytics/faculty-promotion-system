import type { Rng } from './rng';

export type NoiseLevel = 'clean' | 'light' | 'heavy';

const LETTER_SLIPS: Record<string, string[]> = {
  o: ['0', 'c'],
  l: ['1', 'I'],
  i: ['l', '1'],
  e: ['c'],
  a: ['o'],
  n: ['u', 'r'],
  s: ['5'],
  t: ['f'],
  m: ['rn'],
  h: ['b'],
};
const DIGIT_SLIPS: Record<string, string> = { '5': '6', '3': '8', '1': '7', '0': '6', '8': '3', '9': '4', '6': '5', '7': '1' };

// Imitates the damage Tesseract / OCR.space does to scanned forms: character
// confusions, dropped lines, rating-block lines read out of order (labels end
// up away from their values), decimal commas, and the odd misread digit.
export function degrade(text: string, level: NoiseLevel, rng: Rng): string {
  if (level === 'clean') {
    return text;
  }
  const letterRate = level === 'light' ? 0.004 : 0.016;
  const dropRate = level === 'light' ? 0.01 : 0.06;
  const digitRate = level === 'light' ? 0.03 : 0.1;

  let lines = text.split('\n').filter(() => !rng.chance(dropRate));

  if (level === 'heavy' && lines.length > 6 && rng.chance(0.6)) {
    // Read the lower block in the wrong order, as multi-column scans often are.
    const cut = Math.floor(lines.length / 2);
    lines = [...lines.slice(0, cut), ...rng.shuffle(lines.slice(cut))];
  }

  const noisy = lines.map((line) => {
    let out = '';
    for (const ch of line) {
      const lower = ch.toLowerCase();
      if (/[a-z]/i.test(ch) && LETTER_SLIPS[lower] && rng.chance(letterRate)) {
        out += rng.pick(LETTER_SLIPS[lower]);
      } else if (ch !== ' ' && rng.chance(letterRate / 4)) {
        // dropped glyph
      } else {
        out += ch;
      }
    }
    if (rng.chance(level === 'light' ? 0.04 : 0.12)) {
      // "97.40" read as "97,40"
      out = out.replace(/(\d)\.(\d{2})(?!\d)/, '$1,$2');
    }
    return out;
  });

  let result = noisy.join(level === 'heavy' && rng.chance(0.3) ? ' ' : '\n');
  if (rng.chance(digitRate)) {
    const digits = [...result.matchAll(/\d/g)];
    if (digits.length) {
      const target = rng.pick(digits);
      const replacement = DIGIT_SLIPS[target[0]] ?? target[0];
      result = result.slice(0, target.index) + replacement + result.slice((target.index ?? 0) + 1);
    }
  }
  return result;
}
