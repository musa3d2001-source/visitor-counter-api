// Resolve Playwright whether it is installed locally or globally (cloud image ships it globally).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', '/usr/local/lib/node_modules/playwright', '/usr/lib/node_modules/playwright']) {
  try { pw = require(p); break; } catch { /* try next */ }
}
if (!pw) throw new Error('Playwright not found: npm i -g playwright');
export const chromium = pw.chromium;
