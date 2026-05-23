# Claude Command Explainer — 設計書

- **作成日**: 2026-05-23
- **作成者**: ryo1999fu62@gmail.com（with Claude）
- **ステータス**: ドラフト

## 1. 目的と背景

Claude Code がコマンドを実行する前に表示する許可ダイアログには、コマンドそのもの（例：`rm -rf node_modules`）と、Claude が付けた英語の `description` フィールドが表示される。しかし以下の課題がある：

- **非エンジニアには英語の説明・コマンド構文が読めない**ため、何をしようとしているのか理解できないまま許可ボタンを押す状況が発生している
- Bash 以外のツール（Edit, Write, MCP ツール等）には `description` が無く、何を変更しようとしているのかが分かりにくい
- 危険な操作（破壊的削除、強制プッシュ等）でも、見た目の警告が控えめで気付きにくい

本プロジェクトは、PreToolUse hook を使って、ツール実行直前に「**何を、どこに対して、しようとしているのか**」を**日本語で具体的に**表示する仕組みを提供する。最終的には GitHub に公開し、誰でも利用できるようにする。

## 2. スコープ

### 対象
- Claude Code のすべてのツール呼び出し（Bash, Edit, Write, Read, MCP ツール等）
- Windows / macOS / Linux いずれの環境
- Claude Code デスクトップ版・CLI 版の両方（ただし CLI 版が無いと精度が落ちる）

### 対象外
- 許可ダイアログ自体の UI 改変（Claude Code の機能ではないので不可）
- ツール実行結果の事後翻訳（PostToolUse は今回扱わない）
- 英語以外の言語への対応（最初は日本語のみ）

## 3. 要件

### 機能要件
1. PreToolUse hook として動作し、ツール実行前に stderr へ日本語説明を出力する
2. 説明には「**何を**」「**どのファイル/フォルダに対して**」が具体的に含まれる
3. 破壊的・不可逆な操作には危険度マーク（⚠️）と警告文を付与する
4. 同じコマンドの 2 回目以降はキャッシュから高速に取得する
5. `claude` CLI が利用可能な場合は LLM を使って高精度な説明を生成する
6. `claude` CLI が無い環境では辞書ベースで動作し、それでも有用な説明を出す

### 非機能要件
- フックがクラッシュしても Claude Code の動作を妨げない（exit 0 で抜ける）
- キャッシュヒット時の応答時間は 100ms 以内
- 依存ライブラリは最小限（Node.js 標準ライブラリのみで動作。Node.js 18 以上を要件とする）
- 設定は `settings.json` への追記のみで完結
- カスタマイズ可能項目: 有効/無効、claude -p のタイムアウト、辞書ファイルのパス、出力スタイル

## 4. アーキテクチャ

```
┌──────────────────────────────────────────────────┐
│  Claude Code  (ツール呼び出しが発生)              │
└──────────────────────────────────────────────────┘
                       │ JSON via stdin
                       ▼
┌──────────────────────────────────────────────────┐
│  hook.js  (Node.js, エントリーポイント)          │
│                                                  │
│  ① 入力解析                                       │
│  ② キャッシュ確認                                  │
│  ③ 説明生成                                       │
│     [a] 辞書 + パターンマッチ                     │
│     [b] フォールバックで claude -p 呼び出し       │
│  ④ キャッシュ保存                                  │
│  ⑤ 危険度マーク付与                                │
│  ⑥ stderr へ整形出力                              │
└──────────────────────────────────────────────────┘
                       │
                       ▼
        Claude Code の許可ダイアログが表示
```

## 5. コンポーネント

| ファイル | 役割 |
|---------|------|
| `hook.js` | エントリーポイント。stdin から JSON を受け取り、各モジュールを呼び出して stderr に出力 |
| `lib/dictionary.js` | コマンド辞書とパターンマッチング |
| `lib/claude-llm.js` | `claude -p` 呼び出しラッパー。`claude` が無ければ null を返す |
| `lib/cache.js` | ディスクキャッシュの読み書き |
| `lib/danger.js` | 危険度判定ルール |
| `lib/formatter.js` | 出力整形（絵文字、罫線、改行など） |
| `lib/dictionary-data.json` | 辞書本体（拡張しやすいよう JSON で分離） |
| `README.md` | インストール手順、設定方法、辞書追加のしかた |
| `settings.example.json` | コピペで使える設定例 |
| `test/` | ユニットテスト・統合テスト |

### 5.1 hook.js のインターフェース

