/**
 * M4 regression: AI quota is charged only for AI operations that SUCCEED,
 * failures never return fake success, and Summarize no longer uses upload quota.
 * Also checks the default Gemini model reaches the Gemini endpoint (H6).
 *
 * Runs the REAL server.ts (production mode) against local Supabase/Gemini test doubles.
 * Run with:  npx tsx tests/ai_quota_test.ts
 */
import fs from 'fs';
import { boot, makeRunner } from './support/harness';

async function main() {
  const t = makeRunner('AI QUOTA: CHARGE ONLY ON SUCCESS (M4) + DEFAULT MODEL (H6)');
  const h = await boot();
  const { supa, gemini, call } = h;
  const ai = (id: string) => supa.users.get(id)!.ai_count_today;
  const up = (id: string) => supa.users.get(id)!.uploads_count_today;

  supa.addUser('free1');
  const OCR = { imageBase64: 'aGVsbG8=', mimeType: 'image/png', fileName: 'a.png' };

  // ---- validation failures cost nothing ----
  let r = await call('/api/pdf/ocr', { token: 'tok:free1', body: {} });
  t.check('1  OCR without an image => 400', r.status === 400, `${r.status} ${JSON.stringify(r.json)}`);
  r = await call('/api/summarize', { token: 'tok:free1', body: { text: '   ' } });
  t.check('2  Summarize with empty text => 400', r.status === 400, `${r.status}`);
  r = await call('/api/ai/smart-rename', { token: 'tok:free1', body: {} });
  t.check('3  Smart Rename without content => 4xx', r.status >= 400 && r.status < 500, `${r.status}`);
  t.check('4  validation failures did not consume AI quota or call Gemini', ai('free1') === 0 && gemini.calls.length === 0, `ai=${ai('free1')} calls=${gemini.calls.length}`);

  // ---- Gemini failure costs nothing and is never a fake success ----
  gemini.mode = 'error';
  r = await call('/api/pdf/ocr', { token: 'tok:free1', body: OCR });
  t.check('5  Gemini outage => OCR 502 (no fake result)', r.status === 502 && !r.json.success && !r.json.textLayers, `${r.status} ${JSON.stringify(r.json)}`);
  r = await call('/api/summarize', { token: 'tok:free1', body: { text: 'A real document body.' } });
  t.check('6  Gemini outage => Summarize 502 (no fake summary)', r.status === 502 && !r.json.summary, `${r.status} ${JSON.stringify(r.json)}`);
  r = await call('/api/copilot/command', { token: 'tok:free1', body: { message: 'tell me a joke', textLayers: [], imageFilters: {}, lang: 'en' } });
  t.check('7  Gemini outage => Copilot 502 (no canned "success" reply)', r.status === 502 && r.json.success !== true, `${r.status} ${JSON.stringify(r.json)}`);
  r = await call('/api/ai/extract-data', { token: 'tok:free1', body: { documentText: 'Invoice 1', fileName: 'a.pdf' } });
  t.check('8  Gemini outage => Extract 502', r.status === 502 && !r.json.extractedData, `${r.status} ${JSON.stringify(r.json)}`);
  t.check('9  none of the failed AI calls consumed quota', ai('free1') === 0, `ai=${ai('free1')}`);

  // ---- Gemini answers, but unusably ----
  gemini.mode = 'empty';
  r = await call('/api/summarize', { token: 'tok:free1', body: { text: 'A real document body.' } });
  t.check('10 empty Gemini answer => Summarize 502, not "Could not parse summary" success', r.status === 502 && !r.json.summary && ai('free1') === 0, `${r.status} ${JSON.stringify(r.json)} ai=${ai('free1')}`);
  gemini.mode = 'ok';
  gemini.text = 'this is not json';
  r = await call('/api/pdf/ocr', { token: 'tok:free1', body: OCR });
  t.check('11 unparsable OCR answer => 502 and no charge', r.status === 502 && ai('free1') === 0, `${r.status}`);
  gemini.text = '{}';
  r = await call('/api/ai/enhance-image', { token: 'tok:free1', body: { imageBase64: 'aGVsbG8=' } });
  t.check('12 enhance-image without usable numbers => 502 (no invented defaults), no charge', r.status === 502 && ai('free1') === 0, `${r.status} ${JSON.stringify(r.json)}`);

  // ---- success is charged exactly once ----
  gemini.text = '[{"id":"t1","text":"Hello","x":10,"y":10,"fontSize":12}]';
  r = await call('/api/pdf/ocr', { token: 'tok:free1', body: OCR });
  t.check('13 OCR success => 200 and exactly 1 AI credit', r.status === 200 && r.json.success && ai('free1') === 1, `${r.status} ai=${ai('free1')}`);
  t.check('14 reported aiQuota matches', r.json.aiQuota?.aiUsedToday === 1 && r.json.aiQuota?.aiLeft === 2, JSON.stringify(r.json.aiQuota));
  gemini.text = 'Summary text';
  r = await call('/api/summarize', { token: 'tok:free1', body: { text: 'A real document body.' } });
  t.check('15 Summarize success => 200, 1 more AI credit', r.status === 200 && r.json.summary === 'Summary text' && ai('free1') === 2, `${r.status} ai=${ai('free1')}`);
  t.check('16 Summarize consumed NO upload credit', up('free1') === 0, `uploads=${up('free1')}`);
  gemini.text = '[{"key":"Total","value":"5"}]';
  r = await call('/api/ai/extract-data', { token: 'tok:free1', body: { documentText: 'Invoice 1', fileName: 'a.pdf' } });
  t.check('17 Extract success => 200, 3rd credit used', r.status === 200 && ai('free1') === 3, `${r.status} ai=${ai('free1')}`);

  // ---- at the limit: rejected BEFORE any Gemini call ----
  const callsBefore = gemini.calls.length;
  r = await call('/api/summarize', { token: 'tok:free1', body: { text: 'more' } });
  t.check('18 free user at limit => 403', r.status === 403, `${r.status}`);
  t.check('19 at-limit request made NO Gemini call', gemini.calls.length === callsBefore);

  // ---- Pro is unaffected ----
  supa.addUser('pro1', { admin_granted_pro: true });
  gemini.text = 'Pro summary';
  r = await call('/api/summarize', { token: 'tok:pro1', body: { text: 'x' } });
  t.check('20 Pro user succeeds and is counted', r.status === 200 && ai('pro1') === 1, `${r.status}`);

  // ---- concurrency: the atomic increment still decides ----
  supa.addUser('race1', { ai_count_today: 2 });
  const rs = await Promise.all([1, 2, 3].map(() => call('/api/summarize', { token: 'tok:race1', body: { text: 'x' } })));
  const ok = rs.filter(x => x.status === 200).length, denied = rs.filter(x => x.status === 403).length;
  t.check('21 3 parallel requests with 1 credit left => exactly 1 delivered, 2 denied', ok === 1 && denied === 2, rs.map(x => x.status).join(','));
  t.check('22 counter never exceeds the limit', ai('race1') === 3, `ai=${ai('race1')}`);
  t.check('23 denied parallel requests did not receive the summary', rs.filter(x => x.status === 403).every(x => !x.json.summary));

  // ---- Copilot translate / title branches ----
  supa.addUser('cop1');
  const layers = [{ id: 'a', text: 'Hello', x: 10, y: 10, fontSize: 12 }];
  gemini.mode = 'error';
  r = await call('/api/copilot/command', { token: 'tok:cop1', body: { message: 'translate to arabic', textLayers: layers, imageFilters: {}, lang: 'en' } });
  t.check('26 Copilot translate + Gemini outage => 502, no charge', r.status === 502 && ai('cop1') === 0, `${r.status} ai=${ai('cop1')}`);
  gemini.mode = 'ok';
  gemini.text = '{"not":"an array"}';
  r = await call('/api/copilot/command', { token: 'tok:cop1', body: { message: 'translate to arabic', textLayers: layers, imageFilters: {}, lang: 'en' } });
  t.check('27 Copilot translate + unusable answer => 502, no charge', r.status === 502 && ai('cop1') === 0, `${r.status} ai=${ai('cop1')}`);
  gemini.text = '["مرحبا"]';
  r = await call('/api/copilot/command', { token: 'tok:cop1', body: { message: 'translate to arabic', textLayers: layers, imageFilters: {}, lang: 'en' } });
  t.check('28 Copilot translate success => layers translated, exactly 1 credit', r.status === 200 && r.json.textLayers?.[0]?.text === 'مرحبا' && ai('cop1') === 1, `${r.status} ${JSON.stringify(r.json.textLayers)} ai=${ai('cop1')}`);
  r = await call('/api/copilot/command', { token: 'tok:cop1', body: { message: 'change the title to Annual Report', textLayers: layers, imageFilters: {}, lang: 'en' } });
  t.check('29 Copilot title given explicitly (no AI needed) costs no credit', r.status === 200 && r.json.textLayers?.[0]?.text === 'Annual Report' && ai('cop1') === 1, `${r.status} ai=${ai('cop1')}`);
  gemini.mode = 'error';
  r = await call('/api/copilot/command', { token: 'tok:cop1', body: { message: 'make the title punchier', textLayers: layers, imageFilters: {}, lang: 'en' } });
  t.check('30 Copilot AI-derived title + Gemini outage => 502, no charge', r.status === 502 && ai('cop1') === 1, `${r.status} ai=${ai('cop1')}`);
  gemini.mode = 'ok'; gemini.text = '{"title":"Punchy Title"}';
  r = await call('/api/copilot/command', { token: 'tok:cop1', body: { message: 'make the title punchier', textLayers: layers, imageFilters: {}, lang: 'en' } });
  t.check('31 Copilot AI-derived title success => 1 credit', r.status === 200 && r.json.textLayers?.[0]?.text === 'Punchy Title' && ai('cop1') === 2, `${r.status} ${JSON.stringify(r.json.textLayers)} ai=${ai('cop1')}`);
  gemini.text = '{"reply":"Sure, here you go."}';
  r = await call('/api/copilot/command', { token: 'tok:cop1', body: { message: 'what can you do?', textLayers: layers, imageFilters: {}, lang: 'en' } });
  t.check('32 Copilot free-form success => reply delivered, 1 credit', r.status === 200 && r.json.reply === 'Sure, here you go.' && ai('cop1') === 3, `${r.status} ${JSON.stringify(r.json)} ai=${ai('cop1')}`);
  r = await call('/api/copilot/command', { token: 'tok:cop1', body: { message: 'what can you do?', textLayers: layers, imageFilters: {}, lang: 'en' } });
  t.check('33 Copilot at the free limit => 403 before any Gemini call', r.status === 403, `${r.status}`);

  // ---- H6: default model reaches Gemini ----
  t.check('24 default Gemini model is gemini-2.5-flash', gemini.calls.length > 0 && gemini.calls.every(c => c.model === 'gemini-2.5-flash'), JSON.stringify([...new Set(gemini.calls.map(c => c.model))]));

  // ---- frontend: Summarize no longer uploads the document ----
  const ws = fs.readFileSync('src/components/Workspace.tsx', 'utf8');
  t.check('25 Workspace Summarize flow no longer posts the PDF to /api/pdf/upload', !ws.includes("'/api/pdf/upload'"));

  h.close();
  t.finish();
}
main().catch((e) => { console.error('TEST CRASHED', e); process.exit(1); });
