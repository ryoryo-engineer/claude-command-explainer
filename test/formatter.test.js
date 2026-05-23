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

test('ヘッダーとフッターの見た目の幅が同じになる（日本語は2倍幅で計算）', () => {
  const out = format({ description: 'テスト', danger: { level: 'safe' } });
  const lines = out.split('\n');
  const headerLine = lines.find(l => l.includes('実行しようとしていること'));
  const footerLine = lines.reverse().find(l => /^\*+$/.test(l));

  // 表示幅計算（formatter.js の displayWidth と同じロジック）
  function w(s) {
    let n = 0;
    for (const ch of s) {
      const cp = ch.codePointAt(0);
      if (cp === undefined) continue;
      if (cp >= 0x1F000) { n += 2; continue; }
      if (
        (cp >= 0x1100 && cp <= 0x115F) ||
        (cp >= 0x2E80 && cp <= 0x303E) ||
        (cp >= 0x3041 && cp <= 0x33FF) ||
        (cp >= 0x3400 && cp <= 0x4DBF) ||
        (cp >= 0x4E00 && cp <= 0x9FFF) ||
        (cp >= 0xA000 && cp <= 0xA4CF) ||
        (cp >= 0xAC00 && cp <= 0xD7A3) ||
        (cp >= 0xF900 && cp <= 0xFAFF) ||
        (cp >= 0xFE30 && cp <= 0xFE4F) ||
        (cp >= 0xFF00 && cp <= 0xFF60) ||
        (cp >= 0xFFE0 && cp <= 0xFFE6)
      ) { n += 2; } else { n += 1; }
    }
    return n;
  }
  // ANSI コードを除去してから幅を測る（CCE_NO_COLOR=1 設定だけど念のため）
  const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
  assert.strictEqual(w(strip(headerLine)), w(strip(footerLine)));
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
