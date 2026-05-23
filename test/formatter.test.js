// test/formatter.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { format } = require('../lib/formatter');

test('安全な操作は罫線とアイコン無し説明のみ', () => {
  const out = format({ description: 'フォルダに移動しようとしています', danger: { level: 'safe' } });
  assert.ok(out.includes('Claude Code がやろうとしていること'));
  assert.ok(out.includes('フォルダに移動しようとしています'));
  assert.ok(!out.includes('⚠️'));
});

test('破壊的操作は ⚠️ とフッター警告を含む', () => {
  const out = format({
    description: '`node_modules` を完全に削除しようとしています',
    danger: { level: 'destructive' },
  });
  assert.ok(out.includes('⚠️'));
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
