const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const { STATUS_CODES } = require('http');
const { DB_PATH, run, get, all, exec } = require('./db');

const app = express();
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

app.use(express.json({ limit: '1mb' }));
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    sendProblem(res, 400, 'JSONの形式が正しくありません。');
    return;
  }
  next(err);
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/tasks', async (req, res, next) => {
  try {
    const { done } = req.query;
    let doneFilter;
    if (done !== undefined) {
      if (done === 'true') {
        doneFilter = 1;
      } else if (done === 'false') {
        doneFilter = 0;
      } else {
        sendProblem(res, 400, 'done クエリパラメータが不正です。', [
          { field: 'done', message: 'true または false を指定してください。' },
        ]);
        return;
      }
    }

    let sql =
      'SELECT id, title, description, due_date, done, created_at, updated_at FROM tasks';
    const params = [];
    if (doneFilter !== undefined) {
      sql += ' WHERE done = ?';
      params.push(doneFilter);
    }
    sql += ' ORDER BY datetime(created_at) DESC, id DESC';

    const rows = await all(sql, params);
    res.set('Cache-Control', 'no-store');
    res.json(rows.map(mapTask));
  } catch (error) {
    next(error);
  }
});

app.get('/api/tasks/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      sendProblem(res, 400, 'IDが不正です。', [
        { field: 'id', message: '整数のIDを指定してください。' },
      ]);
      return;
    }

    const row = await get(
      'SELECT id, title, description, due_date, done, created_at, updated_at FROM tasks WHERE id = ?',
      [id]
    );
    if (!row) {
      sendProblem(res, 404, '指定されたタスクが見つかりませんでした。');
      return;
    }
    res.set('Cache-Control', 'no-store');
    res.json(mapTask(row));
  } catch (error) {
    next(error);
  }
});

