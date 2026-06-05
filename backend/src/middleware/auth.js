const pool = require('../config/database');

async function authMiddleware(req, res, next) {
    const userId = parseInt(req.headers['x-user-id']);
    if (!userId) {
        return res.status(401).json({ error: 'Usuario no autenticado.' });
    }

    try {
        const result = await pool.query(
            `SELECT u.id, u.nombre_usuario, u.alias, u.razon_social_id,
                    rs.nombre AS razon_social_nombre, rs.r2_folder
             FROM usuarios u
             LEFT JOIN razon_social rs ON u.razon_social_id = rs.id
             WHERE u.id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Usuario no válido.' });
        }

        req.user = result.rows[0];
        next();
    } catch {
        return res.status(500).json({ error: 'Error al validar usuario local.' });
    }
}

module.exports = authMiddleware;
