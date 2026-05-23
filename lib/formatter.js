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
 * 文字列をターミナル上に表示したときの「マス目の数」を返す。
 * 日本語（CJK）や絵文字は 2 マス、ASCII などは 1 マスとして計算する。
 * これでヘッダーとフッターの見た目の長さを揃えられる。
 *
 * @param {string} str
 * @returns {number}
 */
function displayWidth(str) {
  let width = 0;
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    // 0x1F000 以上は絵文字や記号類 → 2マス想定
    if (cp >= 0x1F000) { width += 2; continue; }
    // CJK・全角記号・ハングル等
    if (
      (cp >= 0x1100 && cp <= 0x115F) ||  // Hangul Jamo
      (cp >= 0x2E80 && cp <= 0x303E) ||  // CJK Radicals, Kangxi, ideographic
      (cp >= 0x3041 && cp <= 0x33FF) ||  // ひらがな・カタカナ・CJK 記号
      (cp >= 0x3400 && cp <= 0x4DBF) ||  // CJK Extension A
      (cp >= 0x4E00 && cp <= 0x9FFF) ||  // CJK Unified Ideographs
      (cp >= 0xA000 && cp <= 0xA4CF) ||  // Yi
      (cp >= 0xAC00 && cp <= 0xD7A3) ||  // Hangul Syllables
      (cp >= 0xF900 && cp <= 0xFAFF) ||  // CJK Compatibility Ideographs
      (cp >= 0xFE30 && cp <= 0xFE4F) ||  // CJK Compatibility Forms
      (cp >= 0xFF00 && cp <= 0xFF60) ||  // 全角英数記号
      (cp >= 0xFFE0 && cp <= 0xFFE6)     // 全角通貨
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
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
  // ヘッダーの「見た目の幅」と同じ数の * を並べる（日本語は半角の2倍幅として計算）
  const footerText = '*'.repeat(displayWidth(headerText));

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
