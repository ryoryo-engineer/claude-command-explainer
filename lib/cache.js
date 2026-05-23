const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const MAX_ENTRIES = 1000;

function cachePath() {
  return process.env.CCE_CACHE_PATH ||
    path.join(os.homedir(), '.claude', 'command-description-cache.json');
}

function hashKey(toolName, toolInput) {
  const raw = toolName + '::' + JSON.stringify(toolInput || {});
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function load() {
  try {
    const content = fs.readFileSync(cachePath(), 'utf8');
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object') return parsed;
    return {};
  } catch {
    return {};
  }
}

function save(cache) {
  try {
    fs.mkdirSync(path.dirname(cachePath()), { recursive: true });
    fs.writeFileSync(cachePath(), JSON.stringify(cache));
  } catch {
    // 書けない場合は無視（hookは止めない）
  }
}

function evict(cache) {
  const keys = Object.keys(cache);
  if (keys.length <= MAX_ENTRIES) return cache;
  keys.sort((a, b) => (cache[a].accessed || 0) - (cache[b].accessed || 0));
  const toRemove = keys.slice(0, keys.length - MAX_ENTRIES);
  for (const k of toRemove) delete cache[k];
  return cache;
}

function get(toolName, toolInput) {
  const cache = load();
  const key = hashKey(toolName, toolInput);
  const entry = cache[key];
  if (!entry) return null;
  entry.accessed = Date.now();
  cache[key] = entry;
  save(cache);
  return entry.value;
}

function set(toolName, toolInput, value) {
  const cache = load();
  const key = hashKey(toolName, toolInput);
  cache[key] = { value, accessed: Date.now() };
  evict(cache);
  save(cache);
}

function _clear() {
  try { fs.rmSync(cachePath(), { force: true }); } catch {}
}

module.exports = { get, set, _clear };
