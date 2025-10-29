// API Base URL
const API_BASE = '/api';

// DOM Elements
const taskForm = document.getElementById('taskForm');
const titleInput = document.getElementById('titleInput');
const descriptionInput = document.getElementById('descriptionInput');
const dueDateInput = document.getElementById('dueDateInput');
const submitBtn = document.getElementById('submitBtn');
const formError = document.getElementById('formError');

const showOnlyIncomplete = document.getElementById('showOnlyIncomplete');
const refreshBtn = document.getElementById('refreshBtn');

const taskList = document.getElementById('taskList');
const emptyState = document.getElementById('emptyState');

const editModal = document.getElementById('editModal');
const editForm = document.getElementById('editForm');
const cancelEditBtn = document.getElementById('cancelEditBtn');

let currentEditingTaskId = null;
let isSubmitting = false;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  console.log('[DEBUG] DOMContentLoaded - Initializing app');
  console.log('[DEBUG] taskList element:', taskList);
  console.log('[DEBUG] emptyState element:', emptyState);
  loadTasks();
  taskForm.addEventListener('submit', handleCreateTask);
  showOnlyIncomplete.addEventListener('change', loadTasks);
  refreshBtn.addEventListener('click', loadTasks);
  editForm.addEventListener('submit', handleEditTask);
  cancelEditBtn.addEventListener('click', closeEditModal);
});

// Load tasks
async function loadTasks() {
  console.log('[DEBUG] loadTasks called');
  try {
    let url = `${API_BASE}/tasks`;
    if (showOnlyIncomplete.checked) {
      url += '?done=false';
      console.log('[DEBUG] Filter: showing incomplete only');
    }
    console.log('[DEBUG] Fetching from:', url);

    const response = await fetch(url, {
      headers: { 'Cache-Control': 'no-store' }
    });

    if (!response.ok) {
      throw new Error('Failed to load tasks');
    }

    const tasks = await response.json();
    console.log('[DEBUG] Received tasks:', tasks);
    console.log('[DEBUG] Number of tasks:', tasks.length);
    renderTasks(tasks);
  } catch (error) {
    console.error('[DEBUG] Error loading tasks:', error);
  }
}

// Render tasks
function renderTasks(tasks) {
  console.log('[DEBUG] renderTasks called with', tasks.length, 'tasks');
  taskList.innerHTML = '';

  if (tasks.length === 0) {
    console.log('[DEBUG] No tasks, showing empty state');
    emptyState.style.display = 'block';
    return;
  }

  console.log('[DEBUG] Hiding empty state, rendering tasks');
  emptyState.style.display = 'none';

  tasks.forEach((task, index) => {
    console.log(`[DEBUG] Creating element for task ${index + 1}:`, task);
    const taskElement = createTaskElement(task);
    taskList.appendChild(taskElement);
  });
  console.log('[DEBUG] All tasks rendered. taskList children count:', taskList.children.length);
}

// Create task element
function createTaskElement(task) {
  const li = document.createElement('li');
  li.className = 'task-item';
  li.dataset.taskId = task.id;
  if (task.done) {
    li.classList.add('completed');
  }

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = task.done;
  checkbox.className = 'task-checkbox';
  checkbox.setAttribute('aria-label', `${task.title}を${task.done ? '未完了' : '完了'}にする`);
  checkbox.addEventListener('change', () => handleToggleTask(task.id, checkbox.checked, checkbox));

  const taskContent = document.createElement('div');
  taskContent.className = 'task-content';

  const title = document.createElement('div');
  title.className = 'task-title';
  title.textContent = task.title;

  taskContent.appendChild(title);

  if (task.description) {
    const description = document.createElement('div');
    description.className = 'task-description';
    description.textContent = task.description;
    taskContent.appendChild(description);
  }

  if (task.dueDate) {
    const dueDate = document.createElement('div');
    dueDate.className = 'task-due-date';
    dueDate.textContent = `期限: ${formatDate(task.dueDate)}`;
    taskContent.appendChild(dueDate);
  }

  const createdAt = document.createElement('div');
  createdAt.className = 'task-meta';
  createdAt.textContent = `作成: ${formatDateTime(task.createdAt)}`;
  taskContent.appendChild(createdAt);

  const actions = document.createElement('div');
  actions.className = 'task-actions';

  const editBtn = document.createElement('button');
  editBtn.textContent = '編集';
  editBtn.className = 'task-btn edit-btn';
  editBtn.setAttribute('aria-label', `${task.title}を編集`);
  editBtn.addEventListener('click', () => openEditModal(task));

  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = '削除';
  deleteBtn.className = 'task-btn delete-btn';
  deleteBtn.setAttribute('aria-label', `${task.title}を削除`);
  deleteBtn.addEventListener('click', () => handleDeleteTask(task.id, task.title));

  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);

  li.appendChild(checkbox);
  li.appendChild(taskContent);
  li.appendChild(actions);

  return li;
}

