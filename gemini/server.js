
const express = require('express');
const path = require('path');
const { db, initDb, toCamelCase } = require('./db');

const app = express();
const PORT = process.env.PORT || 8080;

// --- Middleware ---
app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- Helper Functions ---
const sendProblemJson = (res, status, title, detail, errors) => {
  res.status(status).type('application/problem+json').send({
    type: 'about:blank',
    title,
    status,
    detail,
    ...(errors && { errors }),
  });
};

const isValidDate = (dateString) => {
    if (dateString === '') return true; // Allow empty string
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return false;
    }
    const parts = dateString.split('-').map(p => parseInt(p, 10));
    const year = parts[0];
    const month = parts[1];
    const day = parts[2];
    // Note: month is 0-indexed in new Date()
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
};

// --- API Routes ---

// GET /api/tasks - List tasks
app.get('/api/tasks', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const { done } = req.query;
  let query = 'SELECT * FROM tasks ORDER BY datetime(created_at) DESC, id DESC';
  const params = [];

  if (done !== undefined) {
    if (done !== 'true' && done !== 'false') {
      return sendProblemJson(res, 400, 'Bad Request', 'Invalid query parameter for done. Use "true" or "false".');
    }
    query = 'SELECT * FROM tasks WHERE done = ? ORDER BY datetime(created_at) DESC, id DESC';
    params.push(done === 'true' ? 1 : 0);
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      return sendProblemJson(res, 500, 'Internal Server Error', err.message);
    }
    res.json(rows.map(toCamelCase));
  });
});

// GET /api/tasks/:id - Get a single task
app.get('/api/tasks/:id', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return sendProblemJson(res, 400, 'Bad Request', 'ID must be an integer.');
  }

  db.get('SELECT * FROM tasks WHERE id = ?', [id], (err, row) => {
    if (err) {
      return sendProblemJson(res, 500, 'Internal Server Error', err.message);
    }
    if (!row) {
      return sendProblemJson(res, 404, 'Not Found', `Task with ID ${id} not found.`);
    }
    res.json(toCamelCase(row));
  });
});

// POST /api/tasks - Create a new task
app.post('/api/tasks', (req, res) => {
  const now = new Date().toISOString();
  const { title, description = '', dueDate = '' } = req.body;
  const validationErrors = [];

  const allowedFields = ['title', 'description', 'dueDate'];
  for (const key in req.body) {
    if (!allowedFields.includes(key)) {
      return sendProblemJson(res, 400, 'Bad Request', `Unknown field: ${key}`);
    }
  }

  // Validation
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    validationErrors.push({ field: 'title', message: 'title is required' });
  } else if (title.trim().length > 100) {
     validationErrors.push({ field: 'title', message: 'title must be 1-100 characters' });
  } else if (title.includes('\n')) {
     validationErrors.push({ field: 'title', message: 'title cannot contain newlines' });
  }

  if (typeof description !== 'string' || description.length > 1000) {
    validationErrors.push({ field: 'description', message: 'description must be 0-1000 characters' });
  }

  if (dueDate && !isValidDate(dueDate)) {
    validationErrors.push({ field: 'dueDate', message: 'must be a real date in YYYY-MM-DD format or empty' });
  }

  if (validationErrors.length > 0) {
    return sendProblemJson(res, 422, 'Unprocessable Entity', 'Validation failed.', validationErrors);
  }

  const sql = `INSERT INTO tasks (title, description, due_date, done, created_at, updated_at)
               VALUES (?, ?, ?, 0, ?, ?)`;
  const params = [title.trim().normalize('NFC'), description.trim().normalize('NFC'), dueDate.trim().normalize('NFC'), now, now];

  db.run(sql, params, function(err) {
    if (err) {
      return sendProblemJson(res, 500, 'Internal Server Error', err.message);
    }
    const newId = this.lastID;
    db.get('SELECT * FROM tasks WHERE id = ?', [newId], (err, row) => {
        if (err) {
            return sendProblemJson(res, 500, 'Internal Server Error', err.message);
        }
        res.status(201).location(`/api/tasks/${newId}`).json(toCamelCase(row));
    });
  });
});

