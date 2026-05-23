#!/usr/bin/env node
// hook.js - Claude Code PreToolUse フックのエントリーポイント
// stdin から JSON を受け取り、stdout に hook 用 JSON を返す。
//   - hookSpecificOutput.permissionDecisionReason: 許可ダイアログにも表示される説明
//   - hookSpecificOutput.additionalContext: Claude に渡される追加コンテキスト
//   - systemMessage: ユーザーへのフォールバック通知
// 既存の許可フローを邪魔しないため permissionDecision は出力しない。

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

/**
 * 静かに正常終了する（ツール実行をブロックしないため exit 0）
 */
function exitQuietly() {
  process.exit(0);
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
      return exitQuietly();
    }

    // 不正なデータは静かに exit 0
    if (!data || typeof data !== 'object' || !data.tool_name) {
      return exitQuietly();
    }

    const toolName = data.tool_name;
    const toolInput = data.tool_input || {};

    // キャッシュを確認する
    const cached = cacheGet(toolName, toolInput);
    let description;
    if (cached && cached.description) {
      description = cached.description;
    } else {
      // キャッシュミスの場合は説明を生成してキャッシュに保存
      description = await generateExplanation(toolName, toolInput);
      cacheSet(toolName, toolInput, { description });
    }

    // 危険度を判定して整形した日本語説明を組み立てる
    const danger = getDanger(toolName, toolInput);
    const formatted = format({ description, danger });

    // Claude Code に対して JSON を返す
    //   - permissionDecisionReason: ユーザーが許可ダイアログを見るときに表示される
    //   - additionalContext: Claude に渡される（モデルが文脈を理解するのに役立つ）
    //   - systemMessage: ユーザーへの通知としてチャット領域に表示される
    // permissionDecision は省略 → 既存の許可フロー（matcher の allow/ask/deny ルール）に従う
    const hookOutput = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecisionReason: formatted,
        additionalContext: `日本語説明: ${description}\n危険度: ${danger.level}`,
      },
      systemMessage: formatted,
    };

    process.stdout.write(JSON.stringify(hookOutput));
    // stderr にも書く（デバッグ用。デスクトップ版UIには出ないがログには残る）
    process.stderr.write(formatted + '\n');
    process.exit(0);
  } catch {
    // 予期しないエラーも静かに exit 0（フックがツール実行をブロックしないため）
    process.exit(0);
  }
}

main();
