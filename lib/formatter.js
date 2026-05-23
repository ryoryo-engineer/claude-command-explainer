// lib/formatter.js
// 危険度ごとにプレフィックス絵文字とフッター警告を付ける単純整形。
// 罫線で囲まない（Claude Code 側が枠を描画するため、二重描画にならないように）。

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

/**
 * 説明と危険度から、UIに表示するテキストを組み立てる。
 * Claude Code が自前で枠表示するため、罫線は付けない。
 *
 * @param {{description: string, danger?: {level: string}}} arg
 * @returns {string}
 */
function format({ description, danger }) {
  const level = (danger && danger.level) || 'safe';
  const prefix = PREFIX[level] || '';
  const footer = FOOTER[level];

  const lines = [`${prefix}${description}`];
  if (footer) {
    lines.push(footer);
  }
  return lines.join('\n');
}

module.exports = { format };
