# シンプルTodo管理アプリ 仕様書

## 1. 概要

- 目的：ブラウザ（**Pure HTML/CSS/JS**） → **同一プロセスの** API（Express） → DB（SQLite）で、Webアプリ基本サイクル（作成／取得／更新／削除）を学ぶ。    
- 範囲：認証・権限・優先度・タグ・ページネーション等は **非対応**。まずは CRUD と最小 UI に集中。
- 実行環境：Node.js 18+ / npm、最新ブラウザ（Chrome 等）。
- データ保存：SQLite 単一ファイル（デモ用）。
- **構成**：**1プロセスのみ**。Express が `/public` 配下の静的ファイル（フロント）を配信し、**同じオリジン**で `/api/*` を提供（CORS 不要）。
- **フロント**：フレームワーク／ビルド工程なし（**バニラJS**）。`fetch` で `/api/*` を呼び出す。
- **使用パッケージは最小限**（`express`, `sqlite3` のみ。`nodemon` は不要）。    
- **禁止事項（デモ安定化のため）**：フロントFW・バンドラ・ORM・別プロセス API・TypeScript 化・Edge ランタイム相当の実装。        

---
## 2. 機能要件
### 2.1 Todo管理の基本操作

| 機能     | HTTPメソッド／URL            | 説明                                                                                                                    |
| ------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 一覧取得   | `GET /api/tasks`        | `created_at` の**新しい順**（tie-breakで `id` 降順）。`?done=false` で未完了のみ、`?done=true` で完了のみ。不正値は 400、未指定は全件。                   |
| 詳細取得   | `GET /api/tasks/:id`    | ID 指定で 1 件。存在しない場合は 404。                                                                                              |
| 作成     | `POST /api/tasks`       | `title` 必須。`createdAt`/`updatedAt` はサーバ自動設定。**201** + `Location` + 作成後オブジェクト。                                         |
| 更新（部分） | `PATCH /api/tasks/:id`  | **部分更新のみ**。受理フィールドは `title` / `description` / `dueDate` / `done`。`done` は **目標値**（true/false）を必須。**200** + 更新後オブジェクト。 |
| 削除     | `DELETE /api/tasks/:id` | 成功時 **204**（ボディなし）。未存在は 404。                                                                                          |

**共通**：リクエスト/レスポンスは `application/json`。ID は整数。

---

## 3. データ構造
### 3.1 SQLite（単一ファイル `todo.db`）

| カラム名        | 型       | 備考                                        |
| ----------- | ------- | ----------------------------------------- |
| id          | INTEGER | 主キー、自動採番                                  |
| title       | TEXT    | 必須（空文字・空白のみ不可）                            |
| description | TEXT    | 任意（空なら空文字）                                |
| due_date    | TEXT    | **日付のみ**：`YYYY-MM-DD`。空は空文字（**NULL 不使用**） |
| done        | INTEGER | 0=未完了、1=完了                                |
| created_at  | TEXT    | **UTC/RFC3339**                           |
| updated_at  | TEXT    | **UTC/RFC3339**                           |

> **JSON は camelCase**（例：`dueDate`, `createdAt`）、**DB は snake_case**（`due_date`, `created_at`）。サーバでマッピング。  
> 一覧は `ORDER BY datetime(created_at) DESC, id DESC`。

---

## 4. API仕様
### 4.1 共通HTTP仕様

- `Content-Type: application/json; charset=utf-8`
- 取得系は `Cache-Control: no-store`
- 戻り値一貫性
    - `POST` … **201 Created** + `Location: /api/tasks/{id}` + 作成後オブジェクト
    - `PATCH` … **200 OK** + 更新後オブジェクト        
    - `DELETE` … **204 No Content**（ボディなし）
        

### 4.2 エンドポイント定義

- **一覧** `GET /api/tasks?done=true|false`    
    - クエリ `done` は小文字 `true` / `false` のみ受理。不正は **400**。
- **詳細** `GET /api/tasks/:id`
    - 未存在は **404**。
- **作成** `POST /api/tasks`
    - リクエスト例：
        ```json
        { "title": "買い物に行く", "description": "牛乳と卵", "dueDate": "2025-01-20" }
        ```
        
    - レスポンス（201）例：
        ```json
        {
          "id": 1, "title": "買い物に行く", "description": "牛乳と卵",
          "dueDate": "2025-01-20", "done": false,
          "createdAt": "2025-01-18T12:00:00Z", "updatedAt": "2025-01-18T12:00:00Z"
        }
        ```
        
- **更新** `PATCH /api/tasks/:id`
    - 受理：`title` / `description` / `dueDate` / `done` 以外は **400**（未知フィールド）。
    - `done` はトグル不可。**目標値** `true` / `false` を指定。
    - 未指定フィールドは変更しない。
        
- **削除** `DELETE /api/tasks/:id`
    - 成功 **204**、未存在 **404**。
        

---

## 5. バリデーション（上限・形式・正規化）

