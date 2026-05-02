const state = {
  tables: window.__APP_DATA__?.tables || [],
  sqlTypes: window.__APP_DATA__?.sqlTypes || [],
  currentTable: '',
  currentPage: 1,
  pageSize: 10,
  totalPages: 1,
  currentColumns: [],
  currentRows: [],
  fkDisplaysByColumn: {},
  showFkDisplay: false,
  editingRecordId: null
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
const showFkDisplayToggle = document.getElementById('showFkDisplayToggle');
const createDisplayColumnSelect = document.getElementById('createDisplayColumnSelect');
const recordFormMode = document.getElementById('recordFormMode');
const recordSubmitBtn = document.getElementById('recordSubmitBtn');
const cancelRecordEditBtn = document.getElementById('cancelRecordEditBtn');
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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function activateSection(sectionId) {
  const menuItems = Array.from(document.querySelectorAll('.menu-item'));
  const sectionPanels = Array.from(document.querySelectorAll('.section-panel'));

  menuItems.forEach((item) => item.classList.remove('active'));
  sectionPanels.forEach((panel) => panel.classList.remove('active'));

  const selectedButton = menuItems.find((button) => button.dataset.section === sectionId);
  const selectedPanel = document.getElementById(sectionId);

  if (selectedButton) selectedButton.classList.add('active');
  if (selectedPanel) selectedPanel.classList.add('active');
}

function setMenuNavigation() {
  const menuItems = Array.from(document.querySelectorAll('.menu-item'));

  menuItems.forEach((button) => {
    button.addEventListener('click', () => {
      activateSection(button.dataset.section);
    });
  });
}

function normalizeDateInputValue(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === '') return '';
  if (rawValue instanceof Date && !Number.isNaN(rawValue.getTime())) {
    return rawValue.toISOString().slice(0, 10);
  }
  const value = String(rawValue).trim();
  return value.length >= 10 ? value.slice(0, 10) : value;
}

function normalizeDateTimeInputValue(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === '') return '';
  if (rawValue instanceof Date && !Number.isNaN(rawValue.getTime())) {
    return rawValue.toISOString().slice(0, 16);
  }
  const value = String(rawValue).trim().replace(' ', 'T');
  return value.length >= 16 ? value.slice(0, 16) : value;
}

function normalizeInputValue(rawValue, sqlType = 'text') {
  if (rawValue === null || rawValue === undefined) return '';

  if (sqlType === 'datetime') return normalizeDateTimeInputValue(rawValue);
  if (sqlType === 'date') return normalizeDateInputValue(rawValue);
  if (sqlType === 'boolean') return Number(rawValue) ? '1' : '0';

  return String(rawValue);
}

