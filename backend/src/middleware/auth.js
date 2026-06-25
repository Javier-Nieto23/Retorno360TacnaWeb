const pool = require('../config/database');
const { validateSession } = require('../services/sessionStore');

async function authMiddleware(req, res, next) {
    const userId = parseInt(req.headers['x-user-id'], 10);
    const sessionToken = String(req.headers['x-session-token'] || '').trim();

    if (!userId || !sessionToken) {
        return res.status(401).json({ error: 'Usuario no autenticado.' });
    }

    const sessionValidation = validateSession(userId, sessionToken);
    if (!sessionValidation.valid) {
        if (sessionValidation.reason === 'expired') {
            return res.status(401).json({ error: 'La sesión ha expirado. Inicie sesión nuevamente.' });
        }
        return res.status(401).json({ error: 'Sesión no válida.' });
    }

    try {
        const result = await pool.query(
            `SELECT u.id, u.nombre_usuario, u.alias, u.empresa_id,
                    u.rol AS rol_id, r.nombrerol AS rol_nombre,
                    e.razon_social_id, rs.nombre AS razon_social_nombre, rs.r2_folder
             FROM usuarios u
             LEFT JOIN roles r ON u.rol = r.id
             LEFT JOIN empresa e ON u.empresa_id = e.id
             LEFT JOIN razon_social rs ON e.razon_social_id = rs.id
             WHERE u.id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Usuario no válido.' });
        }

        req.user = result.rows[0];
        req.sessionToken = sessionToken;
        next();
    } catch {
        return res.status(500).json({ error: 'Error al validar usuario local.' });
    }
}

module.exports = authMiddleware;
