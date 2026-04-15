const state = {
  tables: window.__APP_DATA__?.tables || [],
  sqlTypes: window.__APP_DATA__?.sqlTypes || [],
  currentTable: '',
  currentPage: 1,
  pageSize: 10,
  totalPages: 1,
  currentColumns: []
};

const tableSelect = document.getElementById('tableSelect');
const editTableSelect = document.getElementById('editTableSelect');
const deleteTableSelect = document.getElementById('deleteTableSelect');
const recordTableSelect = document.getElementById('recordTableSelect');
const recordsTable = document.getElementById('recordsTable');
const pageInfo = document.getElementById('pageInfo');
const filtersContainer = document.getElementById('filtersContainer');
const addFilterBtn = document.getElementById('addFilterBtn');
const clearFiltersBtn = document.getElementById('clearFiltersBtn');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const reloadRecordsBtn = document.getElementById('reloadRecordsBtn');
const pageSizeSelect = document.getElementById('pageSizeSelect');
const fkForm = document.getElementById('fkForm');
const fkDeleteForm = document.getElementById('fkDeleteForm');
const fkTableSelect = document.getElementById('fkTableSelect');
const fkColumnSelect = document.getElementById('fkColumnSelect');
const fkRefTableSelect = document.getElementById('fkRefTableSelect');
const fkRefColumnSelect = document.getElementById('fkRefColumnSelect');
const fkDeleteTableSelect = document.getElementById('fkDeleteTableSelect');
const fkConstraintSelect = document.getElementById('fkConstraintSelect');
const fkOnDelete = document.getElementById('fkOnDelete');
const fkOnUpdate = document.getElementById('fkOnUpdate');
const fkList = document.getElementById('fkList');
const toast = document.getElementById('toast');
const deleteModal = document.getElementById('deleteModal');
const deleteModalText = document.getElementById('deleteModalText');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

function showToast(message, type = 'success') {
  toast.className = `show ${type}`;
  toast.textContent = message;
  setTimeout(() => {
    toast.className = '';
  }, 2500);
}

function debounce(fn, wait = 300) {
  let timerId = null;
  return (...args) => {
    if (timerId) clearTimeout(timerId);
    timerId = setTimeout(() => {
      fn(...args);
    }, wait);
  };
}

function openDeleteModal(targetName, targetType = 'tabla') {
  return new Promise((resolve) => {
    deleteModalText.textContent = `Se eliminara ${targetType} ${targetName}. Esta accion no se puede deshacer.`;
    deleteModal.classList.add('open');
    deleteModal.setAttribute('aria-hidden', 'false');

    const onConfirm = () => closeModal(true);
    const onCancel = () => closeModal(false);
    const onBackdrop = (event) => {
      if (event.target === deleteModal) closeModal(false);
    };
    const onEsc = (event) => {
      if (event.key === 'Escape') closeModal(false);
    };

    function closeModal(accepted) {
      deleteModal.classList.remove('open');
      deleteModal.setAttribute('aria-hidden', 'true');
      confirmDeleteBtn.removeEventListener('click', onConfirm);
      cancelDeleteBtn.removeEventListener('click', onCancel);
      deleteModal.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onEsc);
      resolve(accepted);
    }

    confirmDeleteBtn.addEventListener('click', onConfirm);
    cancelDeleteBtn.addEventListener('click', onCancel);
    deleteModal.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onEsc);
  });
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json'
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || 'Ocurrio un error en la solicitud.');
  }

  return data;
}

function renderTableOptions() {
  const optionsHtml = state.tables.length
    ? state.tables.map((table) => `<option value="${table}">${table}</option>`).join('')
    : '<option value="">No hay tablas disponibles</option>';

  tableSelect.innerHTML = optionsHtml;
  editTableSelect.innerHTML = optionsHtml;
  deleteTableSelect.innerHTML = optionsHtml;
  recordTableSelect.innerHTML = optionsHtml;
  if (fkTableSelect) fkTableSelect.innerHTML = optionsHtml;
  if (fkRefTableSelect) fkRefTableSelect.innerHTML = optionsHtml;
  if (fkDeleteTableSelect) fkDeleteTableSelect.innerHTML = optionsHtml;

  if (state.tables.length && !state.currentTable) {
    state.currentTable = state.tables[0];
    tableSelect.value = state.currentTable;
  }
}

