#!/usr/bin/env node
// hook.js - Claude Code PreToolUse フックのエントリーポイント
// stdin から JSON を受け取り、stderr に整形済み日本語説明を出力する

const { readStdin } = require('./lib/io');
const { explain } = require('./lib/dictionary');
const { askLlm } = require('./lib/claude-llm');
const { get: cacheGet, set: cacheSet } = require('./lib/cache');
const { getDanger } = require('./lib/danger');
const { format } = require('./lib/formatter');

/**
 * タイムアウト設定を環境変数から読み込む
 * @returns {number | undefined}
 */
function parseTimeout() {
  const v = process.env.CCE_LLM_TIMEOUT_MS;
  if (!v) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * ツール名と入力から日本語説明を生成する
 * 優先順位: 辞書ヒット（matched） > LLM > 辞書フォールバック > デフォルト文言
 * @param {string} toolName
 * @param {object} toolInput
 * @returns {Promise<string>}
 */
async function generateExplanation(toolName, toolInput) {
  // 1. 辞書を引いて完全マッチがあればそれを返す
  const dict = explain(toolName, toolInput);
  if (dict && dict.matched) return dict.description;

  // 2. LLMに問い合わせる（claude が利用できない場合は null）
  const llm = await askLlm(toolName, toolInput, { timeoutMs: parseTimeout() });
  if (llm) return llm;

  // 3. 辞書に部分マッチがあればフォールバックとして使う
  if (dict && dict.description) return dict.description;

  // 4. 最終フォールバック
  return '不明なツール呼び出しです。許可する前に内容を確認してください。';
}

async function main() {
  try {
    // stdin から JSON を読み込む
    const raw = await readStdin();

    // JSON パース失敗は静かに exit 0
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      process.exit(0);
    }

    // 不正なデータは静かに exit 0
    if (!data || typeof data !== 'object' || !data.tool_name) {
      process.exit(0);
    }

    const toolName = data.tool_name;
    const toolInput = data.tool_input || {};

    // キャッシュを確認する
    let cached = cacheGet(toolName, toolInput);
    let description;
    if (cached && cached.description) {
      description = cached.description;
    } else {
      // キャッシュミスの場合は説明を生成してキャッシュに保存
      description = await generateExplanation(toolName, toolInput);
      cacheSet(toolName, toolInput, { description });
    }

    // 危険度を判定して整形済み出力を stderr に書く
    const danger = getDanger(toolName, toolInput);
    const output = format({ description, danger });
    process.stderr.write(output + '\n');
    process.exit(0);
  } catch {
    // 予期しないエラーも静かに exit 0（フックがツール実行をブロックしないため）
    process.exit(0);
  }
}

main();
