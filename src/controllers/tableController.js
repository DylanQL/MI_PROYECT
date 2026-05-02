const tableModel = require('../models/dynamicTableModel');
const JSZip = require('jszip');

function withWsEvent(req, event, payload = {}) {
  if (req.app.locals.broadcast) {
    req.app.locals.broadcast(event, payload);
  }
}

function getExportCellValue(row, columnName, fkDisplaysByColumn, showFkDisplay) {
  const rawValue = row[columnName];
  const fkDisplay = fkDisplaysByColumn[columnName];

  if (showFkDisplay && fkDisplay && rawValue !== null && rawValue !== undefined) {
    const displayValue = fkDisplay.values?.[String(rawValue)];
    if (displayValue !== undefined && displayValue !== null) {
      return displayValue;
    }
  }

  return rawValue ?? '';
}

function buildSafeSheetName(tableName) {
  const safeName = String(tableName || 'Datos').replace(/[\\/*?:[\]]/g, ' ').trim();
  return (safeName || 'Datos').slice(0, 31);
}

function buildSafeFileName(tableName, showFkDisplay) {
  const safeTableName = String(tableName || 'tabla').replace(/[^\w.-]+/g, '_');
  return `${safeTableName}_${showFkDisplay ? 'fk-campo' : 'fk-id'}.xlsx`;
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toExcelColumnName(index) {
  let columnName = '';
  let current = index;

  while (current > 0) {
    const remainder = (current - 1) % 26;
    columnName = String.fromCharCode(65 + remainder) + columnName;
    current = Math.floor((current - 1) / 26);
  }

  return columnName;
}

function normalizeExcelValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().replace('T', ' ').slice(0, 19);
  }

  return value;
}

function buildCellXml(value, rowIndex, columnIndex, styleId = 0) {
  const cellRef = `${toExcelColumnName(columnIndex)}${rowIndex}`;
  const normalizedValue = normalizeExcelValue(value);
  const styleAttribute = styleId ? ` s="${styleId}"` : '';

  if (typeof normalizedValue === 'number' && Number.isFinite(normalizedValue)) {
    return `<c r="${cellRef}"${styleAttribute}><v>${normalizedValue}</v></c>`;
  }

  return `<c r="${cellRef}" t="inlineStr"${styleAttribute}><is><t>${xmlEscape(normalizedValue)}</t></is></c>`;
}

function buildWorksheetRowsXml({ columns, rows, fkDisplaysByColumn, showFkDisplay }) {
  const headerCells = columns.map((columnName, index) => buildCellXml(columnName, 1, index + 1, 1)).join('');
  const bodyRows = rows.map((row, rowIndex) => {
    const excelRowIndex = rowIndex + 2;
    const cells = columns.map((columnName, columnIndex) => {
      const value = getExportCellValue(row, columnName, fkDisplaysByColumn, showFkDisplay);
      return buildCellXml(value, excelRowIndex, columnIndex + 1);
    }).join('');

    return `<row r="${excelRowIndex}">${cells}</row>`;
  }).join('');

  return `<row r="1">${headerCells}</row>${bodyRows}`;
}

function buildColumnWidthsXml({ columns, rows, fkDisplaysByColumn, showFkDisplay }) {
  if (!columns.length) return '';

  const columnWidths = columns.map((columnName, index) => {
    const maxLength = rows.reduce((max, row) => {
      const value = normalizeExcelValue(getExportCellValue(row, columnName, fkDisplaysByColumn, showFkDisplay));
      return Math.max(max, String(value ?? '').length);
    }, String(columnName).length);
    const width = Math.min(Math.max(maxLength + 2, 12), 50);
    const columnIndex = index + 1;

    return `<col min="${columnIndex}" max="${columnIndex}" width="${width}" customWidth="1"/>`;
  }).join('');

  return `<cols>${columnWidths}</cols>`;
}

function buildWorksheetXml({ columns, rows, fkDisplaysByColumn, showFkDisplay }) {
  const lastColumn = toExcelColumnName(Math.max(columns.length, 1));
  const lastRow = Math.max(rows.length + 1, 1);
  const dimension = `A1:${lastColumn}${lastRow}`;
  const columnWidths = buildColumnWidthsXml({ columns, rows, fkDisplaysByColumn, showFkDisplay });
  const sheetRows = buildWorksheetRowsXml({ columns, rows, fkDisplaysByColumn, showFkDisplay });
  const autoFilter = columns.length ? `<autoFilter ref="A1:${lastColumn}1"/>` : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="${dimension}"/>
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
      <selection pane="bottomLeft"/>
    </sheetView>
  </sheetViews>
  ${columnWidths}
  <sheetData>${sheetRows}</sheetData>
  ${autoFilter}
</worksheet>`;
}

function buildContentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;
}

function buildRootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function buildWorkbookRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function buildWorkbookXml(sheetName) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;
}

function buildStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/></font>
  </fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  </cellXfs>
</styleSheet>`;
}

function buildCoreXml() {
  const now = new Date().toISOString();

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>DataPilot MVC</dc:creator>
  <cp:lastModifiedBy>DataPilot MVC</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
}

function buildAppXml(sheetName) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>DataPilot MVC</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <HeadingPairs>
    <vt:vector size="2" baseType="variant">
      <vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant>
      <vt:variant><vt:i4>1</vt:i4></vt:variant>
    </vt:vector>
  </HeadingPairs>
  <TitlesOfParts>
    <vt:vector size="1" baseType="lpstr"><vt:lpstr>${xmlEscape(sheetName)}</vt:lpstr></vt:vector>
  </TitlesOfParts>
</Properties>`;
}

async function buildExcelWorkbook({ tableName, columns, rows, fkDisplaysByColumn, showFkDisplay }) {
  const zip = new JSZip();
  const sheetName = buildSafeSheetName(tableName);

  zip.file('[Content_Types].xml', buildContentTypesXml());
  zip.folder('_rels').file('.rels', buildRootRelsXml());
  zip.folder('docProps').file('app.xml', buildAppXml(sheetName));
  zip.folder('docProps').file('core.xml', buildCoreXml());
  zip.folder('xl').file('workbook.xml', buildWorkbookXml(sheetName));
  zip.folder('xl').file('styles.xml', buildStylesXml());
  zip.folder('xl').folder('_rels').file('workbook.xml.rels', buildWorkbookRelsXml());
  zip.folder('xl').folder('worksheets').file('sheet1.xml', buildWorksheetXml({
    columns,
    rows,
    fkDisplaysByColumn,
    showFkDisplay
  }));

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
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
    const { tableName, columns, displayColumn } = req.body;
    await tableModel.createTable(tableName, columns, displayColumn);

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
    const { page = 1, pageSize = 10, fkDisplay, ...filters } = req.query;
    const useFkDisplayFilters = fkDisplay === '1' || fkDisplay === 'true';

    const records = await tableModel.getRecords(tableName, page, pageSize, filters, { useFkDisplayFilters });

    return res.json(records);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

async function exportRecords(req, res) {
  try {
    const { tableName } = req.params;
    const { fkDisplay, ...filters } = req.query;
    const showFkDisplay = fkDisplay === '1' || fkDisplay === 'true';
    const records = await tableModel.getRecordsForExport(tableName, filters, {
      useFkDisplayFilters: showFkDisplay
    });
    const excelBuffer = await buildExcelWorkbook({
      tableName,
      columns: records.columns,
      rows: records.data,
      fkDisplaysByColumn: records.fkDisplaysByColumn,
      showFkDisplay
    });
    const safeFileName = buildSafeFileName(tableName, showFkDisplay);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    return res.send(Buffer.from(excelBuffer));
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

async function updateRecord(req, res) {
  try {
    const { tableName, id } = req.params;
    const { values } = req.body;

    await tableModel.updateRecord(tableName, id, values);
    withWsEvent(req, 'record_updated', { tableName, id: Number(id) });

    return res.json({ message: 'Registro actualizado correctamente.' });
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
    const displayColumn = await tableModel.getDisplayColumn(tableName);
    return res.json({ columns, displayColumn });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

async function updateDisplayColumn(req, res) {
  try {
    const { tableName } = req.params;
    const { displayColumn } = req.body;

    await tableModel.setDisplayColumn(tableName, displayColumn);

    withWsEvent(req, 'table_display_updated', { tableName, displayColumn });

    return res.json({ message: 'Campo visible actualizado correctamente.' });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

async function getTableColumnsWithFkOptions(req, res) {
  try {
    const { tableName } = req.params;
    const columns = await tableModel.getColumns(tableName);
    const fkOptionsByColumn = await tableModel.getForeignKeyOptionsForTable(tableName);
    return res.json({ columns, fkOptionsByColumn });
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
  exportRecords,
  addRecord,
  updateRecord,
  deleteRecord,
  getForeignKeys,
  addForeignKey,
  deleteForeignKey,
  getTableColumns,
  updateDisplayColumn,
  getTableColumnsWithFkOptions
};