// PATCH /api/tasks/:id - Update a task
app.patch('/api/tasks/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        return sendProblemJson(res, 400, 'Bad Request', 'ID must be an integer.');
    }

    const now = new Date().toISOString();
    const { title, description, dueDate, done } = req.body;
    const updates = [];
    const params = [];
    const validationErrors = [];

    const allowedFields = ['title', 'description', 'dueDate', 'done'];
    for (const key in req.body) {
        if (!allowedFields.includes(key)) {
            return sendProblemJson(res, 400, 'Bad Request', `Unknown field: ${key}`);
        }
    }

    if (title !== undefined) {
        if (!title || typeof title !== 'string' || title.trim().length === 0) {
            validationErrors.push({ field: 'title', message: 'title is required' });
        } else if (title.trim().length > 100) {
            validationErrors.push({ field: 'title', message: 'title must be 1-100 characters' });
        } else if (title.includes('\n')) {
            validationErrors.push({ field: 'title', message: 'title cannot contain newlines' });
        } else {
            updates.push('title = ?');
            params.push(title.trim().normalize('NFC'));
        }
    }
    if (description !== undefined) {
        if (typeof description !== 'string' || description.length > 1000) {
            validationErrors.push({ field: 'description', message: 'description must be 0-1000 characters' });
        } else {
            updates.push('description = ?');
            params.push(description.trim().normalize('NFC'));
        }
    }
    if (dueDate !== undefined) {
        if (!isValidDate(dueDate)) {
            validationErrors.push({ field: 'dueDate', message: 'must be a real date in YYYY-MM-DD format or empty' });
        } else {
            updates.push('due_date = ?');
            params.push(dueDate.trim().normalize('NFC'));
        }
    }
    if (done !== undefined) {
        if (typeof done !== 'boolean') {
            validationErrors.push({ field: 'done', message: 'done must be a boolean' });
        } else {
            updates.push('done = ?');
            params.push(done ? 1 : 0);
        }
    }

    if (validationErrors.length > 0) {
        return sendProblemJson(res, 422, 'Unprocessable Entity', 'Validation failed.', validationErrors);
    }

    if (updates.length === 0) {
        // Nothing to update, just return current state
        return db.get('SELECT * FROM tasks WHERE id = ?', [id], (err, row) => {
            if (err) { return sendProblemJson(res, 500, 'Internal Server Error', err.message); }
            if (!row) { return sendProblemJson(res, 404, 'Not Found', `Task with ID ${id} not found.`); }
            res.json(toCamelCase(row));
        });
    }

    updates.push('updated_at = ?');
    params.push(now, id);

    const sql = `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`;

    db.run(sql, params, function(err) {
        if (err) { return sendProblemJson(res, 500, 'Internal Server Error', err.message); }
        if (this.changes === 0) { return sendProblemJson(res, 404, 'Not Found', `Task with ID ${id} not found.`); }

        db.get('SELECT * FROM tasks WHERE id = ?', [id], (err, row) => {
            if (err) { return sendProblemJson(res, 500, 'Internal Server Error', err.message); }
            res.json(toCamelCase(row));
        });
    });
});


// DELETE /api/tasks/:id - Delete a task
app.delete('/api/tasks/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return sendProblemJson(res, 400, 'Bad Request', 'ID must be an integer.');
  }

  db.run('DELETE FROM tasks WHERE id = ?', [id], function(err) {
    if (err) {
      return sendProblemJson(res, 500, 'Internal Server Error', err.message);
    }
    if (this.changes === 0) {
      return sendProblemJson(res, 404, 'Not Found', `Task with ID ${id} not found.`);
    }
    res.status(204).send();
  });
});


// --- Server Initialization ---
async function startServer() {
  try {
    await initDb();
    app.listen(PORT, () => {
      console.log(`[INFO] Server listening on http://localhost:${PORT}`);
      console.log(`[INFO] Serving static files from: ${path.join(__dirname, 'public')}`);
      console.log(`[INFO] Database file location: ${path.resolve('./todo.db')}`);
    });
  } catch (err) {
    console.error('[FATAL] Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
