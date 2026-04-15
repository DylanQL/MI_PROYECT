const tableModel = require('../models/dynamicTableModel');

function withWsEvent(req, event, payload = {}) {
  if (req.app.locals.broadcast) {
    req.app.locals.broadcast(event, payload);
  }
}

async function getTables(req, res) {
  try {
    const tables = await tableModel.listTables();
    return res.json({ tables });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function createTable(req, res) {
  try {
    const { tableName, columns } = req.body;
    await tableModel.createTable(tableName, columns);

    withWsEvent(req, 'table_created', { tableName });

    return res.status(201).json({ message: 'Tabla creada correctamente.' });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

async function editTable(req, res) {
  try {
    const { tableName } = req.params;
    const { action, oldName, name, type, nullable } = req.body;

    if (action === 'add') {
      await tableModel.addColumn(tableName, { name, type, nullable });
    } else if (action === 'modify') {
      await tableModel.modifyColumn(tableName, oldName, { name, type, nullable });
    } else if (action === 'drop') {
      await tableModel.dropColumn(tableName, name);
    } else {
      return res.status(400).json({ message: 'Accion no valida. Usa add, modify o drop.' });
    }

    withWsEvent(req, 'table_edited', { tableName, action });

    return res.json({ message: 'Tabla actualizada correctamente.' });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

async function deleteTable(req, res) {
  try {
    const { tableName } = req.params;

    await tableModel.deleteTable(tableName);
    withWsEvent(req, 'table_deleted', { tableName });

    return res.json({ message: 'Tabla eliminada correctamente.' });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

async function getRecords(req, res) {
  try {
    const { tableName } = req.params;
    const { page = 1, pageSize = 10, ...filters } = req.query;

    const records = await tableModel.getRecords(tableName, page, pageSize, filters);

    return res.json(records);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

async function addRecord(req, res) {
  try {
    const { tableName } = req.params;
    const { values } = req.body;

    const insertId = await tableModel.addRecord(tableName, values);
    withWsEvent(req, 'record_added', { tableName, insertId });

    return res.status(201).json({ message: 'Registro agregado correctamente.', insertId });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

async function deleteRecord(req, res) {
  try {
    const { tableName, id } = req.params;

    await tableModel.deleteRecord(tableName, id);
    withWsEvent(req, 'record_deleted', { tableName, id: Number(id) });

    return res.json({ message: 'Registro eliminado correctamente.' });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

async function getForeignKeys(req, res) {
  try {
    const { tableName } = req.params;
    const foreignKeys = await tableModel.getForeignKeys(tableName);
    return res.json({ foreignKeys });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

async function addForeignKey(req, res) {
  try {
    const { tableName } = req.params;
    const constraintName = await tableModel.addForeignKey(tableName, req.body || {});

    withWsEvent(req, 'fk_created', { tableName, constraintName });

    return res.status(201).json({ message: 'Llave foranea creada correctamente.', constraintName });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

async function deleteForeignKey(req, res) {
  try {
    const { tableName, constraintName } = req.params;
    await tableModel.dropForeignKey(tableName, constraintName);

    withWsEvent(req, 'fk_deleted', { tableName, constraintName });

    return res.json({ message: 'Llave foranea eliminada correctamente.' });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

async function getTableColumns(req, res) {
  try {
    const { tableName } = req.params;
    const columns = await tableModel.getColumns(tableName);
    return res.json({ columns });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

module.exports = {
  getTables,
  createTable,
  editTable,
  deleteTable,
  getRecords,
  addRecord,
  deleteRecord,
  getForeignKeys,
  addForeignKey,
  deleteForeignKey,
  getTableColumns
};
