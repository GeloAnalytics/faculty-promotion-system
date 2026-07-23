import { defineConfig } from 'prisma/config';
import fs from 'node:fs';
import path from 'node:path';

// Prisma skips its usual automatic .env loading whenever a prisma.config.ts
// is present, so DATABASE_URL has to be loaded here instead - otherwise every
// prisma CLI command (migrate, studio, db push) fails with "Environment
// variable not found: DATABASE_URL" even though .env has it.
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
});
