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
