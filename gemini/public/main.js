document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const taskForm = document.getElementById('task-form');
    const taskList = document.getElementById('task-list');
    const titleInput = document.getElementById('title');
    const descriptionInput = document.getElementById('description');
    const dueDateInput = document.getElementById('dueDate');
    const addTaskBtn = document.getElementById('add-task-btn');
    const loadingIndicator = document.getElementById('loading-indicator');
    const emptyState = document.getElementById('empty-state');
    const errorContainer = document.getElementById('error-container');
    const filterIncomplete = document.getElementById('filter-incomplete');

    // Edit Modal Elements
    const editModal = document.getElementById('edit-modal');
    const editForm = document.getElementById('edit-form');
    const editTaskId = document.getElementById('edit-task-id');
    const editTitle = document.getElementById('edit-title');
    const editDescription = document.getElementById('edit-description');
    const editDueDate = document.getElementById('edit-dueDate');
    const saveEditBtn = document.getElementById('save-edit-btn');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');

    const apiBase = '/api/tasks';

    // --- Utility Functions ---
    const showLoading = (isLoading) => {
        loadingIndicator.hidden = !isLoading;
    };

    const showError = (message, errors = []) => {
        let fullMessage = `<p>${message}</p>`;
        if (errors.length > 0) {
            fullMessage += '<ul>';
            errors.forEach(err => {
                fullMessage += `<li>${err.field}: ${err.message}</li>`;
            });
            fullMessage += '</ul>';
        }
        errorContainer.innerHTML = fullMessage;
        errorContainer.hidden = false;
    };

    const clearError = () => {
        errorContainer.hidden = true;
        errorContainer.innerHTML = '';
    };
    
    const formatDate = (dateString) => {
        if (!dateString) return '期限なし';
        // Avoid time zone issues by parsing manually
        const [year, month, day] = dateString.split('-');
        return `${year}年${month}月${day}日`;
    };

    // --- Rendering ---
    const renderTasks = (tasks) => {
        taskList.innerHTML = '';
        if (tasks.length === 0) {
            emptyState.hidden = false;
            taskList.hidden = true;
        } else {
            emptyState.hidden = true;
            taskList.hidden = false;
            tasks.forEach(task => {
                const taskElement = createTaskElement(task);
                taskList.appendChild(taskElement);
            });
        }
    };

    const createTaskElement = (task) => {
        const li = document.createElement('li');
        li.className = `task-item ${task.done ? 'done' : ''}`;
        li.dataset.taskId = task.id;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = task.done;
        checkbox.setAttribute('aria-label', `タスク「${task.title}」を完了にする`);
        checkbox.addEventListener('change', () => toggleTaskDone(task.id, checkbox));

        const content = document.createElement('div');
        content.className = 'content';
        
        const title = document.createElement('span');
        title.className = 'title';
        title.textContent = task.title;
        content.appendChild(title);

        if (task.description) {
            const description = document.createElement('p');
            description.className = 'description';
            description.textContent = task.description;
            content.appendChild(description);
        }

        if (task.dueDate) {
            const dueDate = document.createElement('p');
            dueDate.className = 'due-date';
            dueDate.textContent = formatDate(task.dueDate);
            content.appendChild(dueDate);
        }

        const actions = document.createElement('div');
        actions.className = 'actions';
        const editBtn = document.createElement('button');
        editBtn.textContent = '編集';
        editBtn.setAttribute('aria-label', `タスク「${task.title}」を編集する`);
        editBtn.addEventListener('click', () => openEditModal(task));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '削除';
        deleteBtn.setAttribute('aria-label', `タスク「${task.title}」を削除する`);
        deleteBtn.addEventListener('click', () => deleteTask(task.id, li));

        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);

        li.appendChild(checkbox);
        li.appendChild(content);
        li.appendChild(actions);

        return li;
    };
    
    const updateTaskInDOM = (updatedTask) => {
        const taskElement = document.querySelector(`[data-task-id="${updatedTask.id}"]`);
        if (taskElement) {
            const newTaskElement = createTaskElement(updatedTask);
            taskElement.replaceWith(newTaskElement);
        }
    };

    // --- API Calls ---
    const fetchTasks = async () => {
        showLoading(true);
        clearError();
        const url = filterIncomplete.checked ? `${apiBase}?done=false` : apiBase;
        try {
            const res = await fetch(url);
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({ detail: `サーバーエラー: ${res.status}` }));
                throw new Error(errorData.detail);
            }
            const tasks = await res.json();
            renderTasks(tasks);
        } catch (error) {
            showError(error.message || 'タスクの読み込みに失敗しました。');
        } finally {
            showLoading(false);
        }
    };

    const deleteTask = async (id, element) => {
        if (confirm('本当にこのタスクを削除しますか？')) {
            try {
                const res = await fetch(`${apiBase}/${id}`, { method: 'DELETE' });
                if (res.status === 204) {
                    element.remove();
                    if (taskList.children.length === 0) {
                        emptyState.hidden = false;
                        taskList.hidden = true;
                    }
                } else {
                     const errorData = await res.json();
                     throw new Error(errorData.detail || '削除に失敗');
                }
            } catch (error) {
                showError(error.message || 'タスクの削除に失敗しました。');
            }
        }
    };
    
    const toggleTaskDone = async (id, checkbox) => {
        checkbox.disabled = true;
        try {
            const res = await fetch(`${apiBase}/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ done: checkbox.checked }),
            });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.detail || '更新に失敗');
            }
            const updatedTask = await res.json();
            const taskElement = checkbox.closest('.task-item');
            taskElement.classList.toggle('done', updatedTask.done);
            if (filterIncomplete.checked && updatedTask.done) {
                taskElement.remove();
                 if (taskList.children.length === 0) {
                    emptyState.hidden = false;
                    taskList.hidden = true;
                }
            }
        } catch (error) {
            showError(error.message || 'タスクの更新に失敗しました。');
            checkbox.checked = !checkbox.checked; // Revert on error
        }
        finally {
            checkbox.disabled = false;
        }
    };

    // --- Event Listeners ---
    taskForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearError();
        const title = titleInput.value.trim();
        if (!title) {
            showError('タイトルは必須です。', [{field: 'title', message: 'title is required'}]);
            return;
        };

        const taskData = {
            title,
            description: descriptionInput.value.trim(),
            dueDate: dueDateInput.value || ''
        };

        addTaskBtn.disabled = true;

        try {
            const res = await fetch(apiBase, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(taskData),
            });

            if (res.status === 201) {
                const newTask = await res.json();
                const taskElement = createTaskElement(newTask);
                taskList.prepend(taskElement);
                taskForm.reset();
                emptyState.hidden = true;
                taskList.hidden = false;
            } else {
                const errorData = await res.json();
                showError(errorData.detail, errorData.errors);
            }
        } catch (error) {
            showError('タスクの作成に失敗しました。');
        } finally {
            addTaskBtn.disabled = false;
        }
    });

    filterIncomplete.addEventListener('change', fetchTasks);

    // --- Edit Modal Logic ---
    const openEditModal = (task) => {
        editTaskId.value = task.id;
        editTitle.value = task.title;
        editDescription.value = task.description || '';
        editDueDate.value = task.dueDate || '';
        editModal.hidden = false;
    };

    const closeEditModal = () => {
        editModal.hidden = true;
        clearError(); // Clear errors when closing modal
    };

    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        saveEditBtn.disabled = true;
        clearError();

        const id = editTaskId.value;
        const updatedData = {
            title: editTitle.value.trim(),
            description: editDescription.value.trim(),
            dueDate: editDueDate.value || '',
        };

        try {
            const res = await fetch(`${apiBase}/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedData),
            });

            if (res.ok) {
                const updatedTask = await res.json();
                updateTaskInDOM(updatedTask);
                closeEditModal();
            } else {
                const errorData = await res.json();
                showError(errorData.detail, errorData.errors);
            }
        } catch (error) {
            showError('タスクの更新に失敗しました。');
        } finally {
            saveEditBtn.disabled = false;
        }
    });

    cancelEditBtn.addEventListener('click', closeEditModal);
    editModal.addEventListener('click', (e) => {
        if (e.target === editModal) {
            closeEditModal();
        }
    });


    // --- Initial Load ---
    fetchTasks();
});
