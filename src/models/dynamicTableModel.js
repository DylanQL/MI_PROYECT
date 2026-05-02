const { pool } = require('./db');
const { RESERVED_TABLES, quoteIdentifier, assertTableAllowed, isValidIdentifier } = require('../services/sqlUtils');

const ALLOWED_TYPES = new Set([
  'INT',
  'BIGINT',
  'DECIMAL(10,2)',
  'VARCHAR(255)',
  'TEXT',
  'DATE',
  'DATETIME',
  'BOOLEAN'
]);

const ALLOWED_FK_RULES = new Set(['RESTRICT', 'CASCADE', 'SET NULL', 'NO ACTION']);

async function listTables() {
  const [rows] = await pool.query('SHOW TABLES');
  const key = Object.keys(rows[0] || {})[0];
  const tables = rows.map((row) => row[key]);

  return tables.filter((tableName) => !RESERVED_TABLES.has(String(tableName).toLowerCase()));
}

async function getColumns(tableName) {
  assertTableAllowed(tableName);
  const safeTable = quoteIdentifier(tableName);
  const [rows] = await pool.query(`DESCRIBE ${safeTable}`);
  return rows;
}

async function getDisplayColumn(tableName) {
  assertTableAllowed(tableName);

  const [rows] = await pool.query(
    'SELECT display_column AS displayColumn FROM table_display_settings WHERE table_name = ? LIMIT 1',
    [tableName]
  );

  return rows[0]?.displayColumn || null;
}

async function setDisplayColumn(tableName, displayColumn) {
  assertTableAllowed(tableName);

  if (!isValidIdentifier(displayColumn)) {
    throw new Error('Campo visible invalido.');
  }

  const columns = await getColumns(tableName);
  const availableColumns = new Set(columns.map((column) => column.Field));

  if (!availableColumns.has(displayColumn)) {
    throw new Error('El campo visible debe existir en la tabla.');
  }

  await pool.query(
    `INSERT INTO table_display_settings (table_name, display_column)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE display_column = VALUES(display_column)`,
    [tableName, displayColumn]
  );
}

function normalizeColumn(column) {
  const name = String(column.name || '').trim();
  const type = String(column.type || '').toUpperCase().trim();
  const nullable = Boolean(column.nullable);

  if (!isValidIdentifier(name)) {
    throw new Error(`Nombre de campo invalido: ${name}`);
  }
  if (!ALLOWED_TYPES.has(type)) {
    throw new Error(`Tipo no permitido para ${name}. Usa uno de: ${Array.from(ALLOWED_TYPES).join(', ')}`);
  }

  return { name, type, nullable };
}

async function createTable(tableName, columns, displayColumn = 'id') {
  assertTableAllowed(tableName);

  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error('Debes enviar al menos una columna.');
  }

  const normalizedColumns = columns.map(normalizeColumn);
  const safeDisplayColumn = String(displayColumn || 'id').trim();
  const availableDisplayColumns = new Set(['id', ...normalizedColumns.map((column) => column.name)]);

  if (!isValidIdentifier(safeDisplayColumn) || !availableDisplayColumns.has(safeDisplayColumn)) {
    throw new Error('El campo visible debe ser id o una columna de la tabla.');
  }

  const safeTable = quoteIdentifier(tableName);

  const columnSql = normalizedColumns
    .map((column) => `${quoteIdentifier(column.name)} ${column.type} ${column.nullable ? 'NULL' : 'NOT NULL'}`)
    .join(', ');

  const sql = `CREATE TABLE ${safeTable} (id INT AUTO_INCREMENT PRIMARY KEY, ${columnSql})`;
  await pool.query(sql);
  await setDisplayColumn(tableName, safeDisplayColumn);
}

async function deleteTable(tableName) {
  assertTableAllowed(tableName);
  const safeTable = quoteIdentifier(tableName);
  await pool.query(`DROP TABLE ${safeTable}`);
  await pool.query('DELETE FROM table_display_settings WHERE table_name = ?', [tableName]);
}

async function addColumn(tableName, column) {
  assertTableAllowed(tableName);
  const normalized = normalizeColumn(column);
  const safeTable = quoteIdentifier(tableName);
  await pool.query(
    `ALTER TABLE ${safeTable} ADD COLUMN ${quoteIdentifier(normalized.name)} ${normalized.type} ${normalized.nullable ? 'NULL' : 'NOT NULL'}`
  );
}

