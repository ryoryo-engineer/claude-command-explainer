# claude-command-explainer

Claude Code がコマンドを実行する前に、**何を・どのファイル/フォルダに対して・しようとしているのか** を日本語で表示する PreToolUse hook です。

非エンジニアの方や、初めて見るコマンドが不安な方が、安心して許可ボタンを押せるようにすることが目的です。

## 表示例

```
┌─ Claude Code がやろうとしていること ─────────
│ ⚠️ 📁 `node_modules` を完全に削除しようとしています
│ ⚠️ この操作は元に戻せません
└──────────────────────────────────────────
```

## 動作の仕組み

1. Claude Code がツールを呼び出す直前に hook が起動
2. 辞書ベースのパターンマッチでよくあるコマンドを高速に説明
3. 辞書に無いコマンドは `claude -p` を使って LLM で詳細な説明を生成（要 Claude CLI）
4. 同じコマンドは LRU キャッシュで2回目以降は即時表示
5. 破壊的な操作（rm -rf, --force, DROP TABLE 等）には警告マークを付与

`claude` コマンドが PATH に無い場合（Claude Code デスクトップ版のみインストール）は、辞書ベースだけで動作します。

## 必要なもの

- Node.js 18 以上
- Claude Code（デスクトップ版または CLI 版）

## インストール

### 1. このリポジトリをクローン

```bash
git clone https://github.com/ryoryo-engineer/claude-command-explainer.git
cd claude-command-explainer
```

### 2. hook のフルパスを確認

```bash
# Mac/Linux
echo "$(pwd)/hook.js"
# Windows (PowerShell)
echo "$($PWD.Path)\hook.js"
```

このパスをメモしておきます。

### 3. settings.json に hook を登録

`~/.claude/settings.json`（無ければ作成）に以下を追加：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node /絶対パス/claude-command-explainer/hook.js"
          }
        ]
      }
    ]
  }
}
```

`/絶対パス/...` の部分を、手順 2 でメモしたパスに置き換えてください。

### 4. 動作確認

Claude Code を再起動し、何か簡単な操作（例：`ls` を実行）を頼んでみてください。許可ダイアログの前に日本語の説明が表示されれば成功です。

## カスタマイズ

### 辞書を増やす

`lib/dictionary-data.json` を編集すると、独自のコマンドや MCP ツールに対応する説明を追加できます。

```json
{
  "bash": {
    "patterns": [
      {
        "regex": "^my-cli\\s+(.+)$",
        "template": "🛠️ 自社ツールで `{1}` を実行しようとしています",
        "matched": true
      }
    ]
  }
}
```

### LLM 呼び出しのタイムアウト

環境変数 `CCE_LLM_TIMEOUT_MS` を設定すると、`claude -p` のタイムアウトをミリ秒単位で指定できます。未指定なら無制限（応答を待つ）。

### キャッシュをリセット

`~/.claude/command-description-cache.json` を削除してください。

## トラブルシューティング

### 説明が表示されない

- Claude Code を完全に再起動してみてください
- `settings.json` のパスが正しいか確認してください
- `node /パス/hook.js < /dev/null` を実行してエラーが出ないか確認してください（exit 0 で何も出なければ正常）

### claude コマンドがあるはずなのに辞書だけ使われる

- ターミナルで `which claude`（Windows は `where claude`）が成功するか確認してください
- hook を実行するシェル環境で PATH が通っているか確認してください

## テスト

```bash
node --test test/
```

## ライセンス

MIT

## 貢献

辞書の充実は大歓迎です。`lib/dictionary-data.json` にエントリを追加して PR を送ってください。
