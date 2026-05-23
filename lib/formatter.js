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
