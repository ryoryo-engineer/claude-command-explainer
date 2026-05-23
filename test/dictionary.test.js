// test/dictionary.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { explain } = require('../lib/dictionary');

test('rm -rf node_modules を辞書で説明できる', () => {
  const r = explain('Bash', { command: 'rm -rf node_modules' });
  assert.ok(r);
  assert.ok(r.description.includes('node_modules'));
  assert.ok(r.description.includes('削除'));
  assert.strictEqual(r.matched, true);
});

test('cd /home/foo を辞書で説明できる', () => {
  const r = explain('Bash', { command: 'cd /home/foo' });
  assert.ok(r.description.includes('/home/foo'));
  assert.ok(r.description.includes('移動'));
});

test('git push origin main を辞書で説明できる', () => {
  const r = explain('Bash', { command: 'git push origin main' });
  assert.ok(r.description.includes('origin'));
  assert.ok(r.description.includes('main'));
});

test('Edit ツールはファイルパスを埋め込んで説明できる', () => {
  const r = explain('Edit', { file_path: 'src/auth.ts', old_string: 'a', new_string: 'b' });
  assert.ok(r.description.includes('src/auth.ts'));
  assert.ok(r.description.includes('編集'));
});

test('Write ツールはファイルパスを埋め込んで説明できる', () => {
  const r = explain('Write', { file_path: 'new.md', content: '...' });
  assert.ok(r.description.includes('new.md'));
});

test('辞書に無い完全に未知のツールは null を返す', () => {
  const r = explain('UnknownTool', { foo: 'bar' });
  assert.strictEqual(r, null);
});

test('辞書に無い未知の Bash コマンドは null を返す', () => {
  const r = explain('Bash', { command: 'mysterious-cli --weird-flag' });
  assert.strictEqual(r, null);
});

test('ツール名の大文字小文字を吸収する', () => {
  const r1 = explain('edit', { file_path: 'a.ts' });
  const r2 = explain('Edit', { file_path: 'a.ts' });
  assert.strictEqual(r1.description, r2.description);
});
