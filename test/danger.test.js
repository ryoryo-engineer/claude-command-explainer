// test/danger.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { getDanger } = require('../lib/danger');

test('rm -rf は destructive', () => {
  assert.strictEqual(getDanger('Bash', { command: 'rm -rf node_modules' }).level, 'destructive');
});

test('rm -fr も destructive', () => {
  assert.strictEqual(getDanger('Bash', { command: 'rm -fr /tmp/x' }).level, 'destructive');
});

test('git push --force は destructive', () => {
  assert.strictEqual(getDanger('Bash', { command: 'git push --force origin main' }).level, 'destructive');
});

test('git push -f も destructive', () => {
  assert.strictEqual(getDanger('Bash', { command: 'git push -f' }).level, 'destructive');
});

test('sudo は high', () => {
  assert.strictEqual(getDanger('Bash', { command: 'sudo apt update' }).level, 'high');
});

test('chmod -R は high', () => {
  assert.strictEqual(getDanger('Bash', { command: 'chmod -R 755 dir' }).level, 'high');
});

test('DROP TABLE は destructive', () => {
  assert.strictEqual(getDanger('Bash', { command: 'psql -c "DROP TABLE users"' }).level, 'destructive');
});

test('TRUNCATE は destructive', () => {
  assert.strictEqual(getDanger('Bash', { command: 'mysql -e "TRUNCATE logs"' }).level, 'destructive');
});

test('DELETE FROM は destructive', () => {
  assert.strictEqual(getDanger('Bash', { command: 'psql -c "DELETE FROM users"' }).level, 'destructive');
});

test('cd は safe', () => {
  assert.strictEqual(getDanger('Bash', { command: 'cd /home' }).level, 'safe');
});

test('ls は safe', () => {
  assert.strictEqual(getDanger('Bash', { command: 'ls -la' }).level, 'safe');
});

test('Edit はデフォルトで moderate', () => {
  assert.strictEqual(getDanger('Edit', { file_path: 'a.ts' }).level, 'moderate');
});

test('Write はデフォルトで moderate', () => {
  assert.strictEqual(getDanger('Write', { file_path: 'a.ts' }).level, 'moderate');
});

test('Read はデフォルトで safe', () => {
  assert.strictEqual(getDanger('Read', { file_path: 'a.ts' }).level, 'safe');
});

test('未知のツールは safe（保守的に過剰警告を出さない）', () => {
  assert.strictEqual(getDanger('MysteryTool', {}).level, 'safe');
});
