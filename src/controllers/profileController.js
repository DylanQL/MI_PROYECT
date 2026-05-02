const bcrypt = require('bcrypt');
const userModel = require('../models/userModel');

async function renderProfile(req, res) {
  const freshUser = await userModel.findById(req.session.user.id);

  return res.render('profile', {
    user: freshUser || req.session.user,
    error: null,
    success: null
  });
}

async function updateProfile(req, res) {
  try {
    const current = await userModel.findById(req.session.user.id);

    if (!current) {
      return res.status(404).render('profile', {
        user: req.session.user,
        error: 'Usuario no encontrado.',
        success: null
      });
    }

    const username = String(req.body.username || '').trim();
    const firstName = String(req.body.firstName || '').trim();
    const lastName = String(req.body.lastName || '').trim();
    const password = String(req.body.password || '').trim();

    if (!username) {
      return res.status(400).render('profile', {
        user: current,
        error: 'El username es obligatorio.',
        success: null
      });
    }

    const passwordHash = password ? await bcrypt.hash(password, 10) : current.passwordHash;

    await userModel.updateProfile({
      id: current.id,
      username,
      firstName,
      lastName,
      passwordHash
    });

    req.session.user = {
      id: current.id,
      username,
      firstName,
      lastName,
      isAdmin: current.isAdmin
    };

    return res.render('profile', {
      user: req.session.user,
      error: null,
      success: 'Perfil actualizado correctamente.'
    });
  } catch (error) {
    return res.status(500).render('profile', {
      user: req.session.user,
      error: `No se pudo actualizar el perfil: ${error.message}`,
      success: null
    });
  }
}

module.exports = {
  renderProfile,
  updateProfile
};
