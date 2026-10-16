/**
 * H6 regression: the Gemini model is centralized in ONE constant,
 *   process.env.GEMINI_MODEL || 'gemini-2.5-flash'
 * and every AI route uses it. Verified both statically and by observing the
 * model name that a (local) Gemini endpoint actually receives.
 *
 * Run with:  npx tsx tests/gemini_model_test.ts
 */
import fs from 'fs';
import { spawnSync } from 'child_process';
import { makeRunner } from './support/harness';

function modelsSeenWith(env: Record<string, string>): string[] {
  const r = spawnSync('npx', ['tsx', 'tests/support/model_probe.ts'], { env: { ...process.env, ...env }, encoding: 'utf8', timeout: 90000 });
  const m = /MODELS=(\[.*\])/.exec(r.stdout || '');
  return m ? JSON.parse(m[1]) : [`<no output: ${(r.stderr || '').slice(0, 200)}>`];
}

const t = makeRunner('GEMINI MODEL CENTRALIZATION (H6)');
const src = fs.readFileSync('server.ts', 'utf8');

t.check('1 the default model literal appears exactly once (in the constant)', (src.match(/gemini-2\.5-flash/g) || []).length === 1, String((src.match(/gemini-2\.5-flash/g) || []).length));
t.check("2 the constant is exactly process.env.GEMINI_MODEL || 'gemini-2.5-flash'", src.includes("const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';"));
t.check('3 no route hard-codes a model string', !/model:\s*['"`]/.test(src));
t.check('4 every generateContent call site uses GEMINI_MODEL', (src.match(/generateContent\(/g) || []).length >= 7 && (src.match(/model: GEMINI_MODEL/g) || []).length === (src.match(/generateContent\(/g) || []).length, `${(src.match(/model: GEMINI_MODEL/g) || []).length}/${(src.match(/generateContent\(/g) || []).length}`);
t.check('5 .env.example documents GEMINI_MODEL', /^GEMINI_MODEL=/m.test(fs.readFileSync('.env.example', 'utf8')));

const custom = modelsSeenWith({ GEMINI_MODEL: 'custom-model-x' });
t.check('6 GEMINI_MODEL=custom-model-x => Gemini receives custom-model-x on every route', JSON.stringify(custom) === '["custom-model-x"]', JSON.stringify(custom));
const unset = modelsSeenWith({ GEMINI_MODEL: '' });
t.check('7 empty GEMINI_MODEL => default gemini-2.5-flash', JSON.stringify(unset) === '["gemini-2.5-flash"]', JSON.stringify(unset));
t.finish();