function setRecordFormMode(mode = 'create', recordId = null) {
  const isEdit = mode === 'edit' && Number.isInteger(recordId);
  state.editingRecordId = isEdit ? recordId : null;

  if (recordFormMode) {
    recordFormMode.textContent = isEdit ? `Modo: editar registro #${recordId}` : 'Modo: crear registro';
  }

  if (recordSubmitBtn) {
    recordSubmitBtn.innerHTML = isEdit
      ? '<i class="bi bi-floppy"></i> Guardar cambios'
      : '<i class="bi bi-plus-circle"></i> Guardar registro';
  }

  if (cancelRecordEditBtn) {
    cancelRecordEditBtn.classList.toggle('hidden', !isEdit);
  }
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

function updateCreateDisplayColumnOptions() {
  if (!createDisplayColumnSelect) return;

  const createColumnsContainer = document.getElementById('createColumnsContainer');
  const currentValue = createDisplayColumnSelect.value || 'id';
  const columnNames = Array.from(createColumnsContainer.querySelectorAll('.column-name'))
    .map((input) => input.value.trim())
    .filter(Boolean);
  const uniqueColumns = Array.from(new Set(['id', ...columnNames]));

  createDisplayColumnSelect.innerHTML = uniqueColumns
    .map((columnName) => `<option value="${escapeHtml(columnName)}">${escapeHtml(columnName)}</option>`)
    .join('');
  createDisplayColumnSelect.value = uniqueColumns.includes(currentValue) ? currentValue : uniqueColumns[0];
}

async function loadRecords() {
  if (!state.currentTable) {
    recordsTable.innerHTML = '<tr><td>No hay tabla seleccionada.</td></tr>';
    pageInfo.textContent = 'Sin datos para mostrar';
    state.currentRows = [];
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
    state.currentRows = data.data || [];
    state.fkDisplaysByColumn = data.fkDisplaysByColumn || {};

    if (state.currentPage > state.totalPages) {
      state.currentPage = state.totalPages;
      await loadRecords();
      return;
    }

    renderRecordsTable(data.columns, state.currentRows);
    pageInfo.textContent = `Pagina ${data.pagination.page} de ${data.pagination.totalPages} (Total: ${data.pagination.total})`;
    updatePaginationControls();
  } catch (error) {
    recordsTable.innerHTML = '<tr><td>No se pudieron cargar los registros.</td></tr>';
    state.currentRows = [];
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
  const head = `<thead><tr>${columns.map((col) => `<th>${escapeHtml(col)}</th>`).join('')}${hasIdColumn ? '<th>Acciones</th>' : ''}</tr></thead>`;

  if (!rows.length) {
    recordsTable.innerHTML = `${head}<tbody><tr><td colspan="${columns.length + (hasIdColumn ? 1 : 0)}">No hay registros para mostrar.</td></tr></tbody>`;
    return;
  }

  const body = rows
    .map(
      (row) =>
        `<tr>${columns.map((col) => `<td>${formatCellValue(row, col)}</td>`).join('')}${
          hasIdColumn
            ? `<td>
                <button type="button" class="btn btn-ghost btn-sm edit-record-btn" data-id="${row.id}"><i class="bi bi-pencil-square"></i> Editar</button>
                <button type="button" class="btn btn-danger btn-sm delete-record-btn" data-id="${row.id}"><i class="bi bi-trash3"></i> Eliminar</button>
              </td>`
            : ''
        }</tr>`
    )
    .join('');

  recordsTable.innerHTML = `${head}<tbody>${body}</tbody>`;
}

function formatCellValue(row, columnName) {
  const rawValue = row[columnName];
  const fkDisplay = state.fkDisplaysByColumn[columnName];

  if (state.showFkDisplay && fkDisplay && rawValue !== null && rawValue !== undefined) {
    const displayValue = fkDisplay.values?.[String(rawValue)];
    if (displayValue !== undefined && displayValue !== null) {
      return `<span title="ID FK: ${escapeHtml(rawValue)}">${escapeHtml(displayValue)}</span>`;
    }
  }

  return escapeHtml(rawValue ?? '');
}

async function handleEditRecordClick(event) {
  const button = event.target.closest('.edit-record-btn');
  if (!button) return;

  const recordId = Number(button.dataset.id);
  if (!state.currentTable || !Number.isInteger(recordId)) return;

  const record = state.currentRows.find((row) => Number(row.id) === recordId);
  if (!record) {
    showToast('No se encontro el registro a editar.', 'error');
    return;
  }

  recordTableSelect.value = state.currentTable;
  setRecordFormMode('edit', recordId);
  await loadRecordFields(record);
  activateSection('addRecord');
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
    updateCreateDisplayColumnOptions();
  });

  container.querySelector('.column-name').addEventListener('input', updateCreateDisplayColumnOptions);

  return container;
}

