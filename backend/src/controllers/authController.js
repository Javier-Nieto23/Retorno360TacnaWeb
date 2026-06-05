const bcrypt = require('bcryptjs');
const pool = require('../config/database');

// POST /api/auth/login
async function login(req, res) {
    const { nombre_usuario, password } = req.body;
    if (!nombre_usuario || !password) {
        return res.status(400).json({ error: 'Nombre de usuario y contraseña son requeridos.' });
    }

    try {
        const normalizedUser = String(nombre_usuario).trim();
        const result = await pool.query(
            `SELECT u.*, rs.nombre AS razon_social_nombre, rs.r2_folder
       FROM usuarios u
       LEFT JOIN razon_social rs ON u.razon_social_id = rs.id
       WHERE LOWER(u.nombre_usuario) = LOWER($1)`,
            [normalizedUser]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        const user = result.rows[0];
        const hash = user.password_hash || '';
        const isBcryptHash = /^\$2[aby]\$\d{2}\$/.test(hash);

        // En modo seguro, solo se aceptan contraseñas almacenadas en bcrypt.
        if (!isBcryptHash) {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        const passwordMatch = await bcrypt.compare(password, hash);

        if (!passwordMatch) {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        res.json({
            user: {
                id: user.id,
                nombre_usuario: user.nombre_usuario,
                alias: user.alias,
                razon_social_id: user.razon_social_id,
                razon_social_nombre: user.razon_social_nombre,
                r2_folder: user.r2_folder,
            },
        });
    } catch (err) {
        console.error('Error en login:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
}

// POST /api/auth/register  (solo para setup inicial / admin)
async function register(req, res) {
    const { nombre_usuario, alias, password, razon_social_id } = req.body;
    if (!nombre_usuario || !alias || !password) {
        return res.status(400).json({ error: 'nombre_usuario, alias y password son requeridos.' });
    }

    try {
        const salt = await bcrypt.genSalt(12);
        const password_hash = await bcrypt.hash(password, salt);

        const result = await pool.query(
            `INSERT INTO usuarios (nombre_usuario, alias, password_hash, razon_social_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nombre_usuario, alias, razon_social_id, created_at`,
            [nombre_usuario, alias, password_hash, razon_social_id || null]
        );

        res.status(201).json({ user: result.rows[0] });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'El nombre de usuario ya existe.' });
        }
        console.error('Error en register:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
}

// GET /api/auth/me  (obtener datos del usuario autenticado en modo local)
async function me(req, res) {
    try {
        const result = await pool.query(
            `SELECT u.id, u.nombre_usuario, u.alias, u.razon_social_id, u.created_at,
              rs.nombre AS razon_social_nombre, rs.r2_folder
       FROM usuarios u
       LEFT JOIN razon_social rs ON u.razon_social_id = rs.id
       WHERE u.id = $1`,
            [req.user.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }
        res.json({ user: result.rows[0] });
    } catch (err) {
        console.error('Error en /me:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
}

module.exports = { login, register, me };
