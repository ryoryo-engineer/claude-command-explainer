// lib/formatter.js
// 危険度ごとにプレフィックス絵文字とフッター警告を付ける整形。
// 見出しと区切り線で視覚的に説明部分を分かりやすくする。
// ANSI カラー対応（CCE_NO_COLOR=1 で無効化可能）。

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

// ANSI エスケープシーケンスによる色付け
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const COLOR = {
  destructive: '\x1b[31m', // 赤
  high: '\x1b[33m',        // 黄
  moderate: '\x1b[36m',    // シアン
  safe: '\x1b[32m',        // 緑
};

const SEPARATOR = '*'.repeat(15);

/**
 * カラー有効か判定。
 * - CCE_NO_COLOR=1 / "true" のときは無効
 * - 標準の NO_COLOR 環境変数（https://no-color.org）も尊重
 */
function colorEnabled() {
  const off = process.env.CCE_NO_COLOR;
  if (off === '1' || off === 'true') return false;
  if (process.env.NO_COLOR) return false;
  return true;
}

/**
 * 説明と危険度から、UIに表示するテキストを組み立てる。
 *
 * 出力例（destructive）:
 *
 *   *************** このコマンドで実行しようとしていること ***************
 *
 *   ⚠️ `node_modules` を完全に削除しようとしています
 *   ⚠️ この操作は元に戻せません
 *
 *   **********************************************************************
 *
 * @param {{description: string, danger?: {level: string}}} arg
 * @returns {string}
 */
function format({ description, danger }) {
  const level = (danger && danger.level) || 'safe';
  const prefix = PREFIX[level] || '';
  const footer = FOOTER[level];

  const useColor = colorEnabled();
  const colorOn = useColor ? COLOR[level] + BOLD : '';
  const colorOff = useColor ? RESET : '';

  const headerText = `${SEPARATOR} このコマンドで実行しようとしていること ${SEPARATOR}`;
  const footerText = '*'.repeat(headerText.length);

  const header = `${colorOn}${headerText}${colorOff}`;
  const footerLine = `${colorOn}${footerText}${colorOff}`;

  const lines = [
    '',
    header,
    '',
    `${prefix}${description}`,
  ];
  if (footer) {
    lines.push(footer);
  }
  lines.push('');
  lines.push(footerLine);
  lines.push('');

  return lines.join('\n');
}

module.exports = { format };
