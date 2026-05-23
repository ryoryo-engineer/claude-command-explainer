// test/claude-llm.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { isClaudeAvailable, askLlm } = require('../lib/claude-llm');

test('isClaudeAvailable は boolean を返す', async () => {
  const r = await isClaudeAvailable();
  assert.strictEqual(typeof r, 'boolean');
});

test('claude が無い環境では askLlm は null を返す', async () => {
  // PATH を空にして claude を見つからなくする
  const origPath = process.env.PATH;
  process.env.PATH = '';
  try {
    const r = await askLlm('Bash', { command: 'ls' }, { timeoutMs: 500 });
    assert.strictEqual(r, null);
  } finally {
    process.env.PATH = origPath;
  }
});

test('短すぎるタイムアウトでは null を返す（claude があっても）', async () => {
  if (!(await isClaudeAvailable())) return; // claude が無い環境ではスキップ
  const r = await askLlm('Bash', { command: 'ls' }, { timeoutMs: 1 });
  assert.strictEqual(r, null);
});
