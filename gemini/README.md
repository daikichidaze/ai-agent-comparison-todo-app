# シンプルTodo管理アプリ

`mini-todo-spec.md` に基づいて作成された、シンプルなTodo管理Webアプリケーションです。

## 技術スタック

- **バックエンド**: Node.js, Express
- **データベース**: SQLite
- **フロントエンド**: Vanilla JavaScript (Pure HTML/CSS/JS), fetch API

## 実行方法

### 1. 依存関係のインストール

```bash
npm install
```

### 2. アプリケーションの起動

```bash
npm start
```

サーバーが `http://localhost:8080` で起動します。

### 3. データベースのリセット

データベースを初期状態に戻したい場合は、以下のコマンドを実行してください。

```bash
rm -f todo.db && npm start
```

## APIエンドポイント

- `GET /api/tasks`: タスク一覧を取得
- `GET /api/tasks?done=false`: 未完了のタスク一覧を取得
- `GET /api/tasks/:id`: 特定のタスクを取得
- `POST /api/tasks`: 新しいタスクを作成
- `PATCH /api/tasks/:id`: タスクを更新
- `DELETE /api/tasks/:id`: タスクを削除
