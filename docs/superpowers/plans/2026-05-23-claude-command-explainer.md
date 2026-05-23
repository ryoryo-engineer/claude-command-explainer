# Claude Command Explainer 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude Code が任意のツールを呼び出す直前に、何を・どこに対してしようとしているかを日本語で stderr に表示する PreToolUse hook を構築する。

**Architecture:** 単一の Node.js スクリプト（hook.js）が stdin から JSON を受け取り、辞書マッチ → 必要なら `claude -p` フォールバック → 危険度判定 → 整形して stderr に出力する。ディスクキャッシュで2回目以降は高速化。Node.js 18+ の標準ライブラリのみで動作。

**Tech Stack:** Node.js 18+（標準 `node:test` ランナー、`node:assert`、`child_process`、`crypto`、`fs`）。外部依存なし。

---

## ファイル構造

```
command-description/
├── hook.js                          # エントリーポイント
├── lib/
│   ├── dictionary.js                # 辞書ロジック
│   ├── dictionary-data.json         # 辞書本体（拡張可能）
│   ├── claude-llm.js                # claude -p ラッパー
│   ├── cache.js                     # LRU ディスクキャッシュ
│   ├── danger.js                    # 危険度判定
│   ├── formatter.js                 # stderr 出力整形
│   └── io.js                        # stdin 読み取りユーティリティ
├── test/
│   ├── formatter.test.js
│   ├── danger.test.js
│   ├── dictionary.test.js
│   ├── cache.test.js
│   ├── claude-llm.test.js
│   └── hook.integration.test.js
├── settings.example.json
├── README.md
├── package.json
├── .gitignore
└── docs/
    └── superpowers/
        ├── specs/2026-05-23-claude-command-explainer-design.md
        └── plans/2026-05-23-claude-command-explainer.md
```

各ファイルは1つの責務だけを持つ。テストは責務単位で書く。

---

## Task 1: プロジェクト初期化

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Init: git リポジトリ

- [ ] **Step 1: git init を実行**

Run: `git init -b main`
Expected: "Initialized empty Git repository in ..."

- [ ] **Step 2: package.json を作成**

```json
{
  "name": "claude-command-explainer",
  "version": "0.1.0",
  "description": "Claude Code が何をしようとしているかを日本語で表示する PreToolUse hook",
  "main": "hook.js",
  "scripts": {
    "test": "node --test test/"
  },
  "engines": {
    "node": ">=18"
  },
  "license": "MIT",
  "keywords": ["claude-code", "hook", "japanese", "non-engineer"]
}
```

- [ ] **Step 3: .gitignore を作成**

```
node_modules/
*.log
.DS_Store
.vscode/
.idea/
```

- [ ] **Step 4: 既存の docs/ ディレクトリの仕様書・計画書もコミット対象になっていることを確認**

Run: `git status`
Expected: `docs/superpowers/specs/2026-05-23-claude-command-explainer-design.md`、`docs/superpowers/plans/2026-05-23-claude-command-explainer.md`、`package.json`、`.gitignore` が untracked として表示される

- [ ] **Step 5: 初回コミット**

```bash
git add package.json .gitignore docs/
git commit -m "chore: project init with design doc and plan"
```

---

## Task 2: io.js（stdin 読み取り）

**Files:**
- Create: `lib/io.js`
- Test: `test/io.test.js`

- [ ] **Step 1: 失敗するテストを書く**

```js
// test/io.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { readStdin } = require('../lib/io');
const { spawn } = require('node:child_process');
const path = require('node:path');

test('readStdin が stdin の全データを文字列として返す', async () => {
  const script = `
    const { readStdin } = require('${path.resolve('lib/io.js').replace(/\\/g, '/')}');
    readStdin().then(s => { process.stdout.write(s); });
  `;
  const child = spawn('node', ['-e', script]);
  child.stdin.write('hello world');
  child.stdin.end();

  let out = '';
  for await (const chunk of child.stdout) out += chunk;
  assert.strictEqual(out, 'hello world');
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node --test test/io.test.js`
Expected: FAIL（`lib/io.js` がまだ存在しない）