function buildTypeOptions(selectEl) {
  selectEl.innerHTML = state.sqlTypes.map((type) => `<option value="${type}">${type}</option>`).join('');
}

function setMenuNavigation() {
  const menuItems = Array.from(document.querySelectorAll('.menu-item'));
  const sectionPanels = Array.from(document.querySelectorAll('.section-panel'));

  menuItems.forEach((button) => {
    button.addEventListener('click', () => {
      menuItems.forEach((item) => item.classList.remove('active'));
      sectionPanels.forEach((panel) => panel.classList.remove('active'));

      button.classList.add('active');
      const panel = document.getElementById(button.dataset.section);
      if (panel) panel.classList.add('active');
    });
  });
}

function addFilterRow(field = '', value = '') {
  const row = document.createElement('div');
  row.className = 'filter-row';

  const fieldOptions = state.currentColumns
    .map((column) => `<option value="${column}" ${field === column ? 'selected' : ''}>${column}</option>`)
    .join('');

  row.innerHTML = `
    <select class="filter-field">${fieldOptions}</select>
    <input class="filter-value" type="text" placeholder="Valor filtro" value="${value}" />
    <button type="button" class="btn btn-danger btn-sm remove-filter">Quitar</button>
  `;

  row.querySelector('.remove-filter').addEventListener('click', () => {
    row.remove();
    loadRecords();
  });

  const debouncedLoad = debounce(() => {
    state.currentPage = 1;
    loadRecords();
  }, 250);

  row.querySelector('.filter-value').addEventListener('input', debouncedLoad);

  row.querySelector('.filter-field').addEventListener('change', () => {
    state.currentPage = 1;
    loadRecords();
  });

  filtersContainer.appendChild(row);
}

function getFiltersFromUi() {
  const rows = Array.from(document.querySelectorAll('.filter-row'));
  const filters = {};

  rows.forEach((row) => {
    const field = row.querySelector('.filter-field')?.value;
    const value = row.querySelector('.filter-value')?.value || '';

    if (field && value.trim()) {
      filters[field] = value.trim();
    }
  });

  return filters;
}

function updatePaginationControls() {
  prevPageBtn.disabled = state.currentPage <= 1 || !state.currentTable;
  nextPageBtn.disabled = state.currentPage >= state.totalPages || !state.currentTable;
}

async function loadRecords() {
  if (!state.currentTable) {
    recordsTable.innerHTML = '<tr><td>No hay tabla seleccionada.</td></tr>';
    pageInfo.textContent = 'Sin datos para mostrar';
    updatePaginationControls();
    return;
  }

  try {
    recordsTable.innerHTML = '<tr><td>Cargando registros...</td></tr>';
    const filters = getFiltersFromUi();
    const params = new URLSearchParams({
      page: String(state.currentPage),
      pageSize: String(state.pageSize)
    });

    Object.entries(filters).forEach(([field, value]) => {
      params.append(field, value);
    });

    const data = await request(`/api/tables/${encodeURIComponent(state.currentTable)}/records?${params.toString()}`);

    state.totalPages = data.pagination.totalPages;
    state.currentColumns = data.columns || [];

    if (state.currentPage > state.totalPages) {
      state.currentPage = state.totalPages;
      await loadRecords();
      return;
    }

    renderRecordsTable(data.columns, data.data);
    pageInfo.textContent = `Pagina ${data.pagination.page} de ${data.pagination.totalPages} (Total: ${data.pagination.total})`;
    updatePaginationControls();
  } catch (error) {
    recordsTable.innerHTML = '<tr><td>No se pudieron cargar los registros.</td></tr>';
    updatePaginationControls();
    showToast(error.message, 'error');
  }
}

