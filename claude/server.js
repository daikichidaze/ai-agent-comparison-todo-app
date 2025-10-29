const express = require('express');
const path = require('path');
const db = require('./db');

const PORT = process.env.PORT || 8080;
const app = express();

// Middleware
app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Validation helpers
function normalizeString(str) {
  if (typeof str !== 'string') return str;
  return str.normalize('NFC').trim();
}

function validateTitle(title) {
  const errors = [];
  if (!title || typeof title !== 'string') {
    errors.push({ field: 'title', message: 'title is required' });
  } else {
    const normalized = normalizeString(title);
    if (normalized.length === 0) {
      errors.push({ field: 'title', message: 'title is required' });
    } else if (normalized.length > 100) {
      errors.push({ field: 'title', message: 'title must be 1-100 characters' });
    } else if (normalized.includes('\n')) {
      errors.push({ field: 'title', message: 'title cannot contain newlines' });
    }
  }
  return errors;
}

function validateDescription(desc) {
  const errors = [];
  if (desc !== undefined && desc !== null) {
    if (typeof desc !== 'string') {
      errors.push({ field: 'description', message: 'description must be a string' });
    } else {
      const normalized = normalizeString(desc);
      if (normalized.length > 1000) {
        errors.push({ field: 'description', message: 'description must be 0-1000 characters' });
      }
    }
  }
  return errors;
}

function validateDueDate(dueDate) {
  const errors = [];
  if (dueDate !== undefined && dueDate !== null) {
    if (typeof dueDate !== 'string') {
      errors.push({ field: 'dueDate', message: 'dueDate must be a string' });
    } else {
      const normalized = normalizeString(dueDate);
      if (normalized.length > 0) {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(normalized)) {
          errors.push({ field: 'dueDate', message: 'must be YYYY-MM-DD or empty' });
        } else {
          // Validate date exists
          const date = new Date(normalized + 'T00:00:00Z');
          if (isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
            errors.push({ field: 'dueDate', message: 'must be a valid date' });
          }
        }
      }
    }
  }
  return errors;
}

function validateDone(done) {
  const errors = [];
  if (done !== undefined && done !== null) {
    if (typeof done !== 'boolean') {
      errors.push({ field: 'done', message: 'done must be a boolean' });
    }
  }
  return errors;
}

function errorResponse(status, title, detail, errors = []) {
  return {
    type: 'about:blank',
    title,
    status,
    detail,
    errors
  };
}

// Error handling middleware for JSON parsing
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400)
      .set('Content-Type', 'application/problem+json; charset=utf-8')
      .json(errorResponse(400, 'Bad Request', 'Invalid JSON'));
  }
  if (err.status === 413) {
    return res.status(400)
      .set('Content-Type', 'application/problem+json; charset=utf-8')
      .json(errorResponse(400, 'Bad Request', 'Payload too large'));
  }
  next();
});

// GET /api/tasks - Get all tasks or filter by done status
app.get('/api/tasks', async (req, res) => {
  try {
    const { done } = req.query;

    if (done !== undefined) {
      if (done !== 'true' && done !== 'false') {
        return res.status(400)
          .set('Content-Type', 'application/problem+json; charset=utf-8')
          .json(errorResponse(400, 'Bad Request', 'done query must be "true" or "false"'));
      }
    }

    let doneFilter = null;
    if (done === 'true') doneFilter = true;
    if (done === 'false') doneFilter = false;

    const tasks = await db.getTasks(doneFilter);

    res.status(200)
      .set('Content-Type', 'application/json; charset=utf-8')
      .set('Cache-Control', 'no-store')
      .json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500)
      .set('Content-Type', 'application/problem+json; charset=utf-8')
      .json(errorResponse(500, 'Internal Server Error', 'Failed to fetch tasks'));
  }
});

// GET /api/tasks/:id - Get a specific task
app.get('/api/tasks/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400)
        .set('Content-Type', 'application/problem+json; charset=utf-8')
        .json(errorResponse(400, 'Bad Request', 'Invalid task ID'));
    }

    const task = await db.getTaskById(id);
    if (!task) {
      return res.status(404)
        .set('Content-Type', 'application/problem+json; charset=utf-8')
        .json(errorResponse(404, 'Not Found', 'Task not found'));
    }

    res.status(200)
      .set('Content-Type', 'application/json; charset=utf-8')
      .set('Cache-Control', 'no-store')
      .json(task);
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(500)
      .set('Content-Type', 'application/problem+json; charset=utf-8')
      .json(errorResponse(500, 'Internal Server Error', 'Failed to fetch task'));
  }
});