- **入力**: stdin から JSON（Claude Code が渡すもの）
  ```json
  {
    "tool_name": "Bash",
    "tool_input": { "command": "rm -rf node_modules", "description": "Remove node_modules" }
  }
  ```
- **出力**: stderr に整形済み日本語説明
- **終了コード**: 常に 0（hook 自体のエラーで Claude Code を止めない）

### 5.2 dictionary.js のインターフェース

```js
// 入力：tool_name と tool_input
// 出力：{ description: string, matched: boolean } または null
explain(toolName, toolInput) -> { description, matched } | null
```

`matched: true` ＝辞書で端的に説明できた（そのまま使う）／`matched: false` ＝辞書には部分情報しか無い（→ LLM へフォールバック対象。LLM が呼べなければこの部分情報をそのまま使う）。`null` 返却は「辞書に該当エントリが全く無い」状態。

### 5.3 辞書データの構造

```json
{
  "bash": {
    "patterns": [
      {
        "regex": "^rm\\s+-rf?\\s+(.+)$",
        "template": "📁 `{1}` を完全に削除しようとしています",
        "danger": "destructive",
        "matched": true
      },
      {
        "regex": "^cd\\s+(.+)$",
        "template": "📂 `{1}` フォルダに移動しようとしています",
        "danger": "safe",
        "matched": true
      }
    ]
  },
  "edit": {
    "template": "✏️ `{file_path}` を編集しようとしています",
    "danger": "moderate",
    "matched": true
  }
}
```

### 5.4 claude-llm.js の動作

1. `claude` コマンドの存在確認（`which claude` / `where claude`）
2. 無ければ即 null を返す
3. あれば次のプロンプトで実行：
   ```
   claude -p "次のツール呼び出しを、非エンジニアにも分かるよう日本語で1-2文で説明してください。何を、どのファイル/フォルダに対して行うかを具体的に書いてください。装飾は不要：
   ツール: <tool_name>
   入力: <tool_input as JSON>"
   ```
4. 標準出力を取得して整形
5. タイムアウト: デフォルトは無し（claude が応答するまで待つ）。設定で上限を変更可能。長すぎる応答待ちを嫌うユーザー向けに `settings.json` 経由で秒数指定できるようにする。

### 5.5 cache.js の動作

- 保存場所: `~/.claude/command-description-cache.json`
- キー: `tool_name + JSON.stringify(tool_input)` の SHA-256 ハッシュ
- 値: 説明文 + 生成日時 + 危険度
- サイズ上限: 1000 エントリ（超えたら LRU で古いものから削除。アクセス時にタイムスタンプを更新）
- 壊れていたら削除して新規作成
- ユーザーが手動でリセットしたい場合は単にこのファイルを削除すれば良い（README に明記）

### 5.6 danger.js の判定ルール

| パターン | 危険度 | 表示 |
|---------|-------|------|
| `rm -rf`, `rm -fr` | destructive | ⚠️ + 「元に戻せません」 |
| `git push --force`, `git push -f` | destructive | ⚠️ + 「他人の変更を上書きします」 |
| `sudo`, `chmod -R`, `chown -R` | high | ⚠️ + 「権限を変更します」 |
| `DROP TABLE`, `TRUNCATE`, `DELETE FROM` (引数なし) | destructive | ⚠️ + 「データが消えます」 |
| `npm install`, `pip install` | moderate | ℹ️ + 「外部パッケージを取得します」 |
| `cat`, `ls`, `cd`, `pwd` | safe | （マークなし） |
| Edit/Write | moderate | ℹ️ |

辞書側の各エントリで `danger` を指定する形と、コマンド全体に対する別途ルールマッチの両方を組み合わせる。

## 6. データフロー（具体例）

### 例 1: `rm -rf node_modules`

1. stdin: `{"tool_name":"Bash","tool_input":{"command":"rm -rf node_modules"}}`
2. キャッシュ確認 → ミス
3. 辞書マッチ: `^rm\s+-rf?\s+(.+)$` → 「📁 `node_modules` を完全に削除しようとしています」、`danger: "destructive"`
4. キャッシュ保存
5. 危険度マーク付与 → ⚠️ + 「元に戻せません」
6. stderr 出力:
   ```
   ┌─ Claude Code がやろうとしていること ─────────
   │ ⚠️ 📁 `node_modules` フォルダを完全に削除しようとしています
   │ ⚠️ この操作は元に戻せません
   └──────────────────────────────────────────
   ```

### 例 2: `Edit(file_path="src/auth.ts", old_string="...", new_string="...")`