- [ ] **Step 3: 実装を書く**

```js
// lib/io.js
function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    // 何も来ない場合のために空文字を許容（end が発火する前提）
  });
}

module.exports = { readStdin };
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `node --test test/io.test.js`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add lib/io.js test/io.test.js
git commit -m "feat: add stdin reader utility"
```

---

## Task 3: formatter.js（出力整形）

**Files:**
- Create: `lib/formatter.js`
- Test: `test/formatter.test.js`

- [ ] **Step 1: 失敗するテストを書く**

```js
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
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node --test test/formatter.test.js`
Expected: FAIL

- [ ] **Step 3: 実装を書く**

```js
// lib/formatter.js
const PREFIX = {
  destructive: '⚠️ ',
  high: '⚠️ ',
  moderate: 'ℹ️ ',
  safe: '',
};

const FOOTER = {
  destructive: '⚠️ この操作は元に戻せません',
  high: '⚠️ 権限や設定に影響します',
};

function format({ description, danger }) {
  const level = danger && danger.level ? danger.level : 'safe';
  const prefix = PREFIX[level] || '';
  const footer = FOOTER[level];

  const lines = [
    '┌─ Claude Code がやろうとしていること ─────────',
    `│ ${prefix}${description}`,
  ];
  if (footer) {
    lines.push(`│ ${footer}`);
  }
  lines.push('└──────────────────────────────────────────');

  return lines.join('\n');
}

module.exports = { format };
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `node --test test/formatter.test.js`
Expected: PASS（4 件）

- [ ] **Step 5: コミット**

```bash
git add lib/formatter.js test/formatter.test.js
git commit -m "feat: add output formatter with danger-aware decoration"
```

---

## Task 4: danger.js（危険度判定）

**Files:**
- Create: `lib/danger.js`
- Test: `test/danger.test.js`

- [ ] **Step 1: 失敗するテストを書く**

```js
// test/danger.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { getDanger } = require('../lib/danger');

test('rm -rf は destructive', () => {
  assert.strictEqual(getDanger('Bash', { command: 'rm -rf node_modules' }).level, 'destructive');
});

test('rm -fr も destructive', () => {
  assert.strictEqual(getDanger('Bash', { command: 'rm -fr /tmp/x' }).level, 'destructive');
});

test('git push --force は destructive', () => {
  assert.strictEqual(getDanger('Bash', { command: 'git push --force origin main' }).level, 'destructive');
});

test('git push -f も destructive', () => {
  assert.strictEqual(getDanger('Bash', { command: 'git push -f' }).level, 'destructive');
});

test('sudo は high', () => {
  assert.strictEqual(getDanger('Bash', { command: 'sudo apt update' }).level, 'high');
});

test('chmod -R は high', () => {
  assert.strictEqual(getDanger('Bash', { command: 'chmod -R 755 dir' }).level, 'high');
});

test('DROP TABLE は destructive', () => {
  assert.strictEqual(getDanger('Bash', { command: 'psql -c "DROP TABLE users"' }).level, 'destructive');
});

test('TRUNCATE は destructive', () => {
  assert.strictEqual(getDanger('Bash', { command: 'mysql -e "TRUNCATE logs"' }).level, 'destructive');
});

test('cd は safe', () => {
  assert.strictEqual(getDanger('Bash', { command: 'cd /home' }).level, 'safe');
});

test('ls は safe', () => {
  assert.strictEqual(getDanger('Bash', { command: 'ls -la' }).level, 'safe');
});

test('Edit はデフォルトで moderate', () => {
  assert.strictEqual(getDanger('Edit', { file_path: 'a.ts' }).level, 'moderate');
});

test('Write はデフォルトで moderate', () => {
  assert.strictEqual(getDanger('Write', { file_path: 'a.ts' }).level, 'moderate');
});

test('Read はデフォルトで safe', () => {
  assert.strictEqual(getDanger('Read', { file_path: 'a.ts' }).level, 'safe');
});

