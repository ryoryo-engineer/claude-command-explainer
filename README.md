# claude-command-explainer

Claude Code がコマンドを実行する前に、**何を・どのファイル/フォルダに対して・しようとしているのか** を日本語で表示する PreToolUse hook です。

非エンジニアの方や、初めて見るコマンドが不安な方が、安心して許可ボタンを押せるようにすることが目的です。

---

> ## ⚠️ 重要：動作環境について
>
> 現時点では **Claude Code CLI 版でのみ動作します**。Claude Code デスクトップ版（Mac/Windows の GUI アプリ）は、Anthropic 側で PreToolUse hook がまだ実装されていないため、設定しても表示されません。
>
> - 関連 issue: [#45514](https://github.com/anthropics/claude-code/issues/45514) / [#29560](https://github.com/anthropics/claude-code/issues/29560) / [#6305](https://github.com/anthropics/claude-code/issues/6305)
> - Desktop 版が PreToolUse hook をサポートした時点で、本プロジェクトのコードは変更なしで動作するように設計されています。

---

## 表示例

許可ダイアログにこんな感じで日本語説明が出ます（赤＝破壊的、黄＝高リスク、シアン＝中程度、緑＝安全）:

```
*************** このコマンドで実行しようとしていること ***************

⚠️ 📁 `node_modules` を完全に削除しようとしています
⚠️ この操作は元に戻せません

***********************************************************************
```

## 動作の仕組み

1. Claude Code がツールを呼び出そうとした瞬間に hook が起動
2. 辞書ベースのパターンマッチでよくあるコマンドを高速に日本語化
3. 辞書に無いコマンドは `claude -p` を使って LLM で詳細な説明を生成
4. 同じコマンドは LRU キャッシュで2回目以降は即時表示
5. 破壊的な操作（`rm -rf`, `--force`, `DROP TABLE`, `DELETE FROM` 等）には警告マークを付与
6. `permissionDecision: "ask"` を返すことで、許可ダイアログに reason 付きで日本語説明を表示

`claude` コマンドが PATH に無い場合は、辞書ベースだけで動作します。

## 必要なもの

- Node.js 18 以上
- Claude Code（**CLI 版**。デスクトップ版でも設定はできますが、現状は反映されません）
- （推奨）`claude` CLI が PATH に通っていると、辞書に無いコマンドも詳細に日本語化できます

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

### 3. `~/.claude/settings.json` に hook を登録

`~/.claude/settings.json`（無ければ作成）に以下を追加します。すでに `hooks` セクションがあれば、その中の `PreToolUse` だけマージしてください。

**Mac / Linux:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "",
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

**Windows:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node 'C:\\Users\\YourName\\claude-command-explainer\\hook.js'",
            "shell": "powershell"
          }
        ]
      }
    ]
  }
}
```

`/絶対パス/...` または `C:\\Users\\...` の部分を、手順 2 でメモしたパスに置き換えてください。Windows ではバックスラッシュを `\\` と2つ書く必要があります。

### 4. 動作確認

Claude Code CLI を起動し、何か簡単な操作（例：「ls を実行して」と依頼）を頼んでみてください。許可ダイアログに日本語の説明が表示されれば成功です。

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

### 環境変数で挙動を変える

| 環境変数 | 用途 | 例 |
|---------|------|-----|
| `CCE_LLM_TIMEOUT_MS` | `claude -p` のタイムアウト（ミリ秒）。未指定なら無制限 | `5000` |
| `NO_COLOR` または `CCE_NO_COLOR=1` | ANSI カラー出力を無効化（古いターミナル向け） | `1` |
| `CCE_DEBUG_LOG` | デバッグログの出力先。指定したパスにファイル書き込み | `C:\\tmp\\hook.log` |
| `CCE_CACHE_PATH` | キャッシュファイルの保存先を変更 | デフォルト: `~/.claude/command-description-cache.json` |

`settings.json` の hook 定義に `env` フィールドで指定するか、OS の環境変数として設定できます。

```json
{
  "type": "command",
  "command": "node /絶対パス/hook.js",
  "env": { "CCE_LLM_TIMEOUT_MS": "5000", "NO_COLOR": "1" }
}
```

### キャッシュをリセット

`~/.claude/command-description-cache.json` を削除してください（次の hook 起動時に自動で再作成されます）。

## トラブルシューティング

### 説明が表示されない

1. **Claude Code が CLI 版かどうか確認**。Desktop GUI 版は現状未対応です（冒頭の注意書きを参照）
2. Claude Code を完全に再起動してみる
3. `~/.claude/settings.json` のパスが正しいか、`\\` のエスケープが正しいか確認
4. 手動で hook を呼んでエラーが出ないか確認（exit 0 で出力 JSON が返れば正常）:
   - Mac/Linux: `echo '{"tool_name":"Bash","tool_input":{"command":"ls"}}' | node /パス/hook.js`
   - Windows (PowerShell): `'{"tool_name":"Bash","tool_input":{"command":"ls"}}' | node C:\パス\hook.js`
5. 環境変数 `CCE_DEBUG_LOG` を設定してから再度試し、ログファイルに `START` 以降の行が出ているか確認

### claude コマンドがあるはずなのに辞書だけ使われる

- ターミナルで `which claude`（Windows は `where claude`）が成功するか確認
- Claude Code を起動したシェル環境で PATH が通っているか確認

### 色変換コード（`\x1b[31m` 等）がそのまま表示される

古いターミナルでは ANSI カラーが解釈されません。`NO_COLOR=1` または `CCE_NO_COLOR=1` を設定するとカラーを無効化できます。

## テスト

```bash
node --test test/*.test.js
```

または:

```bash
npm test
```

## ライセンス

MIT

## 貢献

辞書の充実は大歓迎です。`lib/dictionary-data.json` にエントリを追加して PR を送ってください。

特に以下のような追加を歓迎します:

- 業務でよく使うコマンドの日本語化
- 新しい MCP ツールへの対応
- 危険度判定パターンの拡充（`lib/danger.js`）
