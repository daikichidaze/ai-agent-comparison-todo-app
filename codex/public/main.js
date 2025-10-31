(() => {
  const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

  const form = document.getElementById('task-form');
  const titleInput = document.getElementById('title-input');
  const descriptionInput = document.getElementById('description-input');
  const dueDateInput = document.getElementById('due-date-input');
  const submitButton = document.getElementById('submit-button');
  const formError = document.getElementById('form-error');

  const taskList = document.getElementById('task-list');
  const emptyState = document.getElementById('empty-state');
  const listError = document.getElementById('list-error');
  const loadingIndicator = document.getElementById('loading-indicator');
  const filterUndoneCheckbox = document.getElementById('filter-undone');
  const refreshButton = document.getElementById('refresh-button');

  let tasks = [];
  let filterUndoneOnly = false;
  let isLoading = false;

  form.addEventListener('submit', handleCreateTask);
  taskList.addEventListener('change', handleTaskToggle);
  taskList.addEventListener('click', handleTaskActions);
  filterUndoneCheckbox.addEventListener('change', handleFilterChange);
  refreshButton.addEventListener('click', () => {
    void loadTasks();
  });

  void loadTasks();

  async function loadTasks() {
    setListError('');
    setLoading(true);
    try {
      const query = filterUndoneOnly ? '?done=false' : '';
      const response = await fetch(`/api/tasks${query}`, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        await handleListError(response);
        return;
      }
      tasks = await response.json();
      renderTasks();
    } catch (error) {
      console.error(error);
      setListError('一覧の取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  }

  function renderTasks() {
    const fragment = document.createDocumentFragment();
    for (const task of tasks) {
      fragment.appendChild(createTaskElement(task));
    }
    taskList.replaceChildren(fragment);
    updateEmptyState();
  }

  async function handleCreateTask(event) {
    event.preventDefault();
    const title = titleInput.value.trim();
    if (title === '') {
      setFormError('タイトルを入力してください。');
      titleInput.focus();
      return;
    }

    const description = descriptionInput.value ?? '';
    const dueDate = dueDateInput.value;

    setFormError('');
    setFormSubmitting(true);
    try {
      const payload = {
        title,
        description,
        dueDate,
      };

      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const message = await extractProblemMessage(response);
        setFormError(message ?? 'タスクの作成に失敗しました。');
        return;
      }

      const task = await response.json();
      form.reset();
      titleInput.focus();
      if (matchesCurrentFilter(task)) {
        tasks.unshift(task);
        renderTasks();
      }
    } catch (error) {
      console.error(error);
      setFormError('タスクの作成に失敗しました。');
    } finally {
      setFormSubmitting(false);
    }
  }

  async function handleTaskToggle(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (!target.classList.contains('task-checkbox')) {
      return;
    }

    const id = Number.parseInt(target.dataset.taskId ?? '', 10);
    if (!Number.isInteger(id)) {
      return;
    }
    const requestedDone = target.checked;
    target.disabled = true;
    setListError('');
    try {
      const updatedTask = await patchTask(id, { done: requestedDone });
      applyTaskUpdate(updatedTask);
    } catch (error) {
      console.error(error);
      target.checked = !requestedDone;
      if (error && typeof error === 'object' && 'message' in error) {
        setListError(error.message);
      } else {
        setListError('完了状態の更新に失敗しました。');
      }
    } finally {
      target.disabled = false;
    }
  }

  async function handleTaskActions(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const button = target.closest('button');
    if (!button) {
      return;
    }

    const id = Number.parseInt(button.dataset.taskId ?? '', 10);
    if (!Number.isInteger(id)) {
      return;
    }

    if (button.classList.contains('edit-button')) {
      await handleEditTask(id, button);
    } else if (button.classList.contains('delete-button')) {
      await handleDeleteTask(id, button);
    }
  }

  async function handleEditTask(id, button) {
    const task = tasks.find((item) => item.id === id);
    if (!task) {
      void loadTasks();
      return;
    }

    const newTitleRaw = window.prompt('タイトルを入力してください', task.title);
    if (newTitleRaw === null) {
      return;
    }
    const newTitle = newTitleRaw.trim();
    if (newTitle === '') {
      setListError('タイトルは必須です。');
      return;
    }

    const newDescription = window.prompt(
      '説明を入力してください（空欄可）',
      task.description
    );
    if (newDescription === null) {
      return;
    }

    const newDueDateRaw = window.prompt(
      '期限を入力してください（YYYY-MM-DD、空欄可）',
      task.dueDate ?? ''
    );
    if (newDueDateRaw === null) {
      return;
    }
    const newDueDate = newDueDateRaw.trim();
    if (newDueDate !== '' && !DATE_PATTERN.test(newDueDate)) {
      setListError('期限は YYYY-MM-DD の形式で入力してください。');
      return;
    }

    const payload = {};
    if (newTitle !== task.title) {
      payload.title = newTitle;
    }
    if (newDescription !== task.description) {
      payload.description = newDescription;
    }
    if (newDueDate !== (task.dueDate ?? '')) {
      payload.dueDate = newDueDate;
    }

    if (Object.keys(payload).length === 0) {
      return;
    }

    setListError('');
    button.disabled = true;
    try {
      const updatedTask = await patchTask(id, payload);
      applyTaskUpdate(updatedTask);
    } catch (error) {
      console.error(error);
      if (error && typeof error === 'object' && 'message' in error) {
        setListError(error.message);
      } else {
        setListError('タスクの更新に失敗しました。');
      }
    } finally {
      button.disabled = false;
    }
  }

  async function handleDeleteTask(id, button) {
    const task = tasks.find((item) => item.id === id);
    if (!task) {
      void loadTasks();
      return;
    }

    const confirmed = window.confirm('このタスクを削除しますか？');
    if (!confirmed) {
      return;
    }

    button.disabled = true;
    setListError('');
    try {
      const response = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const message = await extractProblemMessage(response);
        throw new Error(message ?? 'タスクの削除に失敗しました。');
      }
      tasks = tasks.filter((item) => item.id !== id);
      renderTasks();
    } catch (error) {
      console.error(error);
      if (error && typeof error === 'object' && 'message' in error) {
        setListError(error.message);
      } else {
        setListError('タスクの削除に失敗しました。');
      }
    } finally {
      button.disabled = false;
    }
  }

  function applyTaskUpdate(updatedTask) {
    const index = tasks.findIndex((item) => item.id === updatedTask.id);
    if (index === -1) {
      if (matchesCurrentFilter(updatedTask)) {
        tasks.unshift(updatedTask);
        renderTasks();
      }
      return;
    }

    if (!matchesCurrentFilter(updatedTask)) {
      tasks.splice(index, 1);
    } else {
      tasks[index] = updatedTask;
    }
    renderTasks();
  }

  async function patchTask(id, payload) {
    const response = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const message = await extractProblemMessage(response);
      throw new Error(message ?? 'サーバーエラーが発生しました。');
    }
    return await response.json();
  }

  function matchesCurrentFilter(task) {
    if (!filterUndoneOnly) {
      return true;
    }
    return task.done === false;
  }

  function createTaskElement(task) {
    const item = document.createElement('li');
    item.className = 'task-item';
    item.dataset.taskId = String(task.id);

    const header = document.createElement('div');
    header.className = 'task-header';

    const titleContainer = document.createElement('div');
    titleContainer.className = 'task-title';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'task-checkbox';
    checkbox.checked = task.done;
    checkbox.dataset.taskId = String(task.id);
    checkbox.setAttribute('aria-label', `タスク「${task.title}」の完了状態を切り替え`);

    const titleText = document.createElement('span');
    titleText.textContent = task.title;
    if (task.done) {
      titleText.classList.add('task-done');
    }

    titleContainer.append(checkbox, titleText);

    const createdText = document.createElement('span');
    createdText.className = 'task-meta';
    createdText.textContent = `作成: ${formatDateTime(task.createdAt)}`;

    header.append(titleContainer, createdText);
    item.appendChild(header);

    if (task.description) {
      const description = document.createElement('p');
      description.className = 'task-description';
      description.textContent = task.description;
      item.appendChild(description);
    }

    const meta = document.createElement('p');
    meta.className = 'task-meta';
    const dueLabel = task.dueDate ? `期限: ${task.dueDate}` : '期限: 未設定';
    meta.textContent = `${dueLabel} / 更新: ${formatDateTime(task.updatedAt)}`;
    item.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'task-actions';

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'edit-button';
    editButton.dataset.taskId = String(task.id);
    editButton.textContent = '編集';
    editButton.setAttribute('aria-label', `タスク「${task.title}」を編集`);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'delete-button';
    deleteButton.dataset.taskId = String(task.id);
    deleteButton.textContent = '削除';
    deleteButton.setAttribute('aria-label', `タスク「${task.title}」を削除`);

    actions.append(editButton, deleteButton);
    item.appendChild(actions);

    return item;
  }

  function formatDateTime(input) {
    try {
      const date = new Date(input);
      if (Number.isNaN(date.getTime())) {
        return input;
      }
      return new Intl.DateTimeFormat('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    } catch {
      return input;
    }
  }

  function setFormSubmitting(isSubmitting) {
    submitButton.disabled = isSubmitting;
    form.querySelectorAll('input, textarea').forEach((element) => {
      element.disabled = isSubmitting;
    });
  }

  function setFormError(message) {
    formError.textContent = message ?? '';
  }

  function setListError(message) {
    listError.textContent = message ?? '';
  }

  function updateEmptyState() {
    const showEmpty = tasks.length === 0 && !isLoading;
    emptyState.hidden = !showEmpty;
  }

  function setLoading(loading) {
    isLoading = loading;
    loadingIndicator.hidden = !loading;
    refreshButton.disabled = loading;
  }

  function handleFilterChange() {
    filterUndoneOnly = filterUndoneCheckbox.checked;
    void loadTasks();
  }

  async function extractProblemMessage(response) {
    try {
      const data = await response.json();
      const errors = Array.isArray(data.errors)
        ? data.errors.map((error) => error.message).filter(Boolean)
        : [];
      if (errors.length > 0) {
        return `${data.detail ?? ''} ${errors.join(' ')}`.trim();
      }
      if (typeof data.detail === 'string' && data.detail !== '') {
        return data.detail;
      }
    } catch (error) {
      console.error('Failed to parse problem JSON', error);
    }
    return null;
  }

  async function handleListError(response) {
    const message = await extractProblemMessage(response);
    setListError(message ?? '一覧の取得に失敗しました。');
  }
})();
