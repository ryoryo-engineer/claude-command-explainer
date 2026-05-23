const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// テスト用に環境変数でキャッシュパスを上書き可能にする
const TEST_CACHE_DIR = path.join(os.tmpdir(), 'cce-test-' + Date.now());
process.env.CCE_CACHE_PATH = path.join(TEST_CACHE_DIR, 'cache.json');

const { get, set, _clear } = require('../lib/cache');

beforeEach(() => {
  _clear();
});

test('set した値を get で取り出せる', () => {
  set('Bash', { command: 'ls' }, { description: 'リスト', matched: true });
  const v = get('Bash', { command: 'ls' });
  assert.deepStrictEqual(v, { description: 'リスト', matched: true });
});

test('別のキーは別エントリ', () => {
  set('Bash', { command: 'ls' }, { description: 'A' });
  set('Bash', { command: 'pwd' }, { description: 'B' });
  assert.strictEqual(get('Bash', { command: 'ls' }).description, 'A');
  assert.strictEqual(get('Bash', { command: 'pwd' }).description, 'B');
});

test('未登録のキーは null', () => {
  assert.strictEqual(get('Bash', { command: 'unknown' }), null);
});

test('キャッシュは永続化される（再 require しても残る）', () => {
  set('Edit', { file_path: 'a.ts' }, { description: 'X' });
  // モジュールキャッシュをクリアして再ロード
  delete require.cache[require.resolve('../lib/cache')];
  const { get: get2 } = require('../lib/cache');
  assert.strictEqual(get2('Edit', { file_path: 'a.ts' }).description, 'X');
});

test('壊れたキャッシュファイルは復旧される', () => {
  fs.mkdirSync(path.dirname(process.env.CCE_CACHE_PATH), { recursive: true });
  fs.writeFileSync(process.env.CCE_CACHE_PATH, '{ not json }');
  // 壊れたファイルがあっても set/get がエラーにならない
  set('Bash', { command: 'ls' }, { description: 'OK' });
  assert.strictEqual(get('Bash', { command: 'ls' }).description, 'OK');
});

test('LRU で 1000 件を超えると古いものから削除される', () => {
  for (let i = 0; i < 1005; i++) {
    set('Bash', { command: `cmd-${i}` }, { description: `desc-${i}` });
  }
  // 古い 5 件は削除されているはず
  assert.strictEqual(get('Bash', { command: 'cmd-0' }), null);
  assert.strictEqual(get('Bash', { command: 'cmd-4' }), null);
  // 新しいものは残っている
  assert.ok(get('Bash', { command: 'cmd-1004' }));
});
