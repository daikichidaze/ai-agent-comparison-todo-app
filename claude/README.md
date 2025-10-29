# シンプルTodo管理アプリ

Pure HTML/CSS/JavaScript で実装されたシンプルなTodo管理アプリケーションです。

## 概要

- **フロントエンド**: Pure HTML/CSS/JavaScript（フレームワークなし）
- **バックエンド**: Express.js
- **データベース**: SQLite
- **構成**: 1プロセス（Express が静的ファイルと API を提供）

## 機能

- ✅ タスクの作成、読取、更新、削除（CRUD）
- ✅ タスクの完了/未完了の切り替え
- ✅ タスクのフィルタリング（完了・未完了）
- ✅ タスクの期限設定
- ✅ RFC 7807 準拠のエラーハンドリング
- ✅ Unicode NFC 正規化
- ✅ 包括的なバリデーション

## 必要な環境

- Node.js 18+
- npm

## セットアップと実行

```bash
# 依存パッケージのインストール
npm install

# サーバーの起動
npm start
```

サーバーが起動すると、`http://localhost:8080` でアクセスできます。

- デフォルトポート: 8080
- ポート変更: `PORT=3000 npm start`

## ディレクトリ構成

```
.
├── server.js              # Express サーバーのエントリポイント
├── db.js                  # SQLite データベース接続・クエリ
├── schema.sql             # DB スキーマ
├── package.json           # npm 設定
├── public/
│   ├── index.html         # フロントエンド HTML
│   ├── main.js            # フロントエンド JavaScript
│   └── styles.css         # フロントエンド CSS
├── todo.db                # SQLite データベースファイル（自動作成）
└── README.md
```

## API仕様

### 基本情報

- ベースURL: `/api`
- Content-Type: `application/json; charset=utf-8`
- エラーレスポンス: RFC 7807 準拠

### エンドポイント

#### タスク一覧取得
```
GET /api/tasks?done=true|false
```

クエリパラメータ:
- `done=true`: 完了したタスクのみ
- `done=false`: 未完了のタスクのみ
- 未指定: すべてのタスク

レスポンス:
```json
[
  {
    "id": 1,
    "title": "買い物に行く",
    "description": "牛乳と卵",
    "dueDate": "2025-01-20",
    "done": false,
    "createdAt": "2025-01-18T12:00:00Z",
    "updatedAt": "2025-01-18T12:00:00Z"
  }
]
```

#### タスク詳細取得
```
GET /api/tasks/:id
```

#### タスク作成
```
POST /api/tasks
```

リクエスト:
```json
{
  "title": "買い物に行く",
  "description": "牛乳と卵",
  "dueDate": "2025-01-20"
}
```

レスポンス: **201 Created** (Location ヘッダ付き)

#### タスク更新
```
PATCH /api/tasks/:id
```

更新可能なフィールド: `title`, `description`, `dueDate`, `done`

リクエスト:
```json
{
  "done": true
}
```

レスポンス: **200 OK**

#### タスク削除
```
DELETE /api/tasks/:id
```

レスポンス: **204 No Content**

## バリデーション

### タイトル
- **必須**: はい
- **最大長**: 100文字
- **改行**: 不可
- **エラーステータス**: 422

### 説明
- **必須**: いいえ
- **最大長**: 1000文字
- **改行**: 可
- **エラーステータス**: 422

### 期限
- **形式**: `YYYY-MM-DD` または 空文字
- **検証**: 実在する日付（うるう年対応）
- **エラーステータス**: 422

### 完了フラグ
- **型**: boolean
- **エラーステータス**: 422

## エラーハンドリング

すべてのエラーレスポンスは RFC 7807 準拠の `application/problem+json` 形式です。

### ステータスコード

| ステータス | 説明 |
|-----------|------|
| 400 | Bad Request（不正な JSON、未知フィールド等） |
| 404 | Not Found（タスクが見つからない） |
| 422 | Unprocessable Entity（バリデーションエラー） |
| 500 | Internal Server Error |

### エラーレスポンス例

```json
{
  "type": "about:blank",
  "title": "Unprocessable Entity",
  "status": 422,
  "detail": "Validation failed.",
  "errors": [
    {
      "field": "title",
      "message": "title is required"
    },
    {
      "field": "dueDate",
      "message": "must be YYYY-MM-DD or empty"
    }
  ]
}
```

## データベース初期化

### 初回起動時
- `todo.db` ファイルが存在しない場合、`schema.sql` から自動作成されます
- ログに `[DB] migrated` と表示されます

### リセット
```bash
rm -f todo.db
npm start
```

## 学習ポイント

このプロジェクトで学べること:

1. **バニラJavaScript**: フレームワークなしで DOM 操作と API 通信を実装
2. **Express.js**: ルーティング、ミドルウェア、エラーハンドリング
3. **SQLite**: データベース設計、クエリ実行、トランザクション
4. **REST API**: HTTP メソッドと ステータスコード、適切なエラーハンドリング
5. **バリデーション**: 入力検証とデータ正規化
6. **UI/UX**: フォーム操作、ローディング状態、エラー表示

## 開発

### サーバーログ

```
[Server] Listening on port 8080
[DB] migrated
```

### トラブルシューティング

#### ポート 8080 が既に使用されている
```bash
PORT=3000 npm start
```

#### データベースエラー
```bash
rm -f todo.db
npm start
```

## ライセンス

MIT