// Format date (YYYY-MM-DD)
function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Format datetime (YYYY-MM-DD HH:MM:SS)
function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Handle create task
async function handleCreateTask(e) {
  e.preventDefault();
  if (isSubmitting) return;

  isSubmitting = true;
  submitBtn.disabled = true;
  clearFormErrors();

  const title = titleInput.value.trim();
  const description = descriptionInput.value.trim();
  const dueDate = dueDateInput.value;

  try {
    const response = await fetch(`${API_BASE}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description,
        dueDate
      })
    });

    const data = await response.json();

    if (!response.ok) {
      handleApiError(data);
      return;
    }

    console.log('[DEBUG] Task created successfully:', data);
    // Add new task to the beginning of the list (immediate reflection)
    const newElement = createTaskElement(data);
    if (taskList.children.length === 0) {
      console.log('[DEBUG] List was empty, hiding empty state');
      emptyState.style.display = 'none';
    }
    taskList.insertBefore(newElement, taskList.firstChild);
    console.log('[DEBUG] New task added to DOM. taskList children count:', taskList.children.length);

    // Clear form
    taskForm.reset();
    titleInput.focus();

  } catch (error) {
    console.error('Error creating task:', error);
    showFormError('タスクの作成に失敗しました');
  } finally {
    isSubmitting = false;
    submitBtn.disabled = false;
  }
}

// Handle toggle task
async function handleToggleTask(taskId, isDone, checkbox) {
  checkbox.disabled = true;

  try {
    const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: isDone })
    });

    const data = await response.json();

    if (!response.ok) {
      checkbox.checked = !isDone;
      console.error('Error updating task:', data);
      return;
    }

    // Update UI
    const taskItem = checkbox.closest('.task-item');
    if (isDone) {
      taskItem.classList.add('completed');
    } else {
      taskItem.classList.remove('completed');
    }

  } catch (error) {
    checkbox.checked = !isDone;
    console.error('Error updating task:', error);
  } finally {
    checkbox.disabled = false;
  }
}

// Handle delete task
async function handleDeleteTask(taskId, taskTitle) {
  const confirmed = confirm(`「${taskTitle}」を削除しますか？`);
  if (!confirmed) return;

  try {
    const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      const data = await response.json();
      console.error('Error deleting task:', data);
      alert('タスクの削除に失敗しました');
      return;
    }

    // Remove from UI
    const taskItems = taskList.querySelectorAll('.task-item');
    taskItems.forEach(item => {
      if (item.querySelector('.task-title').textContent === taskTitle) {
        item.remove();
      }
    });

    // Check if list is empty
    if (taskList.querySelectorAll('.task-item').length === 0) {
      emptyState.style.display = 'block';
    }

  } catch (error) {
    console.error('Error deleting task:', error);
    alert('タスクの削除に失敗しました');
  }
}

// Open edit modal
function openEditModal(task) {
  currentEditingTaskId = task.id;
  document.getElementById('editTitleInput').value = task.title;
  document.getElementById('editDescriptionInput').value = task.description || '';
  document.getElementById('editDueDateInput').value = task.dueDate || '';
  editModal.style.display = 'block';
  document.getElementById('editTitleInput').focus();

  // Store reference to the task element
  editModal.dataset.taskId = task.id;
}

// Close edit modal
function closeEditModal() {
  editModal.style.display = 'none';
  currentEditingTaskId = null;
  editForm.reset();
  clearEditErrors();
}

// Handle edit task
async function handleEditTask(e) {
  e.preventDefault();
  if (!currentEditingTaskId) return;

  clearEditErrors();

  const title = document.getElementById('editTitleInput').value.trim();
  const description = document.getElementById('editDescriptionInput').value.trim();
  const dueDate = document.getElementById('editDueDateInput').value;

  const updates = {};
  if (title) updates.title = title;
  // Allow empty string for description (to clear it)
  updates.description = description;
  if (dueDate !== '') updates.dueDate = dueDate;

  try {
    const response = await fetch(`${API_BASE}/tasks/${currentEditingTaskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });

    const data = await response.json();

    if (!response.ok) {
      handleApiError(data, true);
      return;
    }

    // Update DOM directly without reloading
    const targetItem = taskList.querySelector(`[data-task-id="${currentEditingTaskId}"]`);

    if (targetItem) {
      const newElement = createTaskElement(data);
      targetItem.replaceWith(newElement);
    }

    closeEditModal();

  } catch (error) {
    console.error('Error updating task:', error);
    showEditError('タスクの更新に失敗しました');
  }
}

// Handle API error
function handleApiError(data, isEdit = false) {
  const errorPrefix = isEdit ? 'edit' : '';
  if (data.errors && data.errors.length > 0) {
    data.errors.forEach(error => {
      const fieldName = error.field;
      const message = error.message;
      const errorElement = document.getElementById(`${errorPrefix}${fieldName}Error`);
      if (errorElement) {
        errorElement.textContent = message;
      }
    });
  } else if (data.detail) {
    if (isEdit) {
      showEditError(data.detail);
    } else {
      showFormError(data.detail);
    }
  }
}

// Clear form errors
function clearFormErrors() {
  document.getElementById('titleError').textContent = '';
  document.getElementById('descriptionError').textContent = '';
  document.getElementById('dueDateError').textContent = '';
  formError.textContent = '';
}

// Clear edit errors
function clearEditErrors() {
  document.getElementById('editTitleError').textContent = '';
  document.getElementById('editDescriptionError').textContent = '';
  document.getElementById('editDueDateError').textContent = '';
  document.getElementById('editError').textContent = '';
}

// Show form error
function showFormError(message) {
  formError.textContent = message;
}

// Show edit error
function showEditError(message) {
  document.getElementById('editError').textContent = message;
}

// Close modal when clicking outside
editModal.addEventListener('click', (e) => {
  if (e.target === editModal) {
    closeEditModal();
  }
});
