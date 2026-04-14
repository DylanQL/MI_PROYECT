const crypto = require('crypto');
const { pool } = require('./db');

const CODE_EXPIRY_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function ensureRegistrationTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS registration_codes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      code_hash VARCHAR(128) NOT NULL,
      expires_at DATETIME NOT NULL,
      sent_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      attempts INT NOT NULL DEFAULT 0,
      INDEX idx_registration_email (email),
      INDEX idx_registration_expiry (expires_at)
    )
  `);
}

async function getLastCodeByEmail(email) {
  const [rows] = await pool.query(
    `SELECT *
     FROM registration_codes
     WHERE email = ?
     ORDER BY id DESC
     LIMIT 1`,
    [email]
  );

  return rows[0] || null;
}

async function createCodeForEmail(email, code) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CODE_EXPIRY_MS);

  await pool.query(
    `INSERT INTO registration_codes (email, code_hash, expires_at, sent_at)
     VALUES (?, ?, ?, ?)`,
    [email, sha256(code), expiresAt, now]
  );

  return {
    expiresAt,
    sentAt: now
  };
}

async function markCodeAsUsed(id) {
  await pool.query('UPDATE registration_codes SET used_at = NOW() WHERE id = ?', [id]);
}

async function addAttempt(id) {
  await pool.query('UPDATE registration_codes SET attempts = attempts + 1 WHERE id = ?', [id]);
}

function getCooldownRemainingMs(lastCode) {
  if (!lastCode?.sent_at) return 0;
  const elapsed = Date.now() - new Date(lastCode.sent_at).getTime();
  return Math.max(0, RESEND_COOLDOWN_MS - elapsed);
}

function isCodeExpired(lastCode) {
  if (!lastCode?.expires_at) return true;
  return new Date(lastCode.expires_at).getTime() < Date.now();
}

function isCodeValid(lastCode, plainCode) {
  return sha256(String(plainCode || '').trim()) === lastCode.code_hash;
}

module.exports = {
  CODE_EXPIRY_MS,
  RESEND_COOLDOWN_MS,
  ensureRegistrationTable,
  getLastCodeByEmail,
  createCodeForEmail,
  markCodeAsUsed,
  addAttempt,
  getCooldownRemainingMs,
  isCodeExpired,
  isCodeValid
};
