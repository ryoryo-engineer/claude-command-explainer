// test/formatter.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { format } = require('../lib/formatter');

test('安全な操作は説明のみで、警告アイコンは含まない', () => {
  const out = format({ description: 'フォルダに移動しようとしています', danger: { level: 'safe' } });
  assert.ok(out.includes('フォルダに移動しようとしています'));
  assert.ok(!out.includes('⚠️'));
  assert.ok(!out.includes('ℹ️'));
});

test('破壊的操作は ⚠️ とフッター警告を含む', () => {
  const out = format({
    description: '`node_modules` を完全に削除しようとしています',
    danger: { level: 'destructive' },
  });
  assert.ok(out.includes('⚠️'));
  assert.ok(out.includes('node_modules'));
  assert.ok(out.includes('元に戻せません'));
});

test('moderate は ℹ️ を含み、フッター無し', () => {
  const out = format({
    description: '`src/auth.ts` を編集しようとしています',
    danger: { level: 'moderate' },
  });
  assert.ok(out.includes('ℹ️'));
  assert.ok(!out.includes('元に戻せません'));
});

test('high は ⚠️ と権限フッター', () => {
  const out = format({
    description: 'sudo で実行しようとしています',
    danger: { level: 'high' },
  });
  assert.ok(out.includes('⚠️'));
  assert.ok(out.includes('権限'));
});

test('罫線（┌, │, └）は含まない（Claude Code側の枠描画と二重にならないため）', () => {
  const out = format({ description: 'テスト', danger: { level: 'destructive' } });
  assert.ok(!out.includes('┌'));
  assert.ok(!out.includes('│'));
  assert.ok(!out.includes('└'));
  assert.ok(!out.includes('─'));
});

test('安全な操作は1行で完結する（フッターなし）', () => {
  const out = format({ description: 'フォルダに移動しようとしています', danger: { level: 'safe' } });
  assert.strictEqual(out.split('\n').length, 1);
});

test('破壊的操作は説明＋フッターの2行になる', () => {
  const out = format({
    description: '`node_modules` を削除しようとしています',
    danger: { level: 'destructive' },
  });
  assert.strictEqual(out.split('\n').length, 2);
});
