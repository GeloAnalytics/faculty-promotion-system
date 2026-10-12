const { execFileSync } = require('node:child_process');
const { readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const publicDir = join(__dirname, 'public');
const clientScripts = readdirSync(publicDir)
  .filter((name) => name.endsWith('.js'))
  .map((name) => join(publicDir, name));

for (const script of clientScripts) {
  const contents = readFileSync(script, 'utf8');
  if (/^(<<<<<<<|=======|>>>>>>>)/m.test(contents)) {
    throw new Error(`Unresolved merge-conflict marker in ${script}`);
  }

  try {
    execFileSync(process.execPath, ['--input-type=module', '--check'], {
      input: contents,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
  } catch (error) {
    throw new Error(`Invalid browser script: ${script}`, { cause: error });
  }
}

console.log(`Validated ${clientScripts.length} browser script(s).`);