1. stdin: tool_name="Edit", tool_input にファイルパスと変更内容
2. キャッシュ確認 → ミス
3. 辞書マッチ: `edit` エントリ → 「✏️ `src/auth.ts` を編集しようとしています」、`danger: "moderate"`
4. キャッシュ保存
5. stderr 出力:
   ```
   ┌─ Claude Code がやろうとしていること ─────────
   │ ℹ️ ✏️ `src/auth.ts` を編集しようとしています
   └──────────────────────────────────────────
   ```

### 例 3: 複雑なコマンド `find . -name "*.log" -mtime +30 -exec rm {} \;`

1. stdin: tool_name="Bash"
2. キャッシュ確認 → ミス
3. 辞書マッチ: 部分マッチ（`find`）はあるが、複雑すぎて `matched: false`
4. `claude -p` 呼び出し → 「30日以上前の .log ファイルを検索して削除しようとしています」
5. キャッシュ保存
6. 危険度判定: `rm {}` を含む → destructive
7. stderr 出力:
   ```
   ┌─ Claude Code がやろうとしていること ─────────
   │ ⚠️ 30日以上前の .log ファイルを検索して削除しようとしています
   │ ⚠️ この操作は元に戻せません
   └──────────────────────────────────────────
   ```

### 例 4: `claude` CLI が無い環境で複雑なコマンド

1. 同じ `find ... -exec rm` が来る
2. 辞書マッチで `matched: false`
3. `claude -p` 呼び出し → 失敗（null 返却）
4. フォールバック: 辞書の部分マッチ結果を使う → 「🔍 `find` コマンドでファイル検索 + 何か操作をしようとしています（詳細不明）」
5. 危険度判定: `rm` を含む → destructive
6. stderr 出力（精度は落ちるが何かは伝わる）

## 7. エラーハンドリング

| エラー | 対応 |
|--------|------|
| stdin が空 / JSON 不正 | exit 0 で抜ける（何も表示しない） |
| `claude` コマンドが無い | 辞書フォールバックへ |
| `claude -p` がタイムアウト | 辞書フォールバックへ |
| キャッシュファイルが壊れている | 削除して新規作成 |
| 辞書ファイルが見つからない | エラーメッセージのみ表示して exit 0 |
| hook 自体の予期しない例外 | catch して exit 0（Claude Code を止めない） |

## 8. テスト

### 8.1 ユニットテスト
- `dictionary.js`: 既知パターン、未知パターン、引数抽出、複数マッチの優先順位
- `cache.js`: 読み書き、上限超過時の削除、壊れたファイルの復旧
- `danger.js`: 危険コマンドの検出、安全コマンドのスルー
- `formatter.js`: 罫線・絵文字・改行の正しい組み立て

### 8.2 統合テスト
- ダミー JSON を stdin に流して、期待通りの stderr 出力が得られることを確認
- `claude -p` モックを差し込んで、フォールバック動作を確認
- キャッシュヒット時の応答時間が 100ms 以内であることを確認

### 8.3 動作確認（手動）
- Windows でデスクトップ版 Claude Code に組み込んで動作確認
- macOS で CLI 版 Claude Code に組み込んで動作確認
- 説明が許可ダイアログのタイミングで表示されることを実際に確認

## 9. 配布方法

- GitHub リポジトリとして公開
- README に以下を記載：
  - インストール手順（Node.js 要件、リポジトリのクローン、hook スクリプトのパス取得）
  - `settings.json` への追記方法（コピペ可能なサンプル）
  - 辞書の拡張方法（独自コマンドを追加するには `dictionary-data.json` をどう書くか）
  - 動作確認方法
  - 既知の制約（デスクトップ版だけだと精度落ちる、stderr の表示挙動など）
- ライセンス: MIT

## 10. 既知のリスク・制約

- **stderr 表示の挙動**: Claude Code デスクトップ版で stderr 出力がどう表示されるかは公式ドキュメント未記載。実装後の検証が必須。もし表示されない場合は別の出力経路（例: `additionalContext` 経由）に切り替える可能性あり。
- **claude -p のレイテンシ**: キャッシュヒット率が低いうちは毎回 2〜5 秒待つ。実用には初回コストを受け入れてもらう必要がある。
- **辞書の網羅性**: 公開後にユーザーからのプルリクで辞書を育てる前提。最初は主要コマンド（Unix 基本、git, npm, docker 等）に限定する。
- **誤検出**: 安全なコマンドを誤って「危険」と判定する可能性。判定ルールは保守的に始める。
