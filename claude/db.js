const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DB_FILE = 'todo.db';
const SCHEMA_FILE = path.join(__dirname, 'schema.sql');

let db = null;

function initDb() {
  return new Promise((resolve, reject) => {
    const isNewDb = !fs.existsSync(DB_FILE);

    db = new sqlite3.Database(DB_FILE, (err) => {
      if (err) {
        console.error('[DB] Error connecting to database:', err);
        reject(err);
        return;
      }

      if (isNewDb) {
        const schema = fs.readFileSync(SCHEMA_FILE, 'utf-8');
        db.exec(schema, (err) => {
          if (err) {
            console.error('[DB] Error running schema:', err);
            reject(err);
            return;
          }
          console.log('[DB] migrated');
          resolve();
        });
      } else {
        resolve();
      }
    });
  });
}

function getDb() {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

// Convert snake_case to camelCase
function toCamelCase(obj) {
  if (!obj) return obj;
  const result = {};
  for (const key in obj) {
    const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
    result[camelKey] = obj[key];
  }
  return result;
}

// Convert camelCase to snake_case
function toSnakeCase(obj) {
  if (!obj) return obj;
  const result = {};
  for (const key in obj) {
    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    result[snakeKey] = obj[key];
  }
  return result;
}

// Query helpers
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ id: this.lastID, changes: this.changes });
      }
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row ? toCamelCase(row) : null);
      }
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows ? rows.map(toCamelCase) : []);
      }
    });
  });
}

// Task queries
async function getTasks(done = null) {
  let sql = 'SELECT * FROM tasks ORDER BY datetime(created_at) DESC, id DESC';
  const params = [];

  if (done !== null) {
    sql = 'SELECT * FROM tasks WHERE done = ? ORDER BY datetime(created_at) DESC, id DESC';
    params.push(done ? 1 : 0);
  }

  return all(sql, params);
}

async function getTaskById(id) {
  const sql = 'SELECT * FROM tasks WHERE id = ?';
  return get(sql, [id]);
}

async function createTask(title, description = '', dueDate = '') {
  const now = new Date().toISOString();
  const sql = `INSERT INTO tasks (title, description, due_date, done, created_at, updated_at)
               VALUES (?, ?, ?, 0, ?, ?)`;
  const params = [title, description, dueDate, now, now];
  const result = await run(sql, params);
  return getTaskById(result.id);
}

async function updateTask(id, updates) {
  const task = await getTaskById(id);
  if (!task) return null;

  const now = new Date().toISOString();
  const snakeCaseUpdates = toSnakeCase(updates);

  const fields = [];
  const values = [];

  for (const key in snakeCaseUpdates) {
    if (['title', 'description', 'due_date', 'done'].includes(key)) {
      fields.push(`${key} = ?`);
      values.push(snakeCaseUpdates[key]);
    }
  }

  if (fields.length === 0) return task;

  fields.push('updated_at = ?');
  values.push(now);
  values.push(id);

  const sql = `UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`;
  await run(sql, values);
  return getTaskById(id);
}

async function deleteTask(id) {
  const sql = 'DELETE FROM tasks WHERE id = ?';
  const result = await run(sql, [id]);
  return result.changes > 0;
}

module.exports = {
  initDb,
  getDb,
  getTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask
};
