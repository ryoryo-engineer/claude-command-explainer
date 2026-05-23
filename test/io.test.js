// test/io.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { readStdin } = require('../lib/io');
const { spawn } = require('node:child_process');
const path = require('node:path');

test('readStdin が stdin の全データを文字列として返す', async () => {
  const script = `
    const { readStdin } = require('${path.resolve('lib/io.js').replace(/\\/g, '/')}');
    readStdin().then(s => { process.stdout.write(s); });
  `;
  const child = spawn('node', ['-e', script]);
  child.stdin.write('hello world');
  child.stdin.end();

  let out = '';
  for await (const chunk of child.stdout) out += chunk;
  assert.strictEqual(out, 'hello world');
});