function renderRecordsTable(columns = [], rows = []) {
  if (!columns.length) {
    recordsTable.innerHTML = '<tr><td>No hay columnas disponibles.</td></tr>';
    return;
  }

  const hasIdColumn = columns.includes('id');
  const head = `<thead><tr>${columns.map((col) => `<th>${col}</th>`).join('')}${hasIdColumn ? '<th>Acciones</th>' : ''}</tr></thead>`;

  if (!rows.length) {
    recordsTable.innerHTML = `${head}<tbody><tr><td colspan="${columns.length + (hasIdColumn ? 1 : 0)}">No hay registros para mostrar.</td></tr></tbody>`;
    return;
  }

  const body = rows
    .map(
      (row) => `<tr>${columns.map((col) => `<td>${row[col] ?? ''}</td>`).join('')}${hasIdColumn ? `<td><button type="button" class="btn btn-danger btn-sm delete-record-btn" data-id="${row.id}"><i class="bi bi-trash3"></i> Eliminar</button></td>` : ''}</tr>`
    )
    .join('');

  recordsTable.innerHTML = `${head}<tbody>${body}</tbody>`;
}

async function handleDeleteRecordClick(event) {
  const button = event.target.closest('.delete-record-btn');
  if (!button) return;

  const recordId = Number(button.dataset.id);
  if (!state.currentTable || !Number.isInteger(recordId)) return;

  const ok = await openDeleteModal(`#${recordId} de ${state.currentTable}`, 'el registro');
  if (!ok) return;

  try {
    await request(`/api/tables/${encodeURIComponent(state.currentTable)}/records/${recordId}`, {
      method: 'DELETE'
    });

    showToast('Registro eliminado correctamente.');
    await loadRecords();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function createColumnRow() {
  const container = document.createElement('div');
  container.className = 'column-row';

  container.innerHTML = `
    <input type="text" placeholder="campo" class="column-name" required />
    <select class="column-type">${state.sqlTypes.map((type) => `<option value="${type}">${type}</option>`).join('')}</select>
    <label class="check-label"><input type="checkbox" class="column-nullable" /> NULL</label>
    <button type="button" class="btn btn-danger btn-sm remove-column">Quitar</button>
  `;

  container.querySelector('.remove-column').addEventListener('click', () => {
    container.remove();
  });

  return container;
}

function setupCreateTable() {
  const form = document.getElementById('createTableForm');
  const createColumnsContainer = document.getElementById('createColumnsContainer');

  document.getElementById('addCreateColumn').addEventListener('click', () => {
    createColumnsContainer.appendChild(createColumnRow());
  });

  createColumnsContainer.appendChild(createColumnRow());

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const tableName = form.tableName.value.trim();
    const columns = Array.from(createColumnsContainer.querySelectorAll('.column-row')).map((row) => ({
      name: row.querySelector('.column-name').value.trim(),
      type: row.querySelector('.column-type').value,
      nullable: row.querySelector('.column-nullable').checked
    }));

    try {
      await request('/api/tables', {
        method: 'POST',
        body: JSON.stringify({ tableName, columns })
      });

      showToast('Tabla creada correctamente.');
      form.reset();
      createColumnsContainer.innerHTML = '';
      createColumnsContainer.appendChild(createColumnRow());
      await refreshTables();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

function setupEditTable() {
  const form = document.getElementById('editTableForm');
  const actionSelect = document.getElementById('editAction');
  const oldNameWrap = document.getElementById('oldNameWrap');
  const typeWrap = document.getElementById('typeWrap');
  const nullableWrap = document.getElementById('nullableWrap');

  function updateEditLayout() {
    const action = actionSelect.value;

    oldNameWrap.style.display = action === 'modify' ? 'grid' : 'none';
    typeWrap.style.display = action === 'drop' ? 'none' : 'grid';
    nullableWrap.style.display = action === 'drop' ? 'none' : 'flex';
  }

  actionSelect.addEventListener('change', updateEditLayout);
  updateEditLayout();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = {
      action: form.action.value,
      oldName: form.oldName.value.trim(),
      name: form.name.value.trim(),
      type: form.type.value,
      nullable: form.nullable.checked
    };

    try {
      await request(`/api/tables/${encodeURIComponent(form.tableName.value)}/edit`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });

      showToast('Tabla editada correctamente.');
      form.reset();
      updateEditLayout();
      await refreshTables();
      await loadRecordFields();
      await loadRecords();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

function setupDeleteTable() {
  const form = document.getElementById('deleteTableForm');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const tableName = form.tableName.value;
    if (!tableName) return;

    const ok = await openDeleteModal(tableName, 'la tabla');
    if (!ok) return;

    try {
      await request(`/api/tables/${encodeURIComponent(tableName)}`, { method: 'DELETE' });
      showToast('Tabla eliminada correctamente.');
      await refreshTables();
      await loadRecordFields();
      await loadRecords();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

async function loadRecordFields() {
  const tableName = recordTableSelect.value;
  const fieldsWrap = document.getElementById('recordFields');

  fieldsWrap.innerHTML = '';
  if (!tableName) return;

  try {
    const data = await request(`/api/tables/${encodeURIComponent(tableName)}/columns`);

    data.columns
      .filter((column) => column.Field !== 'id')
      .forEach((column) => {
        const sqlType = String(column.Type || '').toLowerCase();
        const label = document.createElement('label');

        let inputHtml = `<input type="text" name="${column.Field}" placeholder="${column.Type}" data-sql-type="text" />`;

        if (sqlType.includes('int') || sqlType.includes('decimal') || sqlType.includes('float') || sqlType.includes('double')) {
          inputHtml = `<input type="number" name="${column.Field}" placeholder="${column.Type}" data-sql-type="number" />`;
        } else if (sqlType === 'date') {
          inputHtml = `<input type="date" name="${column.Field}" data-sql-type="date" />`;
        } else if (sqlType.includes('datetime') || sqlType.includes('timestamp')) {
          inputHtml = `<input type="datetime-local" name="${column.Field}" data-sql-type="datetime" />`;
        } else if (sqlType === 'tinyint(1)' || sqlType.includes('boolean') || sqlType.includes('bool')) {
          inputHtml = `
            <select name="${column.Field}" data-sql-type="boolean">
              <option value="">Selecciona</option>
              <option value="1">True</option>
              <option value="0">False</option>
            </select>
          `;
        }

        label.innerHTML = `${column.Field}${inputHtml}`;
        fieldsWrap.appendChild(label);
      });
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function setSelectOptions(selectEl, values, emptyText) {
  if (!selectEl) return;

  if (!values.length) {
    selectEl.innerHTML = `<option value="">${emptyText}</option>`;
    return;
  }

  selectEl.innerHTML = values.map((value) => `<option value="${value}">${value}</option>`).join('');
}

async function loadColumnsIntoSelect(tableName, selectEl, { includeId = true } = {}) {
  if (!selectEl) return;

  if (!tableName) {
    setSelectOptions(selectEl, [], 'Selecciona una tabla');
    return;
  }

  try {
    const data = await request(`/api/tables/${encodeURIComponent(tableName)}/columns`);
    const columns = (data.columns || [])
      .map((column) => column.Field)
      .filter((column) => includeId || column !== 'id');

    setSelectOptions(selectEl, columns, 'No hay columnas disponibles');
  } catch (error) {
    setSelectOptions(selectEl, [], 'No se pudieron cargar columnas');
    showToast(error.message, 'error');
  }
}

async function loadForeignKeysForTable(tableName) {
  if (!fkConstraintSelect || !fkList) return;

  if (!tableName) {
    setSelectOptions(fkConstraintSelect, [], 'Selecciona una tabla');
    fkList.innerHTML = '<li>Selecciona una tabla para ver sus relaciones.</li>';
    return;
  }

  try {
    const data = await request(`/api/tables/${encodeURIComponent(tableName)}/foreign-keys`);
    const foreignKeys = data.foreignKeys || [];
    const uniqueConstraints = Array.from(new Set(foreignKeys.map((item) => item.constraintName)));

    setSelectOptions(fkConstraintSelect, uniqueConstraints, 'No hay constraints FK');

    if (!foreignKeys.length) {
      fkList.innerHTML = '<li>Esta tabla no tiene llaves foraneas.</li>';
      return;
    }

    fkList.innerHTML = foreignKeys
      .map(
        (item) =>
          `<li><strong>${item.constraintName}</strong>: ${item.columnName} -> ${item.referencedTable}.${item.referencedColumn} (ON DELETE ${item.deleteRule}, ON UPDATE ${item.updateRule})</li>`
      )
      .join('');
  } catch (error) {
    setSelectOptions(fkConstraintSelect, [], 'No se pudo cargar');
    fkList.innerHTML = '<li>No se pudieron cargar las relaciones.</li>';
    showToast(error.message, 'error');
  }
}

async function refreshForeignKeyPanel() {
  if (!fkForm || !fkDeleteForm || !fkTableSelect || !fkRefTableSelect || !fkDeleteTableSelect) return;

  if (!state.tables.length) {
    setSelectOptions(fkColumnSelect, [], 'No hay columnas disponibles');
    setSelectOptions(fkRefColumnSelect, [], 'No hay columnas disponibles');
    setSelectOptions(fkConstraintSelect, [], 'No hay constraints FK');
    if (fkList) fkList.innerHTML = '<li>No hay tablas para vincular.</li>';
    return;
  }

  if (!fkTableSelect.value) fkTableSelect.value = state.currentTable || state.tables[0];
  if (!fkDeleteTableSelect.value) fkDeleteTableSelect.value = fkTableSelect.value;
  if (!fkRefTableSelect.value) fkRefTableSelect.value = state.tables.find((table) => table !== fkTableSelect.value) || fkTableSelect.value;

  await loadColumnsIntoSelect(fkTableSelect.value, fkColumnSelect, { includeId: true });
  await loadColumnsIntoSelect(fkRefTableSelect.value, fkRefColumnSelect, { includeId: true });
  await loadForeignKeysForTable(fkDeleteTableSelect.value);
}

function setupForeignKeys() {
  if (!fkForm || !fkDeleteForm) return;

  fkOnDelete.value = 'RESTRICT';
  fkOnUpdate.value = 'CASCADE';

  fkTableSelect.addEventListener('change', async () => {
    await loadColumnsIntoSelect(fkTableSelect.value, fkColumnSelect, { includeId: true });
  });

  fkRefTableSelect.addEventListener('change', async () => {
    await loadColumnsIntoSelect(fkRefTableSelect.value, fkRefColumnSelect, { includeId: true });
  });

  fkDeleteTableSelect.addEventListener('change', async () => {
    await loadForeignKeysForTable(fkDeleteTableSelect.value);
  });

  fkForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const tableName = fkTableSelect.value;
    const payload = {
      columnName: fkColumnSelect.value,
      referencedTable: fkRefTableSelect.value,
      referencedColumn: fkRefColumnSelect.value,
      onDelete: fkOnDelete.value,
      onUpdate: fkOnUpdate.value
    };

    try {
      await request(`/api/tables/${encodeURIComponent(tableName)}/foreign-keys`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      showToast('Llave foranea creada correctamente.');

      fkDeleteTableSelect.value = tableName;
      await loadForeignKeysForTable(tableName);
      await loadRecords();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  fkDeleteForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const tableName = fkDeleteTableSelect.value;
    const constraintName = fkConstraintSelect.value;
    if (!tableName || !constraintName) return;

    const ok = await openDeleteModal(`${constraintName} en ${tableName}`, 'la llave foranea');
    if (!ok) return;

    try {
      await request(`/api/tables/${encodeURIComponent(tableName)}/foreign-keys/${encodeURIComponent(constraintName)}`, {
        method: 'DELETE'
      });

      showToast('Llave foranea eliminada correctamente.');
      await loadForeignKeysForTable(tableName);
      await loadRecords();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

function setupAddRecord() {
  const form = document.getElementById('recordForm');

  recordTableSelect.addEventListener('change', loadRecordFields);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const tableName = form.tableName.value;
    if (!tableName) return;

    const values = {};
    Array.from(form.querySelectorAll('#recordFields input, #recordFields select')).forEach((input) => {
      const rawValue = String(input.value || '').trim();
      const sqlType = input.dataset.sqlType || 'text';

      if (!rawValue) {
        values[input.name] = null;
        return;
      }

      if (sqlType === 'number') {
        values[input.name] = Number(rawValue);
        return;
      }

      if (sqlType === 'boolean') {
        values[input.name] = rawValue === '1' ? 1 : 0;
        return;
      }

      if (sqlType === 'datetime') {
        values[input.name] = rawValue.replace('T', ' ');
        return;
      }

      values[input.name] = rawValue;
    });

    try {
      await request(`/api/tables/${encodeURIComponent(tableName)}/records`, {
        method: 'POST',
        body: JSON.stringify({ values })
      });

      showToast('Registro agregado correctamente.');
      form.querySelectorAll('#recordFields input').forEach((input) => {
        input.value = '';
      });

      if (tableName === state.currentTable) {
        await loadRecords();
      }
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

function setupSelectTable() {
  recordsTable.addEventListener('click', (event) => {
    handleDeleteRecordClick(event);
  });

  tableSelect.addEventListener('change', async () => {
    state.currentTable = tableSelect.value;
    recordTableSelect.value = state.currentTable;
    state.currentPage = 1;
    filtersContainer.innerHTML = '';
    await loadRecordFields();
    await loadRecords();
  });

  addFilterBtn.addEventListener('click', () => {
    if (!state.currentColumns.length) {
      showToast('Primero carga una tabla para conocer sus campos.', 'error');
      return;
    }
    addFilterRow();
  });

  clearFiltersBtn.addEventListener('click', async () => {
    filtersContainer.innerHTML = '';
    state.currentPage = 1;
    await loadRecords();
  });

  pageSizeSelect.value = String(state.pageSize);
  pageSizeSelect.addEventListener('change', async () => {
    state.pageSize = Number(pageSizeSelect.value) || 10;
    state.currentPage = 1;
    await loadRecords();
  });

  prevPageBtn.addEventListener('click', async () => {
    if (state.currentPage > 1) {
      state.currentPage -= 1;
      await loadRecords();
    }
  });

  nextPageBtn.addEventListener('click', async () => {
    if (state.currentPage < state.totalPages) {
      state.currentPage += 1;
      await loadRecords();
    }
  });

  reloadRecordsBtn.addEventListener('click', async () => {
    await loadRecords();
    showToast('Datos recargados.');
  });
}

async function refreshTables() {
  const data = await request('/api/tables');
  state.tables = data.tables;

  const previous = state.currentTable;
  renderTableOptions();

  if (state.tables.includes(previous)) {
    state.currentTable = previous;
    tableSelect.value = previous;
  } else {
    state.currentTable = state.tables[0] || '';
    tableSelect.value = state.currentTable;
  }

  editTableSelect.value = state.currentTable;
  deleteTableSelect.value = state.currentTable;
  recordTableSelect.value = state.currentTable;

  const hasTables = Boolean(state.currentTable);
  addFilterBtn.disabled = !hasTables;
  clearFiltersBtn.disabled = !hasTables;
  pageSizeSelect.disabled = !hasTables;
  reloadRecordsBtn.disabled = !hasTables;

  if (!hasTables) {
    filtersContainer.innerHTML = '';
    document.getElementById('recordFields').innerHTML = '';
    state.currentColumns = [];
    state.currentPage = 1;
    state.totalPages = 1;
    updatePaginationControls();
  }

  await refreshForeignKeyPanel();
}

function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}`);

  ws.onmessage = async (event) => {
    const message = JSON.parse(event.data);

    if (!message?.type) return;

    if (['table_created', 'table_edited', 'table_deleted', 'record_added', 'record_deleted', 'fk_created', 'fk_deleted'].includes(message.type)) {
      await refreshTables();
      await loadRecordFields();
      await loadRecords();
      showToast('Datos actualizados en tiempo real.');
    }
  };
}

async function init() {
  buildTypeOptions(document.getElementById('editType'));
  setMenuNavigation();
  setupSelectTable();
  setupCreateTable();
  setupEditTable();
  setupDeleteTable();
  setupAddRecord();
  setupForeignKeys();

  await refreshTables();
  await loadRecordFields();
  await loadRecords();

  initWebSocket();
}

init().catch((error) => showToast(error.message, 'error'));
