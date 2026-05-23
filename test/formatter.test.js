// test/formatter.test.js
// テスト時は ANSI カラーを無効化して文字列比較しやすくする
process.env.CCE_NO_COLOR = '1';

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

test('見出し「このコマンドで実行しようとしていること」を含む', () => {
  const out = format({ description: 'テスト', danger: { level: 'safe' } });
  assert.ok(out.includes('このコマンドで実行しようとしていること'));
});

test('アスタリスク区切り（*****）が見出し前後にある', () => {
  const out = format({ description: 'テスト', danger: { level: 'safe' } });
  assert.ok(out.includes('***************'));
});

test('先頭と末尾は空行になる（視覚的余白）', () => {
  const out = format({ description: 'テスト', danger: { level: 'safe' } });
  const lines = out.split('\n');
  assert.strictEqual(lines[0], '');
  assert.strictEqual(lines[lines.length - 1], '');
});

test('見出しと説明の間にも空行がある', () => {
  const out = format({ description: 'テスト本文', danger: { level: 'safe' } });
  const lines = out.split('\n');
  // [0]='' [1]=見出し [2]='' [3]='テスト本文' [4]='' [5]=フッター区切り [6]=''
  const headerIdx = lines.findIndex(l => l.includes('実行しようとしていること'));
  const bodyIdx = lines.findIndex(l => l.includes('テスト本文'));
  assert.ok(headerIdx >= 0);
  assert.ok(bodyIdx > headerIdx);
  // 見出しと本文の間に空行がある
  assert.strictEqual(lines[headerIdx + 1], '');
});

test('CCE_NO_COLOR=1 のとき ANSI エスケープシーケンスを含まない', () => {
  const out = format({ description: 'テスト', danger: { level: 'destructive' } });
  assert.ok(!out.includes('\x1b['));
});

test('カラー有効時は ANSI エスケープシーケンスを含む', () => {
  delete process.env.CCE_NO_COLOR;
  delete process.env.NO_COLOR;
  // モジュールキャッシュをクリアしてカラー判定を再評価させる
  delete require.cache[require.resolve('../lib/formatter')];
  const { format: formatColored } = require('../lib/formatter');
  const out = formatColored({ description: 'テスト', danger: { level: 'destructive' } });
  assert.ok(out.includes('\x1b['));
  // 色付け後は CCE_NO_COLOR を戻す
  process.env.CCE_NO_COLOR = '1';
});

test('罫線（┌, │, └）は含まない（旧仕様のクリーンアップ確認）', () => {
  const out = format({ description: 'テスト', danger: { level: 'destructive' } });
  assert.ok(!out.includes('┌'));
  assert.ok(!out.includes('│'));
  assert.ok(!out.includes('└'));
  assert.ok(!out.includes('─'));
});
