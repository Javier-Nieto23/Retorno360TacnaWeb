const bcrypt = require('bcryptjs');
const pool = require('../config/database');

function buildDashboardFilters(query) {
    const conditions = [];
    const values = [];

    const razonSocialId = Number(query?.razon_social_id);
    const empresaId = Number(query?.empresa_id);

    if (query?.razon_social_id) {
        if (Number.isNaN(razonSocialId)) {
            throw new Error('razon_social_id inválido.');
        }
        values.push(razonSocialId);
        conditions.push(`ah.razon_social_id = $${values.length}`);
    }

    if (query?.empresa_id) {
        if (Number.isNaN(empresaId)) {
            throw new Error('empresa_id inválido.');
        }
        values.push(empresaId);
        conditions.push(`ah.empresa_id = $${values.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    return { whereClause, values };
}

async function dashboard(req, res) {
    try {
        const { whereClause, values } = buildDashboardFilters(req.query);

        const [totalesResult, agrupadoResult, mensualResult] = await Promise.all([
            pool.query(
                `SELECT
                    COUNT(*)::int AS total_archivos,
                    COUNT(DISTINCT ah.razon_social_id)::int AS total_razones_sociales,
                    COUNT(DISTINCT ah.empresa_id)::int AS total_empresas,
                    COUNT(DISTINCT ah.usuario_id)::int AS total_usuarios_con_subidas
                 FROM archivos_historial ah
                 ${whereClause}`,
                values
            ),
            pool.query(
                `SELECT
                    COALESCE(rs.id, 0) AS razon_social_id,
                    COALESCE(rs.nombre, 'Sin razón social') AS razon_social,
                    COALESCE(e.id, 0) AS empresa_id,
                    COALESCE(e.nombre, 'Sin empresa') AS empresa,
                    COUNT(ah.id)::int AS total_archivos,
                    MAX(ah.uploaded_at) AS ultima_subida
                 FROM archivos_historial ah
                 LEFT JOIN empresa e ON ah.empresa_id = e.id
                 LEFT JOIN razon_social rs ON ah.razon_social_id = rs.id
                      ${whereClause}
                 GROUP BY rs.id, rs.nombre, e.id, e.nombre
                  ORDER BY total_archivos DESC, razon_social ASC, empresa ASC`,
                values
            ),
            pool.query(
                `WITH anio_reporte AS (
                    SELECT COALESCE(MAX(ah.anio), EXTRACT(YEAR FROM CURRENT_DATE)::int) AS anio
                    FROM archivos_historial ah
                          ${whereClause}
                )
                 SELECT
                    ar.anio::int AS anio,
                    gs.mes::int AS mes,
                    TRIM(TO_CHAR(MAKE_DATE(ar.anio::int, gs.mes, 1), 'TMMonth')) AS mes_nombre,
                    COALESCE(COUNT(ah.id), 0)::int AS total_archivos
                 FROM anio_reporte ar
                 CROSS JOIN generate_series(1, 12) AS gs(mes)
                 LEFT JOIN archivos_historial ah
                    ON ah.anio = ar.anio
                   AND ah.mes = gs.mes
                      ${whereClause}
                 GROUP BY ar.anio, gs.mes
                      ORDER BY gs.mes`,
                values
            ),
        ]);

        res.json({
            totales: totalesResult.rows[0],
            por_empresa: agrupadoResult.rows,
            por_mes: mensualResult.rows,
            anio_reporte: mensualResult.rows[0]?.anio || new Date().getFullYear(),
        });
    } catch (err) {
        console.error('[ADMIN][DASHBOARD] Error:', err);
        if (String(err.message || '').includes('inválido')) {
            return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: 'Error al obtener dashboard de administración.' });
    }
}

async function catalogo(req, res) {
    try {
        const [rolesResult, razonesResult, empresasResult] = await Promise.all([
            pool.query('SELECT id, nombrerol FROM roles ORDER BY nombrerol'),
            pool.query('SELECT id, nombre FROM razon_social ORDER BY nombre'),
            pool.query('SELECT id, nombre, razon_social_id FROM empresa ORDER BY nombre'),
        ]);

        res.json({
            roles: rolesResult.rows,
            razones_sociales: razonesResult.rows,
            empresas: empresasResult.rows,
        });
    } catch (err) {
        console.error('[ADMIN][CATALOGO] Error:', err);
        res.status(500).json({ error: 'Error al obtener catálogos de administración.' });
    }
}

async function crearUsuario(req, res) {
    const { nombre_usuario, alias, password, confirm_password, empresa_id, rol_id } = req.body;

    if (!nombre_usuario || !alias || !password || !empresa_id || !rol_id) {
        return res.status(400).json({
            error: 'nombre_usuario, alias, password, empresa_id y rol_id son requeridos.',
        });
    }

    if (typeof confirm_password !== 'undefined' && password !== confirm_password) {
        return res.status(400).json({
            error: 'La confirmación de contraseña no coincide.',
        });
    }

    try {
        const validacion = await pool.query(
            `SELECT
                EXISTS(SELECT 1 FROM empresa WHERE id = $1) AS empresa_existe,
                EXISTS(SELECT 1 FROM roles WHERE id = $2) AS rol_existe`,
            [empresa_id, rol_id]
        );

        const { empresa_existe, rol_existe } = validacion.rows[0];

        if (!empresa_existe) {
            return res.status(400).json({ error: 'La empresa seleccionada no existe.' });
        }

        if (!rol_existe) {
            return res.status(400).json({ error: 'El rol seleccionado no existe.' });
        }

        const salt = await bcrypt.genSalt(12);
        const password_hash = await bcrypt.hash(password, salt);

        const result = await pool.query(
            `INSERT INTO usuarios (nombre_usuario, alias, password_hash, empresa_id, rol)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, nombre_usuario, alias, empresa_id, rol, created_at`,
            [String(nombre_usuario).trim(), String(alias).trim(), password_hash, empresa_id, rol_id]
        );

        res.status(201).json({ user: result.rows[0] });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'El nombre de usuario ya existe.' });
        }
        console.error('[ADMIN][CREATE_USER] Error:', err);
        res.status(500).json({ error: 'Error al crear usuario.' });
    }
}

module.exports = { dashboard, catalogo, crearUsuario };