### 5.1 基本ルール
- **文字列正規化**：入力受信時に **Unicode NFC 正規化**。
- **前後空白除去**：`title`/`description`/`dueDate` は **trim**。
- **改行**：`title` は改行禁止、`description` は改行可。
- **JSONサイズ上限**：`express.json({ limit: '64kb' })`。超過は **400**。
- **ID形式**：数値以外は **400**。存在しない ID は **404**。
    

### 5.2 フィールド別
- `title`：**必須**、trim後 **1〜100 文字**、改行不可。違反は **422**。
- `description`：**0〜1000 文字**。違反は **422**。
- `dueDate`：空文字または **`YYYY-MM-DD`**。与えられた場合は**実在日付**（うるう年考慮）。違反は **422**。
- `done`：**JSON boolean**（true/false）のみ。違反は **422**。
- **未知フィールド**（PATCH/POST）… **400**（Bad Request）。
    

### 5.3 エラー表現（RFC7807）

- 例（422）
    ```json
    {
      "type": "about:blank",
      "title": "Unprocessable Entity",
      "status": 422,
      "detail": "Validation failed.",
      "errors": [
        { "field": "title", "message": "title is required" },
        { "field": "dueDate", "message": "must be YYYY-MM-DD or empty" }
      ]
    }
    ```
    

---

## 6. エラー仕様

| 状況                           | HTTP |
| ---------------------------- | ---- |
| JSON破損／サイズ超過／未知フィールド／クエリ形式不正 | 400  |
| バリデーション不合格（上記 5.*）           | 422  |
| 該当IDなし                       | 404  |
| サーバ内部エラー                     | 500  |

※ すべて **`application/problem+json`（RFC7807）**。

---

## 7. UI要件（最小構成｜Pure JS）

- 画面は **単一ページ**（`/public/index.html` + `/public/main.js`）。    
- **言語** 日本語
- **タスク作成フォーム**（title 必須・エラーメッセージ表示）。
- **一覧表示**（`createdAt DESC, id DESC`）。
- **完了操作**：チェックボックス変更時に `PATCH /api/tasks/:id` へ `{ "done": true|false }` を送信（送信中は無効化）。
- **編集**：簡易モーダル／`prompt` などで `PATCH`。
- **削除**：削除前に確認ダイアログ。
    

### 7.1 UX/アクセシビリティ（最小）
- **タスク作成時の即時反映**：タスク作成（`POST`）が成功した場合、画面全体を再読み込みしたり、タスク一覧を再取得（`GET`）したりするのではなく、APIからのレスポンス（作成されたタスクのJSONオブジェクト）を直接利用して新しいタスク要素を生成し、リストの先頭に即座に追加する。これにより、UIの応答性を高め、不要なネットワークリクエストを削減する。
- **空状態**：タスク 0 件時のメッセージ。
- **ローディング**：送信中インジケータ／ボタン連打防止。
- **エラー表示**：`problem+json` の `detail` と `errors[]` をマッピングして表示。
- **フィルタ**：未完了のみ表示切替（`?done=false`）。
- **キーボード操作**：主要操作は Tab/Enter で完結。
- **ARIA**：操作ボタンに `aria-label`。
- **XSS対策**：動的挿入は **`textContent`** を使用（`innerHTML` 禁止）。
    

---

## 8. ディレクトリ構成

```
/project-root
  ├─ server.js            # Expressエントリ
  ├─ db.js                # DB接続・クエリ（プレースホルダ必須）
  ├─ schema.sql           # 初回マイグレーション用
  ├─ public/
  │   ├─ index.html       # 単一ページ
  │   ├─ main.js          # fetchでAPI呼び出し・DOM更新
  │   └─ styles.css       # 任意（なければ削除可）
  ├─ package.json
  └─ README.md            # 起動手順・学習メモ
```

---

## 9. 実行・環境構築

### 9.1 package.json（最小）

```json
{
  "scripts": {
    "start": "node server.js",
  },
  "dependencies": {
    "express": "^4.18.2",
    "sqlite3": "^5.1.6"
  },
}
```

- 追加パッケージ禁止。TypeScript/バンドラ不使用。
    

### 9.2 ポート
- `PORT` を優先、未設定時は **8080**。    
- ローカルは `http://localhost:8080`。
    

---

## 10. 開発・実行環境：Cloud Shell

- **起動**：Cloud Shell でリポジトリを開き、`npm i && npm start`。 
- **ポート**：既定 **8080**。Cloud Shell の **Web Preview（Preview on port 8080）** を使用。    
- **永続化**：Cloud Shell のホームディレクトリ配下にあるリポジトリは再起動後も**保持**。`todo.db` も同ディレクトリに置くため永続。
- **公開範囲**：Web Preview の一時URLは開発者向け（実運用公開は想定外）。 
- **ファイル位置**：`/project-root/todo.db`（相対パスで管理）。
- **ログ**：ターミナルに起動情報（ポート/DB/マイグレ結果）を INFO で出力。
    

---

## 11. DB初期化

- **初回起動**：`todo.db` がなければ `schema.sql` を自動適用し **`[DB] migrated`** をログ出力。    
- **リセット**：`rm -f todo.db && npm start`（専用 `db:init` は不要）。
    
