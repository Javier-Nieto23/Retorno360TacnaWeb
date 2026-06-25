function requireAdmin(req, res, next) {
    const roleName = String(req.user?.rol_nombre || '').toLowerCase();
    if (roleName !== 'admin') {
        return res.status(403).json({ error: 'Acceso denegado. Se requiere rol admin.' });
    }
    return next();
}

module.exports = requireAdmin;
