// Child process used by gemini_model_test.ts: boots the real server with
// whatever GEMINI_MODEL the parent set, calls one AI route, prints the model
// name Gemini actually received.
import { boot } from './harness';
(async () => {
  const h = await boot();
  h.supa.addUser('u1');
  await h.call('/api/summarize', { token: 'tok:u1', body: { text: 'hello' } });
  await h.call('/api/pdf/ocr', { token: 'tok:u1', body: { imageBase64: 'aGk=' } });
  process.stdout.write('\nMODELS=' + JSON.stringify([...new Set(h.gemini.calls.map(c => c.model))]) + '\n');
  h.close();
  process.exit(0);
})();
