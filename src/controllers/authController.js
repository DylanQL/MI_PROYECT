const bcrypt = require('bcrypt');
const crypto = require('crypto');
const userModel = require('../models/userModel');
const registrationModel = require('../models/registrationModel');
const mailService = require('../services/mailService');

const ALLOWED_DOMAIN = String(process.env.REGISTER_ALLOWED_DOMAIN || 'scania.com').toLowerCase();

function normalizeEmail(rawEmail) {
  return String(rawEmail || '').trim().toLowerCase();
}

function isAllowedDomain(email) {
  const parts = email.split('@');
  return parts.length === 2 && parts[1] === ALLOWED_DOMAIN;
}

function generateNumericCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateRandomPassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*';
  const bytes = crypto.randomBytes(length);
  let password = '';

  for (let i = 0; i < length; i += 1) {
    password += chars[bytes[i] % chars.length];
  }

  return password;
}

async function renderLogin(req, res) {
  if (req.session?.user) {
    return res.redirect('/');
  }

  return res.render('login', { error: null });
}

function renderRegister(req, res) {
  if (req.session?.user) {
    return res.redirect('/');
  }

  return res.render('register', {
    allowedDomain: ALLOWED_DOMAIN,
    error: null
  });
}

async function login(req, res) {
  try {
    const { username, password } = req.body;
    const normalizedLogin = String(username || '').trim();

    if (!normalizedLogin || !password) {
      return res.status(400).render('login', { error: 'Usuario y contrasena son obligatorios.' });
    }

    const user = normalizedLogin.includes('@')
      ? await userModel.findByEmail(normalizedLogin.toLowerCase())
      : await userModel.findByUsername(normalizedLogin);

    if (!user || !user.passwordHash) {
      return res.status(401).render('login', { error: 'Credenciales invalidas.' });
    }

    let valid = false;

    try {
      valid = await bcrypt.compare(password, user.passwordHash);
    } catch (error) {
      valid = password === user.passwordHash;
    }

    if (!valid) {
      return res.status(401).render('login', { error: 'Credenciales invalidas.' });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName
    };

    return res.redirect('/');
  } catch (error) {
    return res.status(500).render('login', { error: `Error al iniciar sesion: ${error.message}` });
  }
}

async function registrationStatus(req, res) {
  try {
    const email = normalizeEmail(req.body.email);

    if (!email) {
      return res.status(400).json({ message: 'El correo es obligatorio.' });
    }

    if (!isAllowedDomain(email)) {
      return res.status(400).json({
        message: `Solo se permite el dominio ${ALLOWED_DOMAIN}.`,
        allowedDomain: ALLOWED_DOMAIN
      });
    }

    const lastCode = await registrationModel.getLastCodeByEmail(email);
    const cooldownRemainingMs = registrationModel.getCooldownRemainingMs(lastCode);

    return res.json({
      email,
      canSendCode: cooldownRemainingMs === 0,
      cooldownRemainingSeconds: Math.ceil(cooldownRemainingMs / 1000)
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function sendRegisterCode(req, res) {
  try {
    const email = normalizeEmail(req.body.email);

    if (!email) {
      return res.status(400).json({ message: 'El correo es obligatorio.' });
    }

    if (!isAllowedDomain(email)) {
      return res.status(400).json({
        message: `Solo se permite el dominio ${ALLOWED_DOMAIN}.`,
        allowedDomain: ALLOWED_DOMAIN
      });
    }

    const lastCode = await registrationModel.getLastCodeByEmail(email);
    const cooldownRemainingMs = registrationModel.getCooldownRemainingMs(lastCode);

    if (cooldownRemainingMs > 0) {
      return res.status(429).json({
        message: 'Debes esperar antes de enviar otro codigo.',
        cooldownRemainingSeconds: Math.ceil(cooldownRemainingMs / 1000)
      });
    }

    const code = generateNumericCode();
    const info = await registrationModel.createCodeForEmail(email, code);

    await mailService.sendVerificationCodeEmail({ to: email, code });

    return res.json({
      message: 'Codigo enviado al correo.',
      email,
      expiresInSeconds: Math.ceil((new Date(info.expiresAt).getTime() - Date.now()) / 1000),
      cooldownRemainingSeconds: Math.ceil(registrationModel.RESEND_COOLDOWN_MS / 1000)
    });
  } catch (error) {
    return res.status(500).json({ message: `No se pudo enviar el codigo: ${error.message}` });
  }
}

async function verifyRegisterCode(req, res) {
  try {
    const email = normalizeEmail(req.body.email);
    const code = String(req.body.code || '').trim();

    if (!email || !code) {
      return res.status(400).json({ message: 'Correo y codigo son obligatorios.' });
    }

    if (!isAllowedDomain(email)) {
      return res.status(400).json({
        message: `Solo se permite el dominio ${ALLOWED_DOMAIN}.`,
        allowedDomain: ALLOWED_DOMAIN
      });
    }

    const lastCode = await registrationModel.getLastCodeByEmail(email);

    if (!lastCode) {
      return res.status(400).json({ message: 'Primero debes solicitar un codigo.' });
    }

    if (lastCode.used_at) {
      return res.status(400).json({ message: 'Este codigo ya fue utilizado. Solicita uno nuevo.' });
    }

    if (registrationModel.isCodeExpired(lastCode)) {
      return res.status(400).json({ message: 'El codigo expiro. Solicita uno nuevo.' });
    }

    if (!registrationModel.isCodeValid(lastCode, code)) {
      await registrationModel.addAttempt(lastCode.id);
      return res.status(400).json({ message: 'Codigo invalido.' });
    }

    const passwordPlain = generateRandomPassword(12);
    const passwordHash = await bcrypt.hash(passwordPlain, 10);
    const username = email;

    await userModel.createOrUpdateFromRegistration({
      email,
      username,
      passwordHash
    });

    await registrationModel.markCodeAsUsed(lastCode.id);
    await mailService.sendGeneratedPasswordEmail({ to: email, password: passwordPlain });

    return res.json({
      message: 'Contrasena generada y enviada al correo. Ya puedes iniciar sesion con tu correo.'
    });
  } catch (error) {
    return res.status(500).json({ message: `No se pudo validar el codigo: ${error.message}` });
  }
}

function logout(req, res) {
  req.session.destroy(() => {
    res.redirect('/login');
  });
}

module.exports = {
  renderLogin,
  renderRegister,
  login,
  registrationStatus,
  sendRegisterCode,
  verifyRegisterCode,
  logout
};
