function requireCluster(req, res, next) {
    const roleName = String(req.user?.rol_nombre || '').toLowerCase();
    if (roleName !== 'cluster') {
        return res.status(403).json({ error: 'Acceso denegado. Se requiere rol cluster.' });
    }
    return next();
}

module.exports = requireCluster;