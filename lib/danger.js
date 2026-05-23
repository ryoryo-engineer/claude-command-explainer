// lib/danger.js
// コマンドやツール呼び出しの危険度を判定するモジュール

const DANGEROUS_PATTERNS = [
  { regex: /\brm\s+-[rR][fF]?\b/, level: 'destructive' },
  { regex: /\brm\s+-[fF][rR]?\b/, level: 'destructive' },
  { regex: /git\s+push\b.*(\s--force\b|\s-f\b)/, level: 'destructive' },
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

/**
 * ツール名と入力から危険度を判定する
 * @param {string} toolName - ツール名（例: 'Bash', 'Edit', 'Read'）
 * @param {object} toolInput - ツールへの入力オブジェクト
 * @returns {{ level: 'safe' | 'moderate' | 'high' | 'destructive' }}
 */
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
