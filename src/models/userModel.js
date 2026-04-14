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
    passwordHash: row.password_hash ?? row.password ?? ''
  };
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

async function createOrUpdateFromRegistration({ email, username, passwordHash }) {
  const existing = await findByEmail(email);

  if (existing) {
    await pool.query(
      `UPDATE users
       SET username = ?, password = ?
       WHERE id = ?`,
      [username, passwordHash, existing.id]
    );

    return { id: existing.id, isNew: false };
  }

  const [result] = await pool.query(
    `INSERT INTO users (email, username, password)
     VALUES (?, ?, ?)`,
    [email, username, passwordHash]
  );

  return { id: result.insertId, isNew: true };
}

module.exports = {
  findByUsername,
  findById,
  findByEmail,
  updateProfile,
  createOrUpdateFromRegistration
};
