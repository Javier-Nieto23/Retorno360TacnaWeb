function requireImp(req, res, next) {
    const roleName = String(req.user?.rol_nombre || '').toLowerCase().trim();
    const allowedRoles = ['imp', 'importacion', 'import'];

    if (!allowedRoles.includes(roleName)) {
        return res.status(403).json({ error: 'Acceso denegado. Se requiere rol IMP.' });
    }

    return next();
}

module.exports = requireImp;
