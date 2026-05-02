function requireAuth(req, res, next) {
  if (!req.session?.user) {
    return res.redirect('/login');
  }
  return next();
}

function requireAuthApi(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ message: 'No autorizado' });
  }
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.session?.user) {
    return res.redirect('/login');
  }

  if (!req.session.user.isAdmin) {
    return res.status(403).send('No tienes permisos para acceder al panel administrador.');
  }

  return next();
}

module.exports = {
  requireAuth,
  requireAuthApi,
  requireAdmin
};
