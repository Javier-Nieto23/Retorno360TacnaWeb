function requireExp(req, res, next) {
    const roleName = String(req.user?.rol_nombre || '').toLowerCase().trim();
    const allowedRoles = ['exp', 'exportacion', 'export'];

    if (!allowedRoles.includes(roleName)) {
        return res.status(403).json({ error: 'Acceso denegado. Se requiere rol EXP.' });
    }

    return next();
}

module.exports = requireExp;