async function modifyColumn(tableName, oldName, column) {
  assertTableAllowed(tableName);

  if (!isValidIdentifier(oldName)) {
    throw new Error('Nombre de columna origen invalido.');
  }

  const normalized = normalizeColumn(column);
  const safeTable = quoteIdentifier(tableName);

  const currentDisplayColumn = await getDisplayColumn(tableName);

  await pool.query(
    `ALTER TABLE ${safeTable} CHANGE COLUMN ${quoteIdentifier(oldName)} ${quoteIdentifier(normalized.name)} ${normalized.type} ${normalized.nullable ? 'NULL' : 'NOT NULL'}`
  );

  if (currentDisplayColumn === oldName) {
    await setDisplayColumn(tableName, normalized.name);
  }
}

async function dropColumn(tableName, columnName) {
  assertTableAllowed(tableName);

  if (String(columnName).toLowerCase() === 'id') {
    throw new Error('No puedes borrar la columna id.');
  }
  if (!isValidIdentifier(columnName)) {
    throw new Error('Nombre de columna invalido.');
  }

  const safeTable = quoteIdentifier(tableName);
  const currentDisplayColumn = await getDisplayColumn(tableName);
  await pool.query(`ALTER TABLE ${safeTable} DROP COLUMN ${quoteIdentifier(columnName)}`);

  if (currentDisplayColumn === columnName) {
    await setDisplayColumn(tableName, 'id');
  }
}

function buildFilterQuery(filters, availableColumns) {
  const conditions = [];
  const values = [];

  for (const [field, value] of Object.entries(filters)) {
    if (!value || !value.trim()) continue;
    if (!availableColumns.has(field)) continue;

    conditions.push(`${quoteIdentifier(field)} LIKE ?`);
    values.push(`%${value.trim()}%`);
  }

  return {
    whereClause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    values
  };
}

async function getRecords(tableName, page = 1, pageSize = 10, filters = {}) {
  assertTableAllowed(tableName);

  const safePage = Math.max(Number(page) || 1, 1);
  const safePageSize = Math.min(Math.max(Number(pageSize) || 10, 1), 100);
  const offset = (safePage - 1) * safePageSize;
  const safeTable = quoteIdentifier(tableName);

  const columns = await getColumns(tableName);
  const availableColumns = new Set(columns.map((column) => column.Field));

  const { whereClause, values } = buildFilterQuery(filters, availableColumns);

  const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM ${safeTable} ${whereClause}`, values);
  const total = countRows[0]?.total || 0;

  const [rows] = await pool.query(
    `SELECT * FROM ${safeTable} ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...values, safePageSize, offset]
  );

  const fkDisplaysByColumn = await getForeignKeyDisplaysForRows(tableName, rows);

  return {
    data: rows,
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages: Math.ceil(total / safePageSize) || 1
    },
    columns: columns.map((column) => column.Field),
    fkDisplaysByColumn
  };
}

async function getRecordsForExport(tableName, filters = {}) {
  assertTableAllowed(tableName);

  const safeTable = quoteIdentifier(tableName);
  const columns = await getColumns(tableName);
  const availableColumns = new Set(columns.map((column) => column.Field));
  const { whereClause, values } = buildFilterQuery(filters, availableColumns);

  const [rows] = await pool.query(
    `SELECT * FROM ${safeTable} ${whereClause} ORDER BY id DESC`,
    values
  );
  const fkDisplaysByColumn = await getForeignKeyDisplaysForRows(tableName, rows);

  return {
    data: rows,
    columns: columns.map((column) => column.Field),
    fkDisplaysByColumn
  };
}

async function getForeignKeyDisplaysForRows(tableName, rows) {
  if (!rows.length) return {};

  const foreignKeys = await getForeignKeys(tableName);
  if (!foreignKeys.length) return {};

  const fkDisplaysByColumn = {};

  for (const fkMeta of foreignKeys) {
    const values = Array.from(new Set(rows.map((row) => row[fkMeta.columnName]).filter((value) => value !== null && value !== undefined)));
    if (!values.length) continue;

    const referencedTable = fkMeta.referencedTable;
    const referencedColumn = fkMeta.referencedColumn;
    const configuredDisplayColumn = await getDisplayColumn(referencedTable);
    const referencedColumns = await getColumns(referencedTable);
    const availableColumns = referencedColumns.map((column) => column.Field);
    const displayColumn = configuredDisplayColumn && availableColumns.includes(configuredDisplayColumn)
      ? configuredDisplayColumn
      : availableColumns.find((column) => column !== referencedColumn) || referencedColumn;

    const safeReferencedTable = quoteIdentifier(referencedTable);
    const safeReferencedColumn = quoteIdentifier(referencedColumn);
    const safeDisplayColumn = quoteIdentifier(displayColumn);
    const placeholders = values.map(() => '?').join(', ');
    const [displayRows] = await pool.query(
      `SELECT ${safeReferencedColumn} AS fkValue, ${safeDisplayColumn} AS displayValue
       FROM ${safeReferencedTable}
       WHERE ${safeReferencedColumn} IN (${placeholders})`,
      values
    );

    fkDisplaysByColumn[fkMeta.columnName] = {
      referencedTable,
      referencedColumn,
      displayColumn,
      values: Object.fromEntries(displayRows.map((row) => [String(row.fkValue), row.displayValue]))
    };
  }

  return fkDisplaysByColumn;
}

