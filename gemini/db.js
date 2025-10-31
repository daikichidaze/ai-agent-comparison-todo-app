const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const dbFile = './todo.db';
const dbExists = fs.existsSync(dbFile);

const db = new sqlite3.Database(dbFile, (err) => {
  if (err) {
    console.error('[DB] Error opening database', err.message);
    throw err;
  }
  console.log('[DB] Connected to the SQLite database.');
});

function initDb() {
  return new Promise((resolve, reject) => {
    if (!dbExists) {
      const schema = fs.readFileSync('./schema.sql', 'utf8');
      db.exec(schema, (err) => {
        if (err) {
          console.error('[DB] Error applying schema', err.message);
          return reject(err);
        }
        console.log('[DB] migrated');
        resolve();
      });
    } else {
      console.log('[DB] Database already exists.');
      resolve();
    }
  });
}

// DB snake_case to API camelCase
function toCamelCase(dbRow) {
  if (!dbRow) return null;
  return {
    id: dbRow.id,
    title: dbRow.title,
    description: dbRow.description,
    dueDate: dbRow.due_date,
    done: !!dbRow.done,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
  };
}

module.exports = { db, initDb, toCamelCase };
