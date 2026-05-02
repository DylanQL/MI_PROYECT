const RESERVED_TABLES = new Set(['users', 'app_sessions']);

function isValidIdentifier(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function quoteIdentifier(value) {
  if (!isValidIdentifier(value)) {
    throw new Error('Identificador SQL invalido. Usa solo letras, numeros y guion bajo.');
  }
  return `\`${value}\``;
}

function assertTableAllowed(tableName) {
  if (!isValidIdentifier(tableName)) {
    throw new Error('Nombre de tabla invalido.');
  }
  if (RESERVED_TABLES.has(tableName.toLowerCase())) {
    throw new Error('La tabla solicitada no esta permitida en la aplicacion.');
  }
}

module.exports = {
  RESERVED_TABLES,
  isValidIdentifier,
  quoteIdentifier,
  assertTableAllowed
};
