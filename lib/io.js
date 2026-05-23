// lib/io.js
function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    // 何も来ない場合のために空文字を許容（end が発火する前提）
  });
}

module.exports = { readStdin };