async function addRecord(tableName, payload) {
  assertTableAllowed(tableName);

  if (!payload || typeof payload !== 'object') {
    throw new Error('Registro invalido.');
  }

  const safeTable = quoteIdentifier(tableName);
  const columns = await getColumns(tableName);
  const allowed = new Set(columns.map((column) => column.Field));

  const entries = Object.entries(payload).filter(([key, value]) => key !== 'id' && allowed.has(key) && value !== undefined);

  if (!entries.length) {
    throw new Error('No hay campos validos para insertar.');
  }

  const columnSql = entries.map(([key]) => quoteIdentifier(key)).join(', ');
  const placeholders = entries.map(() => '?').join(', ');
  const values = entries.map(([, value]) => value);

  const [result] = await pool.query(
    `INSERT INTO ${safeTable} (${columnSql}) VALUES (${placeholders})`,
    values
  );

  return result.insertId;
}

async function updateRecord(tableName, id, payload) {
  assertTableAllowed(tableName);

  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    throw new Error('ID de registro invalido.');
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Registro invalido.');
  }

  const safeTable = quoteIdentifier(tableName);
  const columns = await getColumns(tableName);
  const allowed = new Set(columns.map((column) => column.Field));

  const entries = Object.entries(payload).filter(([key, value]) => key !== 'id' && allowed.has(key) && value !== undefined);

  if (!entries.length) {
    throw new Error('No hay campos validos para actualizar.');
  }

  const setSql = entries.map(([key]) => `${quoteIdentifier(key)} = ?`).join(', ');
  const values = entries.map(([, value]) => value);

  const [result] = await pool.query(
    `UPDATE ${safeTable}
     SET ${setSql}
     WHERE id = ?`,
    [...values, numericId]
  );

  if (!result.affectedRows) {
    throw new Error('No se encontro el registro a actualizar.');
  }
}

function normalizeForeignKeyRule(value, fallback) {
  const normalized = String(value || fallback || 'RESTRICT').toUpperCase().trim();
  if (!ALLOWED_FK_RULES.has(normalized)) {
    throw new Error(`Regla de llave foranea invalida: ${value}`);
  }
  return normalized;
}

function buildForeignKeyName({ tableName, columnName, referencedTable, referencedColumn }) {
  const base = `fk_${tableName}_${columnName}_${referencedTable}_${referencedColumn}`;
  return base.slice(0, 64);
}

async function getForeignKeys(tableName) {
  assertTableAllowed(tableName);

  const [rows] = await pool.query(
    `SELECT
      kcu.CONSTRAINT_NAME AS constraintName,
      kcu.COLUMN_NAME AS columnName,
      kcu.REFERENCED_TABLE_NAME AS referencedTable,
      kcu.REFERENCED_COLUMN_NAME AS referencedColumn,
      rc.UPDATE_RULE AS updateRule,
      rc.DELETE_RULE AS deleteRule
     FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
     INNER JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
       ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
      AND rc.TABLE_NAME = kcu.TABLE_NAME
      AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
     WHERE kcu.TABLE_SCHEMA = DATABASE()
       AND kcu.TABLE_NAME = ?
       AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
     ORDER BY kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION`,
    [tableName]
  );

  return rows;
}

function buildFkOptionLabel(row, referencedColumn, displayColumns) {
  const value = row[referencedColumn];
  const details = displayColumns
    .map((columnName) => `${columnName}: ${row[columnName] ?? ''}`)
    .join(' | ');

  return details ? `${value} - ${details}` : String(value ?? '');
}

