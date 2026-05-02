const bcrypt = require('bcrypt');
const userModel = require('../models/userModel');

function normalizeUserPayload(body) {
  return {
    email: String(body.email || '').trim().toLowerCase(),
    username: String(body.username || '').trim(),
    firstName: String(body.firstName || '').trim(),
    lastName: String(body.lastName || '').trim(),
    password: String(body.password || '').trim(),
    isAdmin: body.isAdmin === 'on' || body.isAdmin === '1'
  };
}

async function renderAdmin(req, res) {
  if (!req.session?.user) {
    return res.render('login', {
      error: null,
      formAction: '/admin/login',
      isAdminLogin: true
    });
  }

  if (!req.session.user.isAdmin) {
    return res.status(403).send('No tienes permisos para acceder al panel administrador.');
  }

  const users = await userModel.listUsers();

  return res.render('admin', {
    user: req.session.user,
    users,
    error: null,
    success: null,
    editingUser: null
  });
}

async function renderEditUser(req, res) {
  const [users, editingUser] = await Promise.all([
    userModel.listUsers(),
    userModel.findById(req.params.id)
  ]);

  if (!editingUser) {
    return res.status(404).render('admin', {
      user: req.session.user,
      users,
      error: 'Usuario no encontrado.',
      success: null,
      editingUser: null
    });
  }

  return res.render('admin', {
    user: req.session.user,
    users,
    error: null,
    success: null,
    editingUser
  });
}

async function createUser(req, res) {
  try {
    const payload = normalizeUserPayload(req.body);

    if (!payload.username || !payload.password) {
      throw new Error('Username y contrasena son obligatorios.');
    }

    const passwordHash = await bcrypt.hash(payload.password, 10);

    await userModel.createUser({
      email: payload.email,
      username: payload.username,
      firstName: payload.firstName,
      lastName: payload.lastName,
      passwordHash,
      isAdmin: payload.isAdmin
    });

    const users = await userModel.listUsers();
    return res.render('admin', {
      user: req.session.user,
      users,
      error: null,
      success: 'Cuenta creada correctamente.',
      editingUser: null
    });
  } catch (error) {
    const users = await userModel.listUsers();
    return res.status(400).render('admin', {
      user: req.session.user,
      users,
      error: `No se pudo crear la cuenta: ${error.message}`,
      success: null,
      editingUser: null
    });
  }
}

async function updateUser(req, res) {
  try {
    const id = Number(req.params.id);
    const current = await userModel.findById(id);

    if (!current) {
      throw new Error('Usuario no encontrado.');
    }

    const payload = normalizeUserPayload(req.body);

    if (!payload.username) {
      throw new Error('Username es obligatorio.');
    }

    if (current.isAdmin && !payload.isAdmin) {
      const otherAdmins = await userModel.countAdminsExcept(id);
      if (otherAdmins === 0) {
        throw new Error('Debe existir al menos una cuenta administradora.');
      }
    }

    const passwordHash = payload.password ? await bcrypt.hash(payload.password, 10) : null;
    const updatedUser = await userModel.updateUser({
      id,
      email: payload.email,
      username: payload.username,
      firstName: payload.firstName,
      lastName: payload.lastName,
      passwordHash,
      isAdmin: payload.isAdmin
    });

    if (req.session.user.id === id) {
      req.session.user = {
        id: updatedUser.id,
        username: updatedUser.username,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        isAdmin: updatedUser.isAdmin
      };
    }

    const users = await userModel.listUsers();
    return res.render('admin', {
      user: req.session.user,
      users,
      error: null,
      success: 'Cuenta actualizada correctamente.',
      editingUser: null
    });
  } catch (error) {
    const [users, editingUser] = await Promise.all([
      userModel.listUsers(),
      userModel.findById(req.params.id)
    ]);

    return res.status(400).render('admin', {
      user: req.session.user,
      users,
      error: `No se pudo actualizar la cuenta: ${error.message}`,
      success: null,
      editingUser
    });
  }
}

async function deleteUser(req, res) {
  try {
    const id = Number(req.params.id);
    const current = await userModel.findById(id);

    if (!current) {
      throw new Error('Usuario no encontrado.');
    }

    if (req.session.user.id === id) {
      throw new Error('No puedes eliminar tu propia cuenta mientras estas conectado.');
    }

    if (current.isAdmin) {
      const otherAdmins = await userModel.countAdminsExcept(id);
      if (otherAdmins === 0) {
        throw new Error('Debe existir al menos una cuenta administradora.');
      }
    }

    await userModel.deleteUser(id);

    const users = await userModel.listUsers();
    return res.render('admin', {
      user: req.session.user,
      users,
      error: null,
      success: 'Cuenta eliminada correctamente.',
      editingUser: null
    });
  } catch (error) {
    const users = await userModel.listUsers();
    return res.status(400).render('admin', {
      user: req.session.user,
      users,
      error: `No se pudo eliminar la cuenta: ${error.message}`,
      success: null,
      editingUser: null
    });
  }
}

module.exports = {
  renderAdmin,
  renderEditUser,
  createUser,
  updateUser,
  deleteUser
};
