const { readFile, writeFile } = require('fs/promises');
const { existsSync, writeFileSync } = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'usage.json');
const FLUSH_MS = 5000;

let cache = null;
let dirty = false;

const load = async () => {
  if (cache) return cache;
  try {
    cache = existsSync(FILE) ? JSON.parse(await readFile(FILE, 'utf8')) : { calls: [], byUser: {} };
  } catch {
    cache = { calls: [], byUser: {} };
  }
  return cache;
};

const flush = async () => {
  if (!dirty || !cache) return;
  dirty = false;
  await writeFile(FILE, JSON.stringify(cache, null, 2));
};

// Periodic async flush — never blocks a request
setInterval(flush, FLUSH_MS).unref();

// Best-effort sync write on exit
process.on('exit', () => {
  if (dirty && cache) writeFileSync(FILE, JSON.stringify(cache, null, 2));
});

const record = async (userId, model, inputTokens, outputTokens) => {
  await load();
  cache.calls.push({ ts: new Date().toISOString(), userId, model, input_tokens: inputTokens, output_tokens: outputTokens });
  const u = (cache.byUser[userId] ??= { input_tokens: 0, output_tokens: 0, calls: 0 });
  u.input_tokens  += inputTokens;
  u.output_tokens += outputTokens;
  u.calls         += 1;
  dirty = true;
};

const get = async () => { await load(); return cache; };

module.exports = { record, get };