async function getForeignKeyOptionsForTable(tableName) {
  assertTableAllowed(tableName);

  const foreignKeys = await getForeignKeys(tableName);
  if (!foreignKeys.length) {
    return {};
  }

  const byColumn = new Map();
  foreignKeys.forEach((item) => {
    if (!byColumn.has(item.columnName)) {
      byColumn.set(item.columnName, item);
    }
  });

  const fkOptionsByColumn = {};

  for (const [columnName, fkMeta] of byColumn.entries()) {
    const referencedTable = fkMeta.referencedTable;
    const referencedColumn = fkMeta.referencedColumn;
    const safeReferencedTable = quoteIdentifier(referencedTable);
    const safeReferencedColumn = quoteIdentifier(referencedColumn);
    const configuredDisplayColumn = await getDisplayColumn(referencedTable);

    const referencedColumns = await getColumns(referencedTable);
    const availableColumns = referencedColumns.map((column) => column.Field);
    const displayColumns = configuredDisplayColumn && availableColumns.includes(configuredDisplayColumn)
      ? [configuredDisplayColumn].filter((column) => column !== referencedColumn)
      : referencedColumns
      .map((column) => column.Field)
      .filter((field) => field !== referencedColumn)
      .slice(0, 3);

    const selectedColumns = [referencedColumn, ...displayColumns];
    const selectedSql = selectedColumns.map((name) => quoteIdentifier(name)).join(', ');
    const [rows] = await pool.query(
      `SELECT ${selectedSql}
       FROM ${safeReferencedTable}
       ORDER BY ${safeReferencedColumn}
       LIMIT 200`
    );

    fkOptionsByColumn[columnName] = {
      referencedTable,
      referencedColumn,
      displayColumns,
      options: rows.map((row) => ({
        value: row[referencedColumn],
        label: buildFkOptionLabel(row, referencedColumn, displayColumns)
      }))
    };
  }

  return fkOptionsByColumn;
}

async function addForeignKey(tableName, payload) {
  assertTableAllowed(tableName);

  const columnName = String(payload?.columnName || '').trim();
  const referencedTable = String(payload?.referencedTable || '').trim();
  const referencedColumn = String(payload?.referencedColumn || '').trim();

  if (!isValidIdentifier(columnName)) {
    throw new Error('Columna origen invalida para la llave foranea.');
  }
  assertTableAllowed(referencedTable);
  if (!isValidIdentifier(referencedColumn)) {
    throw new Error('Columna destino invalida para la llave foranea.');
  }

  const onDelete = normalizeForeignKeyRule(payload?.onDelete, 'RESTRICT');
  const onUpdate = normalizeForeignKeyRule(payload?.onUpdate, 'CASCADE');

  const constraintNameRaw = String(payload?.constraintName || '').trim();
  const constraintName = constraintNameRaw || buildForeignKeyName({
    tableName,
    columnName,
    referencedTable,
    referencedColumn
  });

  if (!isValidIdentifier(constraintName)) {
    throw new Error('Nombre de constraint invalido para la llave foranea.');
  }

  const safeTable = quoteIdentifier(tableName);
  const safeConstraint = quoteIdentifier(constraintName);
  const safeColumn = quoteIdentifier(columnName);
  const safeReferencedTable = quoteIdentifier(referencedTable);
  const safeReferencedColumn = quoteIdentifier(referencedColumn);

  await pool.query(
    `ALTER TABLE ${safeTable}
     ADD CONSTRAINT ${safeConstraint}
     FOREIGN KEY (${safeColumn})
     REFERENCES ${safeReferencedTable} (${safeReferencedColumn})
     ON DELETE ${onDelete}
     ON UPDATE ${onUpdate}`
  );

  return constraintName;
}

async function dropForeignKey(tableName, constraintName) {
  assertTableAllowed(tableName);

  const safeConstraintName = String(constraintName || '').trim();
  if (!isValidIdentifier(safeConstraintName)) {
    throw new Error('Nombre de constraint invalido.');
  }

  const safeTable = quoteIdentifier(tableName);
  const safeConstraint = quoteIdentifier(safeConstraintName);

  await pool.query(`ALTER TABLE ${safeTable} DROP FOREIGN KEY ${safeConstraint}`);
}

async function deleteRecord(tableName, id) {
  assertTableAllowed(tableName);

  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    throw new Error('ID de registro invalido.');
  }

  const safeTable = quoteIdentifier(tableName);
  const [result] = await pool.query(`DELETE FROM ${safeTable} WHERE id = ?`, [numericId]);

  if (!result.affectedRows) {
    throw new Error('No se encontro el registro a eliminar.');
  }
}

module.exports = {
  listTables,
  getColumns,
  createTable,
  deleteTable,
  addColumn,
  modifyColumn,
  dropColumn,
  getRecords,
  getRecordsForExport,
  addRecord,
  updateRecord,
  getForeignKeys,
  getForeignKeyOptionsForTable,
  getDisplayColumn,
  setDisplayColumn,
  addForeignKey,
  dropForeignKey,
  deleteRecord,
  ALLOWED_TYPES: Array.from(ALLOWED_TYPES)
};