test('未知のツールは safe（保守的に過剰警告を出さない）', () => {
  assert.strictEqual(getDanger('MysteryTool', {}).level, 'safe');
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node --test test/danger.test.js`
Expected: FAIL

- [ ] **Step 3: 実装を書く**

```js
// lib/danger.js
const DANGEROUS_PATTERNS = [
  { regex: /\brm\s+-[rR][fF]?\b/, level: 'destructive' },
  { regex: /\brm\s+-[fF][rR]?\b/, level: 'destructive' },
  { regex: /git\s+push\s+.*(--force|\s-f\b)/, level: 'destructive' },
  { regex: /\bDROP\s+TABLE\b/i, level: 'destructive' },
  { regex: /\bTRUNCATE\b/i, level: 'destructive' },
  { regex: /\bsudo\b/, level: 'high' },
  { regex: /\bchmod\s+-R\b/, level: 'high' },
  { regex: /\bchown\s+-R\b/, level: 'high' },
];

const TOOL_DEFAULTS = {
  Bash: 'safe',
  Edit: 'moderate',
  Write: 'moderate',
  Read: 'safe',
};

function getDanger(toolName, toolInput) {
  if (toolName === 'Bash' && toolInput && toolInput.command) {
    for (const { regex, level } of DANGEROUS_PATTERNS) {
      if (regex.test(toolInput.command)) {
        return { level };
      }
    }
  }
  return { level: TOOL_DEFAULTS[toolName] || 'safe' };
}

module.exports = { getDanger };
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `node --test test/danger.test.js`
Expected: PASS（14 件）

- [ ] **Step 5: コミット**

```bash
git add lib/danger.js test/danger.test.js
git commit -m "feat: add danger level detection for destructive commands"
```

---

## Task 5: dictionary-data.json と dictionary.js（辞書とパターンマッチ）

**Files:**
- Create: `lib/dictionary-data.json`
- Create: `lib/dictionary.js`
- Test: `test/dictionary.test.js`

- [ ] **Step 1: 辞書データを作成**

```json
{
  "bash": {
    "patterns": [
      { "regex": "^\\s*rm\\s+-rf?\\s+(.+)$", "template": "📁 `{1}` を完全に削除しようとしています", "matched": true },
      { "regex": "^\\s*rm\\s+(.+)$", "template": "🗑️ `{1}` を削除しようとしています", "matched": true },
      { "regex": "^\\s*cd\\s+(.+)$", "template": "📂 `{1}` フォルダに移動しようとしています", "matched": true },
      { "regex": "^\\s*pwd\\s*$", "template": "現在のフォルダのパスを表示しようとしています", "matched": true },
      { "regex": "^\\s*ls(\\s+.+)?$", "template": "📋 フォルダ内のファイル一覧を表示しようとしています", "matched": true },
      { "regex": "^\\s*cat\\s+(.+)$", "template": "👁️ `{1}` の中身を表示しようとしています", "matched": true },
      { "regex": "^\\s*mkdir\\s+(?:-p\\s+)?(.+)$", "template": "📂 `{1}` フォルダを作成しようとしています", "matched": true },
      { "regex": "^\\s*mv\\s+(\\S+)\\s+(\\S+)\\s*$", "template": "✂️ `{1}` を `{2}` に移動/改名しようとしています", "matched": true },
      { "regex": "^\\s*cp\\s+(?:-r\\s+)?(\\S+)\\s+(\\S+)\\s*$", "template": "📋 `{1}` を `{2}` にコピーしようとしています", "matched": true },
      { "regex": "^\\s*git\\s+status\\b", "template": "📊 Git の変更状況を確認しようとしています", "matched": true },
      { "regex": "^\\s*git\\s+add\\s+(.+)$", "template": "➕ `{1}` を Git の次回コミット対象に追加しようとしています", "matched": true },
      { "regex": "^\\s*git\\s+commit\\b", "template": "💾 Git で現在の変更をコミットしようとしています", "matched": true },
      { "regex": "^\\s*git\\s+push\\s+(?:--force\\s+|--force-with-lease\\s+|-f\\s+)?(\\S+)\\s+(\\S+)", "template": "📤 `{1}` の `{2}` ブランチにプッシュしようとしています", "matched": true },
      { "regex": "^\\s*git\\s+push\\b", "template": "📤 Git のリモートリポジトリにプッシュしようとしています", "matched": true },
      { "regex": "^\\s*git\\s+pull\\b", "template": "📥 Git のリモートから最新の変更を取得しようとしています", "matched": true },
      { "regex": "^\\s*git\\s+checkout\\s+(\\S+)", "template": "🔀 Git で `{1}` ブランチに切り替えようとしています", "matched": true },
      { "regex": "^\\s*git\\s+branch\\b", "template": "🌿 Git のブランチを操作しようとしています", "matched": true },
      { "regex": "^\\s*git\\s+log\\b", "template": "📜 Git のコミット履歴を表示しようとしています", "matched": true },
      { "regex": "^\\s*git\\s+diff\\b", "template": "🔍 Git の変更差分を表示しようとしています", "matched": true },
      { "regex": "^\\s*npm\\s+install(\\s+.+)?$", "template": "📦 npm でパッケージをインストールしようとしています", "matched": true },
      { "regex": "^\\s*npm\\s+run\\s+(\\S+)", "template": "▶️ npm スクリプト `{1}` を実行しようとしています", "matched": true },
      { "regex": "^\\s*npm\\s+test\\b", "template": "🧪 npm のテストを実行しようとしています", "matched": true },
      { "regex": "^\\s*node\\s+(.+)$", "template": "▶️ Node.js で `{1}` を実行しようとしています", "matched": true },
      { "regex": "^\\s*echo\\b", "template": "💬 テキストを画面に出力しようとしています", "matched": true },
      { "regex": "^\\s*touch\\s+(.+)$", "template": "📄 `{1}` ファイルを作成しようとしています", "matched": true },
      { "regex": "^\\s*which\\s+(\\S+)", "template": "🔎 `{1}` コマンドの場所を確認しようとしています", "matched": true },
      { "regex": "^\\s*where\\s+(\\S+)", "template": "🔎 `{1}` コマンドの場所を確認しようとしています", "matched": true }
    ]
  },
  "edit": { "template": "✏️ `{file_path}` を編集しようとしています", "matched": true },
  "write": { "template": "📝 `{file_path}` を新規作成または上書きしようとしています", "matched": true },
  "read": { "template": "👁️ `{file_path}` を読み取ろうとしています", "matched": true },
  "glob": { "template": "🔎 `{pattern}` パターンに合うファイルを検索しようとしています", "matched": true },
  "grep": { "template": "🔍 `{pattern}` というキーワードでファイルを検索しようとしています", "matched": true },
  "bashoutput": { "template": "📊 バックグラウンドで動いているコマンドの出力を確認しようとしています", "matched": true },
  "killbash": { "template": "⏹️ バックグラウンドで動いているコマンドを停止しようとしています", "matched": true }
}
```

- [ ] **Step 2: 失敗するテストを書く**

```js
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
```

- [ ] **Step 3: テストを実行して失敗を確認**

Run: `node --test test/dictionary.test.js`
Expected: FAIL

- [ ] **Step 4: 実装を書く**

```js
// lib/dictionary.js
const fs = require('node:fs');
const path = require('node:path');

let cachedData = null;

function loadData() {
  if (cachedData) return cachedData;
  const file = path.join(__dirname, 'dictionary-data.json');
  cachedData = JSON.parse(fs.readFileSync(file, 'utf8'));
  return cachedData;
}

function applyTemplate(template, values) {
  let out = template;
  for (const [key, val] of Object.entries(values)) {
    out = out.split(`{${key}}`).join(String(val));
  }
  return out;
}

function explain(toolName, toolInput) {
  const data = loadData();
  const key = toolName.toLowerCase();

  if (key === 'bash' && toolInput && toolInput.command) {
    const patterns = (data.bash && data.bash.patterns) || [];
    for (const pat of patterns) {
      const re = new RegExp(pat.regex);
      const m = toolInput.command.match(re);
      if (m) {
        const values = {};
        for (let i = 1; i < m.length; i++) {
          values[String(i)] = m[i] === undefined ? '' : m[i].trim();
        }
        return {
          description: applyTemplate(pat.template, values),
          matched: pat.matched !== false,
        };
      }
    }
    return null;
  }

  const entry = data[key];
  if (entry && entry.template) {
    return {
      description: applyTemplate(entry.template, toolInput || {}),
      matched: entry.matched !== false,
    };
  }

  return null;
}

module.exports = { explain };
```

- [ ] **Step 5: テストを実行して成功を確認**

Run: `node --test test/dictionary.test.js`
Expected: PASS（8 件）

- [ ] **Step 6: コミット**

```bash
git add lib/dictionary.js lib/dictionary-data.json test/dictionary.test.js
git commit -m "feat: add dictionary-based command explanation with pattern matching"
```

---

## Task 6: cache.js（LRU ディスクキャッシュ）

**Files:**
- Create: `lib/cache.js`
- Test: `test/cache.test.js`

- [ ] **Step 1: 失敗するテストを書く**

```js
// test/cache.test.js
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
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node --test test/cache.test.js`
Expected: FAIL

- [ ] **Step 3: 実装を書く**

```js
// lib/cache.js
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
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `node --test test/cache.test.js`
Expected: PASS（6 件）

- [ ] **Step 5: コミット**

```bash
git add lib/cache.js test/cache.test.js
git commit -m "feat: add LRU disk cache with corruption recovery"
```

---

## Task 7: claude-llm.js（claude -p フォールバック）

**Files:**
- Create: `lib/claude-llm.js`
- Test: `test/claude-llm.test.js`

- [ ] **Step 1: 失敗するテストを書く**

```js
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
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node --test test/claude-llm.test.js`
Expected: FAIL

- [ ] **Step 3: 実装を書く**

```js
// lib/claude-llm.js
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

async function isClaudeAvailable() {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  try {
    await execFileAsync(finder, ['claude'], { timeout: 1500 });
    return true;
  } catch {
    return false;
  }
}

function buildPrompt(toolName, toolInput) {
  return [
    '次のツール呼び出しを、非エンジニアにも分かるよう日本語で1-2文で説明してください。',
    '何を、どのファイル/フォルダに対して行うかを具体的に書いてください。',
    '装飾や前置きは不要で、説明文だけを返してください。',
    '',
    `ツール: ${toolName}`,
    `入力: ${JSON.stringify(toolInput || {})}`,
  ].join('\n');
}

async function askLlm(toolName, toolInput, options = {}) {
  if (!(await isClaudeAvailable())) return null;
  const prompt = buildPrompt(toolName, toolInput);
  const execOpts = { maxBuffer: 1024 * 1024 };
  if (options.timeoutMs) execOpts.timeout = options.timeoutMs;
  try {
    const { stdout } = await execFileAsync('claude', ['-p', prompt], execOpts);
    const text = (stdout || '').trim();
    return text || null;
  } catch {
    return null;
  }
}

module.exports = { isClaudeAvailable, askLlm, buildPrompt };
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `node --test test/claude-llm.test.js`
Expected: PASS（3 件、`claude` の有無で挙動が変わる箇所は適切にスキップ）

- [ ] **Step 5: コミット**

```bash
git add lib/claude-llm.js test/claude-llm.test.js
git commit -m "feat: add claude -p fallback with availability detection"
```

---

## Task 8: hook.js（統合エントリーポイント）

**Files:**
- Create: `hook.js`
- Test: `test/hook.integration.test.js`

- [ ] **Step 1: 失敗するテストを書く**

```js
// test/hook.integration.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const HOOK = path.resolve(__dirname, '..', 'hook.js');
const TMP_CACHE = path.join(os.tmpdir(), 'cce-hook-test-' + Date.now() + '.json');

function runHook(input) {
  return new Promise((resolve) => {
    const child = spawn('node', [HOOK], {
      env: { ...process.env, CCE_CACHE_PATH: TMP_CACHE, PATH: '' }, // PATH 空にして claude を呼ばせない
    });
    let out = '', err = '';
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (err += c));
    child.on('close', (code) => resolve({ code, out, err }));
    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}

test('辞書ヒットケース：rm -rf node_modules で日本語説明が出る', async () => {
  fs.rmSync(TMP_CACHE, { force: true });
  const { code, err } = await runHook({
    tool_name: 'Bash',
    tool_input: { command: 'rm -rf node_modules' },
  });
  assert.strictEqual(code, 0);
  assert.ok(err.includes('node_modules'));
  assert.ok(err.includes('削除'));
  assert.ok(err.includes('⚠️'));
  assert.ok(err.includes('元に戻せません'));
});

test('Edit ツールでファイルパスが説明に含まれる', async () => {
  fs.rmSync(TMP_CACHE, { force: true });
  const { code, err } = await runHook({
    tool_name: 'Edit',
    tool_input: { file_path: 'src/auth.ts', old_string: 'a', new_string: 'b' },
  });
  assert.strictEqual(code, 0);
  assert.ok(err.includes('src/auth.ts'));
  assert.ok(err.includes('編集'));
});

test('未知のツール + 未知のコマンド + claude無しでも exit 0', async () => {
  fs.rmSync(TMP_CACHE, { force: true });
  const { code, err } = await runHook({
    tool_name: 'MysteryTool',
    tool_input: { foo: 'bar' },
  });
  assert.strictEqual(code, 0);
  // 「不明」表示が出る
  assert.ok(err.includes('不明') || err.includes('Claude Code'));
});

test('JSON が壊れていても exit 0', async () => {
  const child = spawn('node', [HOOK], {
    env: { ...process.env, CCE_CACHE_PATH: TMP_CACHE, PATH: '' },
  });
  child.stdin.write('this is not json');
  child.stdin.end();
  const code = await new Promise((r) => child.on('close', r));
  assert.strictEqual(code, 0);
});

test('2回目の同じコマンドはキャッシュから取れる（キャッシュファイルが更新される）', async () => {
  fs.rmSync(TMP_CACHE, { force: true });
  await runHook({ tool_name: 'Bash', tool_input: { command: 'ls' } });
  assert.ok(fs.existsSync(TMP_CACHE));
  const first = fs.readFileSync(TMP_CACHE, 'utf8');
  await runHook({ tool_name: 'Bash', tool_input: { command: 'ls' } });
  const second = fs.readFileSync(TMP_CACHE, 'utf8');
  // 何らかの内容があり、2回目もエラーにならない
  assert.ok(first.length > 0);
  assert.ok(second.length > 0);
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node --test test/hook.integration.test.js`
Expected: FAIL

- [ ] **Step 3: 実装を書く**

```js
// hook.js
#!/usr/bin/env node
const { readStdin } = require('./lib/io');
const { explain } = require('./lib/dictionary');
const { askLlm } = require('./lib/claude-llm');
const { get: cacheGet, set: cacheSet } = require('./lib/cache');
const { getDanger } = require('./lib/danger');
const { format } = require('./lib/formatter');

async function generateExplanation(toolName, toolInput) {
  const dict = explain(toolName, toolInput);
  if (dict && dict.matched) return dict.description;

  const llm = await askLlm(toolName, toolInput, { timeoutMs: parseTimeout() });
  if (llm) return llm;

  if (dict && dict.description) return dict.description;
  return '不明なツール呼び出しです。許可する前に内容を確認してください。';
}

function parseTimeout() {
  const v = process.env.CCE_LLM_TIMEOUT_MS;
  if (!v) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

async function main() {
  try {
    const raw = await readStdin();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      process.exit(0);
    }
    if (!data || typeof data !== 'object' || !data.tool_name) {
      process.exit(0);
    }

    const toolName = data.tool_name;
    const toolInput = data.tool_input || {};

    let cached = cacheGet(toolName, toolInput);
    let description;
    if (cached && cached.description) {
      description = cached.description;
    } else {
      description = await generateExplanation(toolName, toolInput);
      cacheSet(toolName, toolInput, { description });
    }

    const danger = getDanger(toolName, toolInput);
    const output = format({ description, danger });
    process.stderr.write(output + '\n');
    process.exit(0);
  } catch {
    process.exit(0);
  }
}

main();
```

- [ ] **Step 4: 実行権限を付与（Unix系のみ。Windowsは不要）**

Run (Mac/Linux): `chmod +x hook.js`
Windows ではこの手順はスキップ。

- [ ] **Step 5: テストを実行して成功を確認**

Run: `node --test test/hook.integration.test.js`
Expected: PASS（5 件）

- [ ] **Step 6: 全テスト走らせて全部通ることを確認**

Run: `node --test test/`
Expected: 全テスト PASS（合計 36 件以上）

- [ ] **Step 7: コミット**

```bash
git add hook.js test/hook.integration.test.js
git commit -m "feat: add hook entrypoint integrating dictionary, llm, cache, danger, formatter"
```

---

## Task 9: README と settings.example.json

**Files:**
- Create: `README.md`
- Create: `settings.example.json`

- [ ] **Step 1: settings.example.json を作成**

注意：`<absolute-path>` の部分は、ユーザーがインストール後に自分のパスに置き換える前提。README で説明する。

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node <absolute-path-to>/hook.js"
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: README.md を作成**

```markdown
# claude-command-explainer

Claude Code がコマンドを実行する前に、**何を・どのファイル/フォルダに対して・しようとしているのか** を日本語で表示する PreToolUse hook です。

非エンジニアの方や、初めて見るコマンドが不安な方が、安心して許可ボタンを押せるようにすることが目的です。

## 表示例

```
┌─ Claude Code がやろうとしていること ─────────
│ ⚠️ 📁 `node_modules` を完全に削除しようとしています
│ ⚠️ この操作は元に戻せません
└──────────────────────────────────────────
```

## 動作の仕組み

1. Claude Code がツールを呼び出す直前に hook が起動
2. 辞書ベースのパターンマッチでよくあるコマンドを高速に説明
3. 辞書に無いコマンドは `claude -p` を使って LLM で詳細な説明を生成（要 Claude CLI）
4. 同じコマンドは LRU キャッシュで2回目以降は即時表示
5. 破壊的な操作（rm -rf, --force, DROP TABLE 等）には警告マークを付与

`claude` コマンドが PATH に無い場合（Claude Code デスクトップ版のみインストール）は、辞書ベースだけで動作します。

## 必要なもの

- Node.js 18 以上
- Claude Code（デスクトップ版または CLI 版）

## インストール

### 1. このリポジトリをクローン

```bash
git clone https://github.com/<your-username>/claude-command-explainer.git
cd claude-command-explainer
```

### 2. hook のフルパスを確認

```bash
# Mac/Linux
echo "$(pwd)/hook.js"
# Windows (PowerShell)
echo "$($PWD.Path)\hook.js"
```

このパスをメモしておきます。

### 3. settings.json に hook を登録

`~/.claude/settings.json`（無ければ作成）に以下を追加：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node /絶対パス/claude-command-explainer/hook.js"
          }
        ]
      }
    ]
  }
}
```

`/絶対パス/...` の部分を、手順 2 でメモしたパスに置き換えてください。

### 4. 動作確認

Claude Code を再起動し、何か簡単な操作（例：`ls` を実行）を頼んでみてください。許可ダイアログの前に日本語の説明が表示されれば成功です。

## カスタマイズ

### 辞書を増やす

`lib/dictionary-data.json` を編集すると、独自のコマンドや MCP ツールに対応する説明を追加できます。

```json
{
  "bash": {
    "patterns": [
      {
        "regex": "^my-cli\\s+(.+)$",
        "template": "🛠️ 自社ツールで `{1}` を実行しようとしています",
        "matched": true
      }
    ]
  }
}
```

### LLM 呼び出しのタイムアウト

環境変数 `CCE_LLM_TIMEOUT_MS` を設定すると、`claude -p` のタイムアウトをミリ秒単位で指定できます。未指定なら無制限（応答を待つ）。

### キャッシュをリセット

`~/.claude/command-description-cache.json` を削除してください。

## トラブルシューティング

### 説明が表示されない

- Claude Code を完全に再起動してみてください
- `settings.json` のパスが正しいか確認してください
- `node /パス/hook.js < /dev/null` を実行してエラーが出ないか確認してください（exit 0 で何も出なければ正常）

### claude コマンドがあるはずなのに辞書だけ使われる

- ターミナルで `which claude`（Windows は `where claude`）が成功するか確認してください
- hook を実行するシェル環境で PATH が通っているか確認してください

## テスト

```bash
node --test test/
```

## ライセンス

MIT

## 貢献

辞書の充実は大歓迎です。`lib/dictionary-data.json` にエントリを追加して PR を送ってください。
```

- [ ] **Step 3: コミット**

```bash
git add README.md settings.example.json
git commit -m "docs: add README and settings.example.json"
```

---

## Task 10: GitHub リポジトリ作成とプッシュ

**Files:**
- なし（gh CLI を使った操作のみ）

- [ ] **Step 1: gh CLI が使えることを確認**

Run: `gh auth status`
Expected: `Logged in to github.com as <username>`

- [ ] **Step 2: GitHub にパブリックリポジトリを作成（リモート追加とプッシュも自動）**

Run: `gh repo create claude-command-explainer --public --source=. --description "Claude Code が何をしようとしているかを日本語で表示する PreToolUse hook" --push`
Expected: `https://github.com/<username>/claude-command-explainer` が出力される

- [ ] **Step 3: 作成されたリポジトリの URL を README の「git clone」セクションに反映**

`https://github.com/<your-username>/claude-command-explainer.git` の `<your-username>` を実際のユーザー名に置換。

- [ ] **Step 4: README の修正をコミットしてプッシュ**

```bash
git add README.md
git commit -m "docs: update clone URL to actual GitHub repo"
git push
```

---

## Task 11: 手動動作確認

**Files:**
- Modify: ローカルの `~/.claude/settings.json`（一時的に hook を有効化して検証）

- [ ] **Step 1: 現在の `~/.claude/settings.json` をバックアップ**

```bash
# Windows PowerShell
copy "$env:USERPROFILE\.claude\settings.json" "$env:USERPROFILE\.claude\settings.json.bak"
```

- [ ] **Step 2: settings.json に hook を追記（既存の設定を残したまま）**

ユーザーに手動で行ってもらう。README の手順に従って、絶対パスで `hook.js` を指定。

- [ ] **Step 3: Claude Code を再起動して、簡単なコマンドを実行させる**

例：「カレントディレクトリを ls して」と依頼。許可ダイアログが出る前に日本語の説明が表示されることを確認。

- [ ] **Step 4: 危険なコマンドの表示も確認**

例：「`/tmp/test-folder` を rm -rf で削除して」と依頼（実際に削除する必要はなく、許可ダイアログで拒否すれば OK）。⚠️ マークと「元に戻せません」表示が出ることを確認。

- [ ] **Step 5: stderr 出力がデスクトップ版でも見えるかを実機で確認**

これが見えない場合は、代替の出力経路を検討する必要がある（フォローアップタスクとして spec の「既知のリスク」セクションに記録済み）。

- [ ] **Step 6: 問題があれば issue を切る／問題なければ完了**

```bash
gh issue create --title "<タイトル>" --body "<再現手順と期待される挙動>"
```
（必要に応じて）

---

## 完了基準

- すべての自動テストが PASS（合計 36 件以上）
- 手動動作確認で、辞書ヒット・LLM フォールバック・危険度警告のいずれも期待通りに表示される
- GitHub に公開され、README の手順だけで第三者がインストール・利用できる状態
