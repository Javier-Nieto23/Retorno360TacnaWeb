const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { createSession, destroySession } = require('../services/sessionStore');

function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'ip-desconocida';
}

// POST /api/auth/login
async function login(req, res) {
    const { nombre_usuario, password } = req.body;
    const normalizedUser = String(nombre_usuario || '').trim();
    const clientIp = getClientIp(req);

    console.log(`[AUTH][LOGIN] Intento de inicio de sesion usuario="${normalizedUser || 'vacio'}" ip="${clientIp}"`);

    if (!nombre_usuario || !password) {
        console.warn(`[AUTH][LOGIN] Rechazado: campos incompletos usuario="${normalizedUser || 'vacio'}" ip="${clientIp}"`);
        return res.status(400).json({ error: 'Nombre de usuario y contraseña son requeridos.' });
    }

    try {
        const result = await pool.query(
            `SELECT u.*, r.nombrerol AS rol_nombre,
              e.razon_social_id, rs.nombre AS razon_social_nombre, rs.r2_folder
        FROM usuarios u
        LEFT JOIN roles r ON u.rol = r.id
        LEFT JOIN empresa e ON u.empresa_id = e.id
        LEFT JOIN razon_social rs ON e.razon_social_id = rs.id
        WHERE LOWER(u.nombre_usuario) = LOWER($1)`,
            [normalizedUser]
        );

        if (result.rows.length === 0) {
            console.warn(`[AUTH][LOGIN] Rechazado: usuario no existe usuario="${normalizedUser}" ip="${clientIp}"`);
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        const user = result.rows[0];
        const hash = user.password_hash || '';
        const isBcryptHash = /^\$2[aby]\$\d{2}\$/.test(hash);

        // En modo seguro, solo se aceptan contraseñas almacenadas en bcrypt.
        if (!isBcryptHash) {
            console.warn(
                `[AUTH][LOGIN] Rechazado: hash no valido usuario="${normalizedUser}" user_id=${user.id} ip="${clientIp}"`
            );
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        const passwordMatch = await bcrypt.compare(password, hash);

        if (!passwordMatch) {
            console.warn(
                `[AUTH][LOGIN] Rechazado: password incorrecta usuario="${normalizedUser}" user_id=${user.id} ip="${clientIp}"`
            );
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        console.log(
            `[AUTH][LOGIN] Exitoso usuario="${normalizedUser}" user_id=${user.id} empresa_id=${user.empresa_id || 'null'} razon_social_id=${user.razon_social_id || 'null'} ip="${clientIp}"`
        );

        const session = createSession(user.id);

        res.json({
            user: {
                id: user.id,
                nombre_usuario: user.nombre_usuario,
                alias: user.alias,
                empresa_id: user.empresa_id,
                rol_id: user.rol,
                rol_nombre: user.rol_nombre,
                is_admin: String(user.rol_nombre || '').toLowerCase() === 'admin',
                razon_social_id: user.razon_social_id,
                razon_social_nombre: user.razon_social_nombre,
                r2_folder: user.r2_folder,
            },
            session: {
                token: session.token,
                issued_at: session.issuedAt,
                expires_at: session.expiresAt,
                timeout_ms: session.timeoutMs,
            },
        });
    } catch (err) {
        console.error(`[AUTH][LOGIN] Error interno usuario="${normalizedUser}" ip="${clientIp}":`, err.message);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
}

// POST /api/auth/logout
function logout(req, res) {
    const sessionToken = String(req.headers['x-session-token'] || '').trim();
    destroySession(sessionToken);
    return res.status(204).send();
}

// POST /api/auth/register  (solo para setup inicial / admin)
async function register(req, res) {
    const { nombre_usuario, alias, password, empresa_id, rol_id } = req.body;
    if (!nombre_usuario || !alias || !password) {
        return res.status(400).json({ error: 'nombre_usuario, alias y password son requeridos.' });
    }

    try {
        const salt = await bcrypt.genSalt(12);
        const password_hash = await bcrypt.hash(password, salt);

        const result = await pool.query(
            `INSERT INTO usuarios (nombre_usuario, alias, password_hash, empresa_id, rol)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, nombre_usuario, alias, empresa_id, rol, created_at`,
            [nombre_usuario, alias, password_hash, empresa_id || null, rol_id || null]
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
            `SELECT u.id, u.nombre_usuario, u.alias, u.empresa_id, u.rol AS rol_id, r.nombrerol AS rol_nombre, u.created_at,
                            e.razon_social_id, rs.nombre AS razon_social_nombre, rs.r2_folder
             FROM usuarios u
             LEFT JOIN roles r ON u.rol = r.id
             LEFT JOIN empresa e ON u.empresa_id = e.id
             LEFT JOIN razon_social rs ON e.razon_social_id = rs.id
             WHERE u.id = $1`,
            [req.user.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }
        const user = result.rows[0];
        res.json({
            user: {
                ...user,
                is_admin: String(user.rol_nombre || '').toLowerCase() === 'admin',
            },
        });
    } catch (err) {
        console.error('Error en /me:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
}

module.exports = { login, register, me, logout };
