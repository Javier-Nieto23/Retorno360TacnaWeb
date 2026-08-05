function requireAdminOrCluster(req, res, next) {
    const roleName = String(req.user?.rol_nombre || '').toLowerCase();
    if (roleName !== 'admin' && roleName !== 'cluster') {
        return res.status(403).json({ error: 'Acceso denegado. Se requiere rol admin o cluster.' });
    }
    return next();
}

module.exports = requireAdminOrCluster;