function setupCreateTable() {
  const form = document.getElementById('createTableForm');
  const createColumnsContainer = document.getElementById('createColumnsContainer');

  document.getElementById('addCreateColumn').addEventListener('click', () => {
    createColumnsContainer.appendChild(createColumnRow());
    updateCreateDisplayColumnOptions();
  });

  createColumnsContainer.appendChild(createColumnRow());
  updateCreateDisplayColumnOptions();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const tableName = form.tableName.value.trim();
    const columns = Array.from(createColumnsContainer.querySelectorAll('.column-row')).map((row) => ({
      name: row.querySelector('.column-name').value.trim(),
      type: row.querySelector('.column-type').value,
      nullable: row.querySelector('.column-nullable').checked
    }));
    const displayColumn = createDisplayColumnSelect?.value || 'id';

    try {
      await request('/api/tables', {
        method: 'POST',
        body: JSON.stringify({ tableName, columns, displayColumn })
      });

      showToast('Tabla creada correctamente.');
      form.reset();
      createColumnsContainer.innerHTML = '';
      createColumnsContainer.appendChild(createColumnRow());
      updateCreateDisplayColumnOptions();
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

async function loadRecordFields(initialValues = {}) {
  const tableName = recordTableSelect.value;
  const fieldsWrap = document.getElementById('recordFields');

  fieldsWrap.innerHTML = '';
  if (!tableName) return;

  try {
    const data = await request(`/api/tables/${encodeURIComponent(tableName)}/columns-with-fk-options`);
    const fkOptionsByColumn = data.fkOptionsByColumn || {};

    data.columns
      .filter((column) => column.Field !== 'id')
      .forEach((column) => {
        const sqlType = String(column.Type || '').toLowerCase();
        const fkConfig = fkOptionsByColumn[column.Field];
        const label = document.createElement('label');
        const safeFieldName = escapeHtml(column.Field);
        const safeFieldType = escapeHtml(column.Type);

        let inputHtml = `<input type="text" name="${safeFieldName}" placeholder="${safeFieldType}" data-sql-type="text" />`;
        let helperHtml = '';

        if (fkConfig) {
          const options = Array.isArray(fkConfig.options) ? fkConfig.options : [];
          const optionItems = options
            .map((option) => {
              const value = escapeHtml(option.value);
              const optionLabel = escapeHtml(option.label);
              return `<option value="${value}">${optionLabel}</option>`;
            })
            .join('');

          inputHtml = `
            <select name="${safeFieldName}" data-sql-type="${sqlType.includes('int') ? 'number' : 'text'}">
              <option value="">Selecciona una opcion</option>
              ${optionItems}
            </select>
          `;

          helperHtml = `<small class="muted tiny">FK: ${safeFieldName} -> ${escapeHtml(fkConfig.referencedTable)}.${escapeHtml(fkConfig.referencedColumn)}</small>`;
        } else if (sqlType.includes('int') || sqlType.includes('decimal') || sqlType.includes('float') || sqlType.includes('double')) {
          inputHtml = `<input type="number" name="${safeFieldName}" placeholder="${safeFieldType}" data-sql-type="number" />`;
        } else if (sqlType === 'date') {
          inputHtml = `<input type="date" name="${safeFieldName}" data-sql-type="date" />`;
        } else if (sqlType.includes('datetime') || sqlType.includes('timestamp')) {
          inputHtml = `<input type="datetime-local" name="${safeFieldName}" data-sql-type="datetime" />`;
        } else if (sqlType === 'tinyint(1)' || sqlType.includes('boolean') || sqlType.includes('bool')) {
          inputHtml = `
            <select name="${safeFieldName}" data-sql-type="boolean">
              <option value="">Selecciona</option>
              <option value="1">True</option>
              <option value="0">False</option>
            </select>
          `;
        }

        label.innerHTML = `${safeFieldName}${inputHtml}${helperHtml}`;
        fieldsWrap.appendChild(label);

        const input = label.querySelector('input, select');
        const hasInitialValue = Object.prototype.hasOwnProperty.call(initialValues, column.Field);
        if (input && hasInitialValue) {
          input.value = normalizeInputValue(initialValues[column.Field], input.dataset.sqlType || 'text');
        }
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

  recordTableSelect.addEventListener('change', async () => {
    setRecordFormMode('create');
    await loadRecordFields();
  });

  cancelRecordEditBtn?.addEventListener('click', async () => {
    setRecordFormMode('create');
    await loadRecordFields();
  });

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

    const isEditMode = Number.isInteger(state.editingRecordId);
    const endpoint = isEditMode
      ? `/api/tables/${encodeURIComponent(tableName)}/records/${state.editingRecordId}`
      : `/api/tables/${encodeURIComponent(tableName)}/records`;
    const method = isEditMode ? 'PUT' : 'POST';

    try {
      await request(endpoint, {
        method,
        body: JSON.stringify({ values })
      });

      showToast(isEditMode ? 'Registro actualizado correctamente.' : 'Registro agregado correctamente.');
      setRecordFormMode('create');
      await loadRecordFields();

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
    handleEditRecordClick(event);
    handleDeleteRecordClick(event);
  });

  tableSelect.addEventListener('change', async () => {
    state.currentTable = tableSelect.value;
    recordTableSelect.value = state.currentTable;
    setRecordFormMode('create');
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

  if (showFkDisplayToggle) {
    showFkDisplayToggle.checked = state.showFkDisplay;
    showFkDisplayToggle.addEventListener('change', () => {
      state.showFkDisplay = showFkDisplayToggle.checked;
      renderRecordsTable(state.currentColumns, state.currentRows);
    });
  }
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
    state.currentRows = [];
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

    if (['table_created', 'table_edited', 'table_deleted', 'record_added', 'record_updated', 'record_deleted', 'fk_created', 'fk_deleted'].includes(message.type)) {
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
