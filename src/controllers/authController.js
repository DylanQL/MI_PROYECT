const bcrypt = require('bcrypt');
const userModel = require('../models/userModel');

async function renderLogin(req, res) {
  if (req.session?.user) {
    return res.redirect('/');
  }

  return res.render('login', {
    error: null,
    formAction: '/login',
    isAdminLogin: false
  });
}

async function authenticate(req, res, { requireAdmin = false, successRedirect = '/' } = {}) {
  try {
    const { username, password } = req.body;
    const normalizedLogin = String(username || '').trim();

    if (!normalizedLogin || !password) {
      return res.status(400).render('login', {
        error: 'Usuario y contrasena son obligatorios.',
        formAction: requireAdmin ? '/admin/login' : '/login',
        isAdminLogin: requireAdmin
      });
    }

    const user = normalizedLogin.includes('@')
      ? await userModel.findByEmail(normalizedLogin.toLowerCase())
      : await userModel.findByUsername(normalizedLogin);

    if (!user || !user.passwordHash) {
      return res.status(401).render('login', {
        error: 'Credenciales invalidas.',
        formAction: requireAdmin ? '/admin/login' : '/login',
        isAdminLogin: requireAdmin
      });
    }

    let valid = false;

    try {
      valid = await bcrypt.compare(password, user.passwordHash);
    } catch (error) {
      valid = password === user.passwordHash;
    }

    if (!valid) {
      return res.status(401).render('login', {
        error: 'Credenciales invalidas.',
        formAction: requireAdmin ? '/admin/login' : '/login',
        isAdminLogin: requireAdmin
      });
    }

    if (requireAdmin && !user.isAdmin) {
      return res.status(403).render('login', {
        error: 'Esta cuenta no tiene permisos de administrador.',
        formAction: '/admin/login',
        isAdminLogin: true
      });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      isAdmin: user.isAdmin
    };

    return res.redirect(successRedirect);
  } catch (error) {
    return res.status(500).render('login', {
      error: `Error al iniciar sesion: ${error.message}`,
      formAction: requireAdmin ? '/admin/login' : '/login',
      isAdminLogin: requireAdmin
    });
  }
}

async function login(req, res) {
  return authenticate(req, res);
}

async function loginAdmin(req, res) {
  return authenticate(req, res, {
    requireAdmin: true,
    successRedirect: '/admin'
  });
}

function logout(req, res) {
  req.session.destroy(() => {
    res.redirect('/login');
  });
}

module.exports = {
  renderLogin,
  login,
  loginAdmin,
  logout
};
