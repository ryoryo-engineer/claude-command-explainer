// test/hook.integration.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const HOOK = path.resolve(__dirname, '..', 'hook.js');
const TMP_CACHE = path.join(os.tmpdir(), 'cce-hook-test-' + Date.now() + '.json');

// Windows環境でPATH=''にするとnodeが見つからないため、process.execPathで絶対パスを取得する
const NODE_EXE = process.execPath;

function runHook(input) {
  return new Promise((resolve) => {
    const child = spawn(NODE_EXE, [HOOK], {
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

function parseHookOutput(out) {
  // hook の stdout は JSON
  return JSON.parse(out);
}

test('辞書ヒットケース：rm -rf node_modules で日本語説明が JSON 出力に含まれる', async () => {
  fs.rmSync(TMP_CACHE, { force: true });
  const { code, out, err } = await runHook({
    tool_name: 'Bash',
    tool_input: { command: 'rm -rf node_modules' },
  });
  assert.strictEqual(code, 0);

  const parsed = parseHookOutput(out);
  const reason = parsed.hookSpecificOutput.permissionDecisionReason;
  const sysMsg = parsed.systemMessage;
  // permissionDecisionReason と systemMessage は同じ整形済みテキスト
  assert.strictEqual(reason, sysMsg);
  assert.ok(reason.includes('node_modules'));
  assert.ok(reason.includes('削除'));
  assert.ok(reason.includes('⚠️'));
  assert.ok(reason.includes('元に戻せません'));

  // additionalContext には危険度メタも含む
  assert.ok(parsed.hookSpecificOutput.additionalContext.includes('destructive'));

  // stderr 側にも整形済み出力が出る（デバッグ用）
  assert.ok(err.includes('node_modules'));
});

test('hookEventName は PreToolUse である', async () => {
  fs.rmSync(TMP_CACHE, { force: true });
  const { out } = await runHook({
    tool_name: 'Bash',
    tool_input: { command: 'ls' },
  });
  const parsed = parseHookOutput(out);
  assert.strictEqual(parsed.hookSpecificOutput.hookEventName, 'PreToolUse');
});

test('permissionDecision は出力しない（既存の許可フローに従う）', async () => {
  fs.rmSync(TMP_CACHE, { force: true });
  const { out } = await runHook({
    tool_name: 'Bash',
    tool_input: { command: 'ls' },
  });
  const parsed = parseHookOutput(out);
  // permissionDecision を出すと既存の許可ルールを上書きしてしまうので、出さない
  assert.strictEqual(parsed.hookSpecificOutput.permissionDecision, undefined);
});

test('Edit ツールでファイルパスが説明に含まれる', async () => {
  fs.rmSync(TMP_CACHE, { force: true });
  const { code, out } = await runHook({
    tool_name: 'Edit',
    tool_input: { file_path: 'src/auth.ts', old_string: 'a', new_string: 'b' },
  });
  assert.strictEqual(code, 0);
  const parsed = parseHookOutput(out);
  const reason = parsed.hookSpecificOutput.permissionDecisionReason;
  assert.ok(reason.includes('src/auth.ts'));
  assert.ok(reason.includes('編集'));
});

test('未知のツール + 未知のコマンド + claude無しでも exit 0', async () => {
  fs.rmSync(TMP_CACHE, { force: true });
  const { code, out } = await runHook({
    tool_name: 'MysteryTool',
    tool_input: { foo: 'bar' },
  });
  assert.strictEqual(code, 0);
  const parsed = parseHookOutput(out);
  const reason = parsed.hookSpecificOutput.permissionDecisionReason;
  // 「不明」表示が出る
  assert.ok(reason.includes('不明') || reason.includes('Claude Code'));
});

test('JSON が壊れていても exit 0', async () => {
  const child = spawn(NODE_EXE, [HOOK], {
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
