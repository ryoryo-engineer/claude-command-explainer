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