app.post('/api/tasks', async (req, res, next) => {
  try {
    if (!isPlainObject(req.body)) {
      sendProblem(res, 400, 'JSONオブジェクトを送信してください。');
      return;
    }

    const unknownFields = detectUnknownFields(req.body, [
      'title',
      'description',
      'dueDate',
      'done',
    ]);
    if (unknownFields.length > 0) {
      sendProblem(res, 400, '不正なフィールドが含まれています。', unknownFields);
      return;
    }

    const { value, errors } = validateTaskPayload(req.body);
    if (errors.length > 0) {
      sendProblem(res, 422, '入力内容が正しくありません。', errors);
      return;
    }

    const now = new Date().toISOString();
    const doneValue = value.done ? 1 : 0;
    const insertResult = await run(
      `INSERT INTO tasks (title, description, due_date, done, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [value.title, value.description, value.dueDate, doneValue, now, now]
    );
    const created = await get(
      'SELECT id, title, description, due_date, done, created_at, updated_at FROM tasks WHERE id = ?',
      [insertResult.lastID]
    );
    const task = mapTask(created);
    res
      .status(201)
      .location(`/api/tasks/${task.id}`)
      .json(task);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/tasks/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      sendProblem(res, 400, 'IDが不正です。', [
        { field: 'id', message: '整数のIDを指定してください。' },
      ]);
      return;
    }
    if (!isPlainObject(req.body)) {
      sendProblem(res, 400, 'JSONオブジェクトを送信してください。');
      return;
    }

    const keys = Object.keys(req.body);
    if (keys.length === 0) {
      sendProblem(res, 400, '更新対象のフィールドを指定してください。');
      return;
    }

    const unknownFields = detectUnknownFields(req.body, [
      'title',
      'description',
      'dueDate',
      'done',
    ]);
    if (unknownFields.length > 0) {
      sendProblem(res, 400, '不正なフィールドが含まれています。', unknownFields);
      return;
    }

    const existing = await get(
      'SELECT id, title, description, due_date, done, created_at, updated_at FROM tasks WHERE id = ?',
      [id]
    );
    if (!existing) {
      sendProblem(res, 404, '指定されたタスクが見つかりませんでした。');
      return;
    }

    const { value, errors } = validatePatchPayload(req.body);
    if (errors.length > 0) {
      sendProblem(res, 422, '入力内容が正しくありません。', errors);
      return;
    }

    const updates = [];
    const params = [];
    if (value.title !== undefined) {
      updates.push('title = ?');
      params.push(value.title);
    }
    if (value.description !== undefined) {
      updates.push('description = ?');
      params.push(value.description);
    }
    if (value.dueDate !== undefined) {
      updates.push('due_date = ?');
      params.push(value.dueDate);
    }
    if (value.done !== undefined) {
      updates.push('done = ?');
      params.push(value.done ? 1 : 0);
    }
    const updatedAt = new Date().toISOString();
    updates.push('updated_at = ?');
    params.push(updatedAt, id);

    await run(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`, params);

    const updated = await get(
      'SELECT id, title, description, due_date, done, created_at, updated_at FROM tasks WHERE id = ?',
      [id]
    );
    res.json(mapTask(updated));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/tasks/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      sendProblem(res, 400, 'IDが不正です。', [
        { field: 'id', message: '整数のIDを指定してください。' },
      ]);
      return;
    }

    const result = await run('DELETE FROM tasks WHERE id = ?', [id]);
    if (result.changes === 0) {
      sendProblem(res, 404, '指定されたタスクが見つかりませんでした。');
      return;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.use((err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  console.error(err);
  sendProblem(res, 500, 'サーバ内部でエラーが発生しました。');
});

async function ensureDatabase() {
  const exists = await get(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tasks'`
  );
  if (!exists) {
    const schema = await fs.readFile(SCHEMA_PATH, 'utf8');
    await exec(schema);
    console.info('[DB] migrated');
  }
  console.info(`[DB] ready at ${DB_PATH}`);
}

function mapTask(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    dueDate: row.due_date ?? '',
    done: row.done === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseId(value) {
  const id = Number.parseInt(value, 10);
  if (!Number.isInteger(id) || id < 1) {
    return null;
  }
  return id;
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function detectUnknownFields(payload, allowed) {
  const allowedSet = new Set(allowed);
  return Object.keys(payload)
    .filter((key) => !allowedSet.has(key))
    .map((field) => ({
      field,
      message: 'このフィールドは使用できません。',
    }));
}

function validateTaskPayload(payload) {
  const errors = [];
  let title = '';
  if (typeof payload.title !== 'string' || payload.title.trim() === '') {
    errors.push({ field: 'title', message: 'タイトルを入力してください。' });
  } else {
    title = payload.title.trim();
  }

  let description = '';
  if (payload.description === undefined) {
    description = '';
  } else if (typeof payload.description !== 'string') {
    errors.push({
      field: 'description',
      message: '説明は文字列で指定してください。',
    });
  } else {
    description = payload.description;
  }

  let dueDate = '';
  if (payload.dueDate === undefined) {
    dueDate = '';
  } else if (typeof payload.dueDate !== 'string') {
    errors.push({
      field: 'dueDate',
      message: '期限は YYYY-MM-DD 形式の文字列で指定してください。',
    });
  } else {
    const normalized = payload.dueDate.trim();
    if (normalized === '') {
      dueDate = '';
    } else if (!DATE_PATTERN.test(normalized)) {
      errors.push({
        field: 'dueDate',
        message: '期限は YYYY-MM-DD 形式で入力してください。',
      });
    } else {
      dueDate = normalized;
    }
  }

  let done = false;
  if (payload.done === undefined) {
    done = false;
  } else if (typeof payload.done !== 'boolean') {
    errors.push({ field: 'done', message: '完了フラグは true/false で指定してください。' });
  } else {
    done = payload.done;
  }

  return {
    value: { title, description, dueDate, done },
    errors,
  };
}

function validatePatchPayload(payload) {
  const errors = [];
  const value = {};

  if (Object.prototype.hasOwnProperty.call(payload, 'title')) {
    if (typeof payload.title !== 'string' || payload.title.trim() === '') {
      errors.push({ field: 'title', message: 'タイトルを入力してください。' });
    } else {
      value.title = payload.title.trim();
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'description')) {
    if (typeof payload.description !== 'string') {
      errors.push({
        field: 'description',
        message: '説明は文字列で指定してください。',
      });
    } else {
      value.description = payload.description;
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'dueDate')) {
    if (typeof payload.dueDate !== 'string') {
      errors.push({
        field: 'dueDate',
        message: '期限は YYYY-MM-DD 形式の文字列で指定してください。',
      });
    } else {
      const normalized = payload.dueDate.trim();
      if (normalized === '') {
        value.dueDate = '';
      } else if (!DATE_PATTERN.test(normalized)) {
        errors.push({
          field: 'dueDate',
          message: '期限は YYYY-MM-DD 形式で入力してください。',
        });
      } else {
        value.dueDate = normalized;
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'done')) {
    if (typeof payload.done !== 'boolean') {
      errors.push({
        field: 'done',
        message: '完了フラグは true/false で指定してください。',
      });
    } else {
      value.done = payload.done;
    }
  }

  return { value, errors };
}

function sendProblem(res, status, detail, errors) {
  const problem = {
    type: 'about:blank',
    title: STATUS_CODES[status] || 'Error',
    status,
    detail,
  };
  if (Array.isArray(errors) && errors.length > 0) {
    problem.errors = errors;
  }
  res.status(status);
  res.set('Content-Type', 'application/problem+json; charset=utf-8');
  res.send(JSON.stringify(problem));
}

async function main() {
  try {
    await ensureDatabase();
    app.listen(PORT, () => {
      console.info(`[HTTP] listening on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