// POST /api/tasks - Create a new task
app.post('/api/tasks', async (req, res) => {
  try {
    const { title, description, dueDate, ...unknownFields } = req.body;

    // Check for unknown fields
    if (Object.keys(unknownFields).length > 0) {
      return res.status(400)
        .set('Content-Type', 'application/problem+json; charset=utf-8')
        .json(errorResponse(400, 'Bad Request', 'Unknown fields in request'));
    }

    // Validate fields
    const errors = [];
    errors.push(...validateTitle(title));
    errors.push(...validateDescription(description));
    errors.push(...validateDueDate(dueDate));

    if (errors.length > 0) {
      return res.status(422)
        .set('Content-Type', 'application/problem+json; charset=utf-8')
        .json(errorResponse(422, 'Unprocessable Entity', 'Validation failed.', errors));
    }

    // Normalize values
    const normalizedTitle = normalizeString(title);
    const normalizedDesc = description ? normalizeString(description) : '';
    const normalizedDue = dueDate ? normalizeString(dueDate) : '';

    const task = await db.createTask(normalizedTitle, normalizedDesc, normalizedDue);

    res.status(201)
      .set('Content-Type', 'application/json; charset=utf-8')
      .set('Location', `/api/tasks/${task.id}`)
      .json(task);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500)
      .set('Content-Type', 'application/problem+json; charset=utf-8')
      .json(errorResponse(500, 'Internal Server Error', 'Failed to create task'));
  }
});

// PATCH /api/tasks/:id - Update a task
app.patch('/api/tasks/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400)
        .set('Content-Type', 'application/problem+json; charset=utf-8')
        .json(errorResponse(400, 'Bad Request', 'Invalid task ID'));
    }

    const { title, description, dueDate, done, ...unknownFields } = req.body;

    // Check for unknown fields
    if (Object.keys(unknownFields).length > 0) {
      return res.status(400)
        .set('Content-Type', 'application/problem+json; charset=utf-8')
        .json(errorResponse(400, 'Bad Request', 'Unknown fields in request'));
    }

    // Validate fields
    const errors = [];
    if (title !== undefined && title !== null) {
      errors.push(...validateTitle(title));
    }
    if (description !== undefined && description !== null) {
      errors.push(...validateDescription(description));
    }
    if (dueDate !== undefined && dueDate !== null) {
      errors.push(...validateDueDate(dueDate));
    }
    if (done !== undefined && done !== null) {
      errors.push(...validateDone(done));
    }

    if (errors.length > 0) {
      return res.status(422)
        .set('Content-Type', 'application/problem+json; charset=utf-8')
        .json(errorResponse(422, 'Unprocessable Entity', 'Validation failed.', errors));
    }

    // Check if task exists
    const task = await db.getTaskById(id);
    if (!task) {
      return res.status(404)
        .set('Content-Type', 'application/problem+json; charset=utf-8')
        .json(errorResponse(404, 'Not Found', 'Task not found'));
    }

    // Prepare updates
    const updates = {};
    if (title !== undefined && title !== null) {
      updates.title = normalizeString(title);
    }
    if (description !== undefined && description !== null) {
      updates.description = normalizeString(description);
    }
    if (dueDate !== undefined && dueDate !== null) {
      updates.dueDate = normalizeString(dueDate);
    }
    if (done !== undefined && done !== null) {
      updates.done = done ? 1 : 0;
    }

    const updatedTask = await db.updateTask(id, updates);

    res.status(200)
      .set('Content-Type', 'application/json; charset=utf-8')
      .json(updatedTask);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500)
      .set('Content-Type', 'application/problem+json; charset=utf-8')
      .json(errorResponse(500, 'Internal Server Error', 'Failed to update task'));
  }
});

// DELETE /api/tasks/:id - Delete a task
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400)
        .set('Content-Type', 'application/problem+json; charset=utf-8')
        .json(errorResponse(400, 'Bad Request', 'Invalid task ID'));
    }

    const task = await db.getTaskById(id);
    if (!task) {
      return res.status(404)
        .set('Content-Type', 'application/problem+json; charset=utf-8')
        .json(errorResponse(404, 'Not Found', 'Task not found'));
    }

    await db.deleteTask(id);

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500)
      .set('Content-Type', 'application/problem+json; charset=utf-8')
      .json(errorResponse(500, 'Internal Server Error', 'Failed to delete task'));
  }
});

// Start server
async function start() {
  try {
    await db.initDb();
    app.listen(PORT, () => {
      console.log(`[Server] Listening on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
