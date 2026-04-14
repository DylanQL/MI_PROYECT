const { pool } = require('../models/db');
const registrationModel = require('../models/registrationModel');

async function ensureUsersSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NULL,
      username VARCHAR(100) NOT NULL UNIQUE,
      nombres VARCHAR(120) NULL,
      apellidos VARCHAR(120) NULL,
      password VARCHAR(255) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const [rows] = await pool.query('SHOW COLUMNS FROM users');
  const columns = new Set(rows.map((row) => row.Field));

  if (!columns.has('email')) {
    await pool.query('ALTER TABLE users ADD COLUMN email VARCHAR(255) NULL');
  }

  const hasUniqueEmail = rows.some((row) => row.Field === 'email' && row.Key === 'UNI');
  if (!hasUniqueEmail) {
    const [duplicatedRows] = await pool.query(
      `SELECT email, COUNT(*) AS total
       FROM users
       WHERE email IS NOT NULL AND email <> ''
       GROUP BY email
       HAVING COUNT(*) > 1
       LIMIT 1`
    );

    if (!duplicatedRows.length) {
      await pool.query('ALTER TABLE users ADD UNIQUE INDEX ux_users_email (email)');
    }
  }
}

async function ensureRegistrationSetup() {
  await ensureUsersSchema();
  await registrationModel.ensureRegistrationTable();
}

module.exports = {
  ensureRegistrationSetup
};
