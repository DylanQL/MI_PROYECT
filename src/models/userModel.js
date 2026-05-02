const { pool } = require('./db');

let cachedColumns = null;

async function getUserColumns() {
  if (cachedColumns) return cachedColumns;

  const [rows] = await pool.query('SHOW COLUMNS FROM users');
  cachedColumns = new Set(rows.map((row) => row.Field));
  return cachedColumns;
}

function mapUser(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email ?? '',
    firstName: row.nombres ?? row.first_name ?? row.nombre ?? '',
    lastName: row.apellidos ?? row.last_name ?? row.apellido ?? '',
    passwordHash: row.password_hash ?? row.password ?? '',
    isAdmin: Boolean(row.is_admin)
  };
}

function firstExistingColumn(columns, names) {
  return names.find((name) => columns.has(name));
}

async function findByUsername(username) {
  const [rows] = await pool.query('SELECT * FROM users WHERE username = ? LIMIT 1', [username]);
  if (!rows.length) return null;
  return mapUser(rows[0]);
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) return null;
  return mapUser(rows[0]);
}

async function findByEmail(email) {
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
  if (!rows.length) return null;
  return mapUser(rows[0]);
}

async function updateProfile({ id, username, firstName, lastName, passwordHash }) {
  const columns = await getUserColumns();

  const updates = [];
  const values = [];

  if (columns.has('username')) {
    updates.push('username = ?');
    values.push(username);
  }

  if (columns.has('nombres')) {
    updates.push('nombres = ?');
    values.push(firstName);
  } else if (columns.has('first_name')) {
    updates.push('first_name = ?');
    values.push(firstName);
  } else if (columns.has('nombre')) {
    updates.push('nombre = ?');
    values.push(firstName);
  }

  if (columns.has('apellidos')) {
    updates.push('apellidos = ?');
    values.push(lastName);
  } else if (columns.has('last_name')) {
    updates.push('last_name = ?');
    values.push(lastName);
  } else if (columns.has('apellido')) {
    updates.push('apellido = ?');
    values.push(lastName);
  }

  if (columns.has('password')) {
    updates.push('password = ?');
    values.push(passwordHash);
  } else if (columns.has('password_hash')) {
    updates.push('password_hash = ?');
    values.push(passwordHash);
  }

  if (!updates.length) {
    throw new Error('No se encontraron columnas editables en la tabla users.');
  }

  values.push(id);
  await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
}

async function listUsers() {
  const [rows] = await pool.query('SELECT * FROM users ORDER BY is_admin DESC, username ASC');

  return rows.map(mapUser);
}

async function createUser({ email, username, firstName, lastName, passwordHash, isAdmin }) {
  const columns = await getUserColumns();
  const firstNameColumn = firstExistingColumn(columns, ['nombres', 'first_name', 'nombre']);
  const lastNameColumn = firstExistingColumn(columns, ['apellidos', 'last_name', 'apellido']);
  const passwordColumn = firstExistingColumn(columns, ['password', 'password_hash']);

  if (!passwordColumn) {
    throw new Error('La tabla users no tiene columna password o password_hash.');
  }

  const insertColumns = ['username', passwordColumn, 'is_admin'];
  const values = [username, passwordHash, isAdmin ? 1 : 0];

  if (columns.has('email')) {
    insertColumns.push('email');
    values.push(email || null);
  }

  if (firstNameColumn) {
    insertColumns.push(firstNameColumn);
    values.push(firstName || null);
  }

  if (lastNameColumn) {
    insertColumns.push(lastNameColumn);
    values.push(lastName || null);
  }

  const placeholders = insertColumns.map(() => '?').join(', ');
  const [result] = await pool.query(
    `INSERT INTO users (${insertColumns.join(', ')}) VALUES (${placeholders})`,
    values
  );

  return findById(result.insertId);
}

async function updateUser({ id, email, username, firstName, lastName, passwordHash, isAdmin }) {
  const columns = await getUserColumns();
  const updates = ['username = ?', 'is_admin = ?'];
  const values = [username, isAdmin ? 1 : 0];

  if (columns.has('email')) {
    updates.push('email = ?');
    values.push(email || null);
  }

  const firstNameColumn = firstExistingColumn(columns, ['nombres', 'first_name', 'nombre']);
  if (firstNameColumn) {
    updates.push(`${firstNameColumn} = ?`);
    values.push(firstName || null);
  }

  const lastNameColumn = firstExistingColumn(columns, ['apellidos', 'last_name', 'apellido']);
  if (lastNameColumn) {
    updates.push(`${lastNameColumn} = ?`);
    values.push(lastName || null);
  }

  if (passwordHash) {
    const passwordColumn = firstExistingColumn(columns, ['password', 'password_hash']);
    if (!passwordColumn) {
      throw new Error('La tabla users no tiene columna password o password_hash.');
    }

    updates.push(`${passwordColumn} = ?`);
    values.push(passwordHash);
  }

  values.push(id);

  await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
  return findById(id);
}

async function deleteUser(id) {
  await pool.query('DELETE FROM users WHERE id = ?', [id]);
}

async function countAdminsExcept(id) {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS total FROM users WHERE is_admin = 1 AND id <> ?',
    [id]
  );
  return Number(rows[0]?.total || 0);
}

async function countAdmins() {
  const [rows] = await pool.query('SELECT COUNT(*) AS total FROM users WHERE is_admin = 1');
  return Number(rows[0]?.total || 0);
}

module.exports = {
  findByUsername,
  findById,
  findByEmail,
  updateProfile,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  countAdminsExcept,
  countAdmins
};
