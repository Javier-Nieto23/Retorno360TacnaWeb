const pool = require('../config/database');
const { uploadFile, deleteFile, getDownloadUrl } = require('../config/storage');

let deleteRequestsTableReady = false;
let deleteRequestsTableInitPromise = null;
let historialEmpresaColumnReady = false;
let historialEmpresaColumnInitPromise = null;

function isAdminUser(req) {
    return String(req.user?.rol_nombre || '').toLowerCase() === 'admin';
}

function isInventariosUser(req) {
    return String(req.user?.rol_nombre || '').toLowerCase() === 'inventarios';
}

function canAttendDeleteRequests(req) {
    return isAdminUser(req) || isInventariosUser(req);
}

function isClientUser(req) {
    const roleName = String(req.user?.rol_nombre || '').toLowerCase();
    return roleName === 'cliente' || roleName === 'clientes';
}

async function ensureDeleteRequestsTable() {
    if (deleteRequestsTableReady) return;
    if (deleteRequestsTableInitPromise) {
        await deleteRequestsTableInitPromise;
        return;
    }

    deleteRequestsTableInitPromise = (async () => {
        await pool.query(
            `CREATE TABLE IF NOT EXISTS archivo_delete_requests (
                id SERIAL PRIMARY KEY,
                archivo_id INTEGER NOT NULL REFERENCES archivos_historial(id) ON DELETE CASCADE,
                solicitado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
                estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
                motivo TEXT,
                solicitado_at TIMESTAMP DEFAULT NOW(),
                resuelto_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
                resuelto_at TIMESTAMP,
                comentario_admin TEXT,
                CONSTRAINT archivo_delete_requests_estado_chk CHECK (estado IN ('pendiente', 'aprobado', 'rechazado'))
            )`
        );

        await pool.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS idx_archivo_delete_requests_pending_unique
             ON archivo_delete_requests (archivo_id)
             WHERE estado = 'pendiente'`
        );

        await pool.query(
            `CREATE INDEX IF NOT EXISTS idx_archivo_delete_requests_estado_fecha
             ON archivo_delete_requests (estado, solicitado_at DESC)`
        );

        deleteRequestsTableReady = true;
    })();

    try {
        await deleteRequestsTableInitPromise;
    } finally {
        deleteRequestsTableInitPromise = null;
    }
}

async function ensureHistorialEmpresaColumn() {
    if (historialEmpresaColumnReady) return;
    if (historialEmpresaColumnInitPromise) {
        await historialEmpresaColumnInitPromise;
        return;
    }

    historialEmpresaColumnInitPromise = (async () => {
        await pool.query(
            `ALTER TABLE archivos_historial
             ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresa(id) ON DELETE SET NULL`
        );

        await pool.query(
            `CREATE INDEX IF NOT EXISTS idx_historial_empresa
             ON archivos_historial (empresa_id)`
        );

        // Backfill de archivos legacy: intenta mapear empresa por carpeta en storage_key.
        await pool.query(
            `UPDATE archivos_historial ah
             SET empresa_id = e.id
             FROM razon_social rs
             JOIN empresa e ON e.razon_social_id = rs.id
             WHERE ah.empresa_id IS NULL
               AND ah.razon_social_id = rs.id
               AND (
                    LOWER(ah.storage_key) LIKE LOWER(
                        (CASE WHEN rs.r2_folder LIKE '%/' THEN rs.r2_folder ELSE rs.r2_folder || '/' END)
                        || e.carpeta || '/%'
                    )
                    OR LOWER(ah.storage_key) LIKE LOWER(
                        (CASE WHEN rs.r2_folder LIKE '%/' THEN rs.r2_folder ELSE rs.r2_folder || '/' END)
                        || REPLACE(e.carpeta, ' ', '_') || '/%'
                    )
                    OR LOWER(ah.storage_key) LIKE LOWER(
                        (CASE WHEN rs.r2_folder LIKE '%/' THEN rs.r2_folder ELSE rs.r2_folder || '/' END)
                        || REPLACE(TRANSLATE(e.carpeta, 'ÁÉÍÓÚáéíóúÑñ', 'AEIOUaeiouNn'), ' ', '_') || '/%'
                    )
                    OR LOWER(ah.storage_key) LIKE LOWER(
                        (CASE WHEN rs.r2_folder LIKE '%/' THEN rs.r2_folder ELSE rs.r2_folder || '/' END)
                        || REPLACE(e.nombre, ' ', '_') || '/%'
                    )
                    OR LOWER(ah.storage_key) LIKE LOWER(
                        (CASE WHEN rs.r2_folder LIKE '%/' THEN rs.r2_folder ELSE rs.r2_folder || '/' END)
                        || REPLACE(TRANSLATE(e.nombre, 'ÁÉÍÓÚáéíóúÑñ', 'AEIOUaeiouNn'), ' ', '_') || '/%'
                    )
               )`
        );

        historialEmpresaColumnReady = true;
    })();

    try {
        await historialEmpresaColumnInitPromise;
    } finally {
        historialEmpresaColumnInitPromise = null;
    }
}

function toStorageSegment(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9-_ ]/g, '')
        .trim()
        .replace(/\s+/g, '_');
}

function normalizeR2Folder(folder) {
    const baseFolder = String(folder || '').trim();
    if (!baseFolder) return '';
    return baseFolder.endsWith('/') ? baseFolder : `${baseFolder}/`;
}

function buildEmpresaStoragePrefixes(r2Folder, empresaCarpeta, empresaNombre) {
    const normalizedR2Folder = normalizeR2Folder(r2Folder);
    if (!normalizedR2Folder) return [];

    const rawCarpeta = String(empresaCarpeta || '').trim();
    const rawNombre = String(empresaNombre || '').trim();

    const segments = [
        rawCarpeta,
        rawCarpeta.replace(/\s+/g, '_'),
        toStorageSegment(rawCarpeta),
        rawNombre,
        rawNombre.replace(/\s+/g, '_'),
        toStorageSegment(rawNombre),
    ].filter(Boolean);

    return [...new Set(segments)].map((segment) => `${normalizedR2Folder}${segment}/`);
}

async function getEmpresaFilterContext(empresaId, razonSocialId) {
    const result = await pool.query(
        `SELECT e.id, e.nombre, e.carpeta, rs.r2_folder
         FROM empresa e
         JOIN razon_social rs ON rs.id = e.razon_social_id
         WHERE e.id = $1 AND e.razon_social_id = $2`,
        [empresaId, razonSocialId]
    );

    return result.rows[0] || null;
}

function getAuthorizedRazonSocialId(req, res) {
    const userRazonSocialId = Number(req.user?.razon_social_id);

    if (isAdminUser(req) || isInventariosUser(req)) {
        const requestedRazonSocialId = req.query?.razon_social_id
            ? Number(req.query.razon_social_id)
            : null;

        if (req.query?.razon_social_id && Number.isNaN(requestedRazonSocialId)) {
            res.status(400).json({ error: 'razon_social_id inválido.' });
            return undefined;
        }

        return requestedRazonSocialId || null;
    }

    if (!userRazonSocialId) {
        res.status(403).json({ error: 'El usuario no tiene razón social asignada.' });
        return undefined;
    }

    const requestedRazonSocialId = req.query?.razon_social_id
        ? Number(req.query.razon_social_id)
        : null;

    if (req.query?.razon_social_id && Number.isNaN(requestedRazonSocialId)) {
        res.status(400).json({ error: 'razon_social_id inválido.' });
        return undefined;
    }

    if (requestedRazonSocialId && requestedRazonSocialId !== userRazonSocialId && !isAdminUser(req) && !isInventariosUser(req)) {
        res.status(403).json({ error: 'No tiene acceso a la razón social solicitada.' });
        return undefined;
    }

    if (!requestedRazonSocialId && (isAdminUser(req) || isInventariosUser(req))) {
        return null;
    }

    return requestedRazonSocialId || userRazonSocialId;
}

function getAuthorizedEmpresaId(req, res) {
    const requestedEmpresaId = req.query?.empresa_id
        ? Number(req.query.empresa_id)
        : null;

    if (req.query?.empresa_id && Number.isNaN(requestedEmpresaId)) {
        res.status(400).json({ error: 'empresa_id inválido.' });
        return undefined;
    }

    if (isAdminUser(req) || isInventariosUser(req)) {
        return requestedEmpresaId || null;
    }

    const userEmpresaId = Number(req.user?.empresa_id);
    if (!userEmpresaId) {
        res.status(403).json({ error: 'El usuario no tiene empresa asignada.' });
        return undefined;
    }

    if (requestedEmpresaId && requestedEmpresaId !== userEmpresaId) {
        res.status(403).json({ error: 'No tiene acceso a la empresa solicitada.' });
        return undefined;
    }

    return requestedEmpresaId || userEmpresaId;
}

// GET /api/files/razones-sociales-disponibles
async function razonesSocialesDisponibles(req, res) {
    if (!isAdminUser(req) && !isInventariosUser(req)) {
        return res.status(403).json({ error: 'Acceso denegado.' });
    }

    try {
        const result = await pool.query(
            `SELECT id, nombre, r2_folder
             FROM razon_social
             ORDER BY nombre`
        );

        return res.json({ razones_sociales: result.rows });
    } catch (err) {
        console.error('[FILES][RAZONES_SOCIALES_DISPONIBLES] Error:', err);
        return res.status(500).json({ error: 'Error al obtener razones sociales disponibles.' });
    }
}

// GET /api/files/empresas-disponibles
async function empresasDisponibles(req, res) {
    const userRazonSocialId = Number(req.user?.razon_social_id);
    const userEmpresaId = Number(req.user?.empresa_id);
    const isAdminOrInventarios = isAdminUser(req) || isInventariosUser(req);
    const hasRequestedRazonSocial = typeof req.query?.razon_social_id !== 'undefined' && req.query?.razon_social_id !== '';
    const requestedRazonSocialId = hasRequestedRazonSocial
        ? Number(req.query.razon_social_id)
        : null;

    if (hasRequestedRazonSocial && Number.isNaN(requestedRazonSocialId)) {
        return res.status(400).json({ error: 'razon_social_id inválido.' });
    }

    if (!userRazonSocialId && !isAdminOrInventarios) {
        return res.status(403).json({ error: 'El usuario no tiene razón social asignada.' });
    }

    if (requestedRazonSocialId && requestedRazonSocialId !== userRazonSocialId && !isAdminOrInventarios) {
        return res.status(403).json({ error: 'No tiene acceso a la razón social solicitada.' });
    }

    try {
        if (isClientUser(req) && userEmpresaId) {
            const result = await pool.query(
                `SELECT id, nombre, razon_social_id
                 FROM empresa
                 WHERE id = $1
                 ORDER BY nombre`,
                [userEmpresaId]
            );

            return res.json({ empresas: result.rows });
        }

        const result = requestedRazonSocialId || !isAdminOrInventarios
            ? await pool.query(
                `SELECT id, nombre, razon_social_id
                 FROM empresa
                 WHERE razon_social_id = $1
                 ORDER BY nombre`,
                [requestedRazonSocialId || userRazonSocialId]
            )
            : await pool.query(
                `SELECT id, nombre, razon_social_id
                 FROM empresa
                 ORDER BY razon_social_id, nombre`
            );

        return res.json({ empresas: result.rows });
    } catch (err) {
        console.error('[FILES][EMPRESAS_DISPONIBLES] Error:', err);
        return res.status(500).json({ error: 'Error al obtener empresas disponibles.' });
    }
}

// POST /api/files/upload
async function upload(req, res) {
    if (!req.file) {
        return res.status(400).json({ error: 'No se recibió ningún archivo.' });
    }


    const { anio, mes, empresa_id, razon_social_id } = req.body;
    if (!anio || !mes) {
        return res.status(400).json({ error: 'El año y mes son requeridos.' });
    }

    const empresaIdNum = empresa_id ? Number(empresa_id) : null;
    if (empresa_id && Number.isNaN(empresaIdNum)) {
        return res.status(400).json({ error: 'empresa_id inválido.' });
    }

    const razonSocialIdNum = razon_social_id ? Number(razon_social_id) : Number(req.user?.razon_social_id);
    if (razon_social_id && Number.isNaN(razonSocialIdNum)) {
        return res.status(400).json({ error: 'razon_social_id inválido.' });
    }

    if (isInventariosUser(req) && (!razonSocialIdNum || !empresaIdNum)) {
        return res.status(400).json({ error: 'Debe seleccionar una razón social y una empresa para subir el archivo.' });
    }

    const anioNum = parseInt(anio);
    const mesNum = parseInt(mes);
    if (isNaN(anioNum) || isNaN(mesNum) || mesNum < 1 || mesNum > 12) {
        return res.status(400).json({ error: 'Año o mes inválidos.' });
    }

    try {
        await ensureHistorialEmpresaColumn();
        await ensureDeleteRequestsTable();

        const empresaContextResult = empresaIdNum
            ? await pool.query(
                `SELECT rs.r2_folder,
                        rs.id AS razon_social_id,
                        rs.nombre AS razon_social_nombre,
                        e.id AS empresa_id,
                        e.nombre AS empresa_nombre,
                        e.carpeta AS empresa_carpeta
                 FROM empresa e
                 JOIN razon_social rs ON rs.id = e.razon_social_id
                 WHERE e.id = $1
                   AND e.razon_social_id = $2`,
                [empresaIdNum, razonSocialIdNum]
            )
            : await pool.query(
                `SELECT rs.r2_folder,
                        rs.id AS razon_social_id,
                        rs.nombre AS razon_social_nombre,
                        e.id AS empresa_id,
                        e.nombre AS empresa_nombre,
                        e.carpeta AS empresa_carpeta
                 FROM usuarios u
                 JOIN empresa e ON e.id = u.empresa_id
                 JOIN razon_social rs ON rs.id = e.razon_social_id
                 WHERE u.id = $1`,
                [req.user.id]
            );

        if (empresaContextResult.rows.length === 0) {
            if (empresaIdNum) {
                return res.status(400).json({ error: 'La empresa seleccionada no existe o no pertenece a su razón social.' });
            }
            return res.status(400).json({ error: 'El usuario no tiene una empresa válida asociada.' });
        }

        const {
            r2_folder,
            razon_social_id: resolvedRazonSocialId,
            empresa_id: resolvedEmpresaId,
            empresa_nombre,
            empresa_carpeta,
        } = empresaContextResult.rows[0];

        if (!r2_folder) {
            return res.status(400).json({ error: 'La razón social asociada no tiene carpeta R2 configurada.' });
        }

        // Construir la clave única del archivo
        const ext = (req.file.originalname.match(/\.[^.]+$/) || [''])[0];
        const mesPadded = String(mesNum).padStart(2, '0');
        const timestamp = Date.now();
        const nombreAlmacenado = `${anioNum}-${mesPadded}_${timestamp}${ext}`;
        const razonSocialFolder = r2_folder.endsWith('/') ? r2_folder : `${r2_folder}/`;
        const empresaFolder = (empresa_carpeta && String(empresa_carpeta).trim())
            ? toStorageSegment(empresa_carpeta)
            : toStorageSegment(empresa_nombre);
        const storageKey = `${razonSocialFolder}${empresaFolder}/${nombreAlmacenado}`;

        // Subir al storage
        const { storageUrl } = await uploadFile(req.file.buffer, storageKey, req.file.mimetype);

        // Guardar registro en base de datos
        const result = await pool.query(
            `INSERT INTO archivos_historial
                 (razon_social_id, usuario_id, empresa_id, nombre_archivo, nombre_almacenado, storage_key, storage_url, anio, mes, tamano)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
            [
                Number(resolvedRazonSocialId) || razonSocialIdNum,
                req.user.id,
                Number(resolvedEmpresaId) || empresaIdNum,
                req.file.originalname,
                nombreAlmacenado,
                storageKey,
                storageUrl,
                anioNum,
                mesNum,
                req.file.size,
            ]
        );

        res.status(201).json({ archivo: result.rows[0] });
    } catch (err) {
        if (err.code === '42703') {
            return res.status(500).json({ error: 'La base de datos no tiene la columna usuarios.empresa_id. Debes actualizar el esquema.' });
        }
        console.error('Error al subir archivo:', err);
        res.status(500).json({ error: 'Error al subir el archivo.' });
    }
}

// GET /api/files/historial?anio=&mes=
async function historial(req, res) {
    const { anio, mes } = req.query;
    const razonSocialId = getAuthorizedRazonSocialId(req, res);
    if (typeof razonSocialId === 'undefined') return;

    const empresaId = getAuthorizedEmpresaId(req, res);
    if (typeof empresaId === 'undefined') return;

    try {
        await ensureHistorialEmpresaColumn();

        let empresaContext = null;
        if (empresaId) {
            empresaContext = await getEmpresaFilterContext(empresaId, razonSocialId);
            if (!empresaContext) {
                return res.status(400).json({ error: 'La empresa seleccionada no existe o no pertenece a la razón social elegida.' });
            }
        }

        let query = `
            SELECT ah.*, u.alias AS usuario_alias, rs.r2_folder AS razon_social_folder,
                   ah.empresa_id,
                   e.nombre AS empresa_nombre,
                   dr.delete_request_status,
                   dr.delete_requested_at
      FROM archivos_historial ah
      LEFT JOIN usuarios u ON ah.usuario_id = u.id
            LEFT JOIN razon_social rs ON ah.razon_social_id = rs.id
            LEFT JOIN empresa e ON e.id = ah.empresa_id
            LEFT JOIN LATERAL (
                SELECT
                    adr.estado AS delete_request_status,
                    adr.solicitado_at AS delete_requested_at
                FROM archivo_delete_requests adr
                WHERE adr.archivo_id = ah.id
                ORDER BY adr.solicitado_at DESC, adr.id DESC
                LIMIT 1
            ) dr ON TRUE
            WHERE 1 = 1
    `;

        const params = [];

        if (razonSocialId) {
            params.push(razonSocialId);
            query += ` AND ah.razon_social_id = $${params.length}`;
        }

        if (anio) {
            params.push(parseInt(anio));
            query += ` AND ah.anio = $${params.length}`;
        }
        if (mes) {
            params.push(parseInt(mes));
            query += ` AND ah.mes = $${params.length}`;
        }
        if (empresaId) {
            const prefixes = buildEmpresaStoragePrefixes(
                empresaContext.r2_folder,
                empresaContext.carpeta,
                empresaContext.nombre
            );
            const empresaParamIndex = params.push(empresaId);
            const prefixClauses = prefixes.map((prefix) => {
                const prefixParamIndex = params.push(`${prefix}%`);
                return `LOWER(ah.storage_key) LIKE LOWER($${prefixParamIndex})`;
            });

            query += ` AND (ah.empresa_id = $${empresaParamIndex}${prefixClauses.length ? ` OR ${prefixClauses.join(' OR ')}` : ''})`;
        }

        query += ' ORDER BY ah.uploaded_at DESC';

        const result = await pool.query(query, params);
        res.json({ archivos: result.rows });
    } catch (err) {
        console.error('Error al obtener historial:', err);
        res.status(500).json({ error: 'Error al obtener el historial.' });
    }
}

// GET /api/files/historial/resumen  — años y meses disponibles
async function resumenHistorial(req, res) {
    const razonSocialId = getAuthorizedRazonSocialId(req, res);
    if (typeof razonSocialId === 'undefined') return;

    const empresaId = getAuthorizedEmpresaId(req, res);
    if (typeof empresaId === 'undefined') return;

    try {
        await ensureHistorialEmpresaColumn();

        let empresaContext = null;
        if (empresaId) {
            empresaContext = await getEmpresaFilterContext(empresaId, razonSocialId);
            if (!empresaContext) {
                return res.status(400).json({ error: 'La empresa seleccionada no existe o no pertenece a la razón social elegida.' });
            }
        }

        let query = `
            SELECT anio, mes, COUNT(*) AS total_archivos
            FROM archivos_historial ah
            WHERE 1 = 1`;
        const params = [];

        if (razonSocialId) {
            params.push(razonSocialId);
            query += ` AND ah.razon_social_id = $${params.length}`;
        }

        if (empresaId) {
            const prefixes = buildEmpresaStoragePrefixes(
                empresaContext.r2_folder,
                empresaContext.carpeta,
                empresaContext.nombre
            );
            const empresaParamIndex = params.push(empresaId);
            const prefixClauses = prefixes.map((prefix) => {
                const prefixParamIndex = params.push(`${prefix}%`);
                return `LOWER(ah.storage_key) LIKE LOWER($${prefixParamIndex})`;
            });

            query += ` AND (ah.empresa_id = $${empresaParamIndex}${prefixClauses.length ? ` OR ${prefixClauses.join(' OR ')}` : ''})`;
        }

        query += `
            GROUP BY anio, mes
            ORDER BY anio DESC, mes DESC`;

        const result = await pool.query(
            query,
            params
        );
        res.json({ resumen: result.rows });
    } catch (err) {
        console.error('Error al obtener resumen:', err);
        res.status(500).json({ error: 'Error al obtener el resumen.' });
    }
}

// GET /api/files/dashboard-summary
async function dashboardSummary(req, res) {
    const razonSocialId = getAuthorizedRazonSocialId(req, res);
    if (typeof razonSocialId === 'undefined') return;

    const empresaId = getAuthorizedEmpresaId(req, res);
    if (typeof empresaId === 'undefined') return;

    try {
        await ensureHistorialEmpresaColumn();

        const conditions = [];
        const values = [];

        if (razonSocialId) {
            values.push(razonSocialId);
            conditions.push(`ah.razon_social_id = $${values.length}`);
        }

        if (empresaId) {
            values.push(empresaId);
            conditions.push(`ah.empresa_id = $${values.length}`);
        }

        const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

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
                 ${whereClause ? `AND ${conditions.join(' AND ')}` : ''}
                 GROUP BY ar.anio, gs.mes
                 ORDER BY gs.mes`,
                values
            ),
        ]);

        return res.json({
            totales: totalesResult.rows[0] || {
                total_archivos: 0,
                total_razones_sociales: 0,
                total_empresas: 0,
                total_usuarios_con_subidas: 0,
            },
            por_empresa: agrupadoResult.rows || [],
            por_mes: mensualResult.rows || [],
            anio_reporte: mensualResult.rows[0]?.anio || new Date().getFullYear(),
        });
    } catch (err) {
        console.error('[FILES][DASHBOARD_SUMMARY] Error:', err);
        return res.status(500).json({ error: 'Error al obtener el resumen del dashboard.' });
    }
}

// POST /api/files/:id/delete-request
async function solicitarEliminacionArchivo(req, res) {
    const { id } = req.params;

    if (isAdminUser(req) || isInventariosUser(req)) {
        return res.status(400).json({ error: 'Este rol puede atender solicitudes, no crearlas.' });
    }

    const archivoId = Number(id);
    if (Number.isNaN(archivoId)) {
        return res.status(400).json({ error: 'Archivo inválido.' });
    }

    const razonSocialId = getAuthorizedRazonSocialId(req, res);
    if (!razonSocialId) return;

    const motivo = req.body?.motivo ? String(req.body.motivo).trim() : '';
    if (!motivo) {
        return res.status(400).json({ error: 'El motivo de la solicitud es requerido.' });
    }

    try {
        await ensureDeleteRequestsTable();

        const archivoResult = await pool.query(
            'SELECT id FROM archivos_historial WHERE id = $1 AND razon_social_id = $2',
            [archivoId, razonSocialId]
        );

        if (archivoResult.rows.length === 0) {
            return res.status(404).json({ error: 'Archivo no encontrado.' });
        }

        const solicitudResult = await pool.query(
            `INSERT INTO archivo_delete_requests (archivo_id, solicitado_por, estado, motivo)
             VALUES ($1, $2, 'pendiente', $3)
             ON CONFLICT (archivo_id)
             WHERE estado = 'pendiente'
             DO NOTHING
             RETURNING id, archivo_id, estado, motivo, solicitado_at`,
            [archivoId, req.user.id, motivo]
        );

        if (solicitudResult.rows.length === 0) {
            return res.status(409).json({ error: 'Este archivo ya tiene una solicitud de eliminación pendiente.' });
        }

        return res.status(201).json({
            message: 'Solicitud enviada. Un usuario de atención debe aprobar o rechazar la eliminación.',
            solicitud: solicitudResult.rows[0],
        });
    } catch (err) {
        console.error('[FILES][DELETE_REQUEST] Error:', err);
        return res.status(500).json({ error: 'Error al registrar solicitud de eliminación.' });
    }
}

// GET /api/files/delete-requests?estado=pendiente
async function listarSolicitudesEliminacion(req, res) {
    if (!canAttendDeleteRequests(req)) {
        return res.status(403).json({ error: 'Acceso denegado. Se requiere rol admin o inventarios.' });
    }

    try {
        await ensureDeleteRequestsTable();

        const isAdmin = isAdminUser(req);
        const razonSocialId = isAdmin ? null : getAuthorizedRazonSocialId(req, res);
        if (!isAdmin && typeof razonSocialId === 'undefined') return;

        const empresaId = req.query?.empresa_id ? Number(req.query.empresa_id) : null;
        if (req.query?.empresa_id && Number.isNaN(empresaId)) {
            return res.status(400).json({ error: 'empresa_id inválido.' });
        }

        let empresaContext = null;
        if (empresaId && razonSocialId) {
            await ensureHistorialEmpresaColumn();
            empresaContext = await getEmpresaFilterContext(empresaId, razonSocialId);
            if (!empresaContext) {
                return res.status(400).json({ error: 'La empresa seleccionada no existe o no pertenece a la razón social elegida.' });
            }
        }

        const estado = String(req.query?.estado || 'pendiente').toLowerCase();
        const estadosValidos = ['pendiente', 'aprobado', 'rechazado', 'todos'];
        if (!estadosValidos.includes(estado)) {
            return res.status(400).json({ error: 'Estado inválido. Usa pendiente, aprobado, rechazado o todos.' });
        }

        const params = [];
        let query = `
            SELECT d.id,
                   d.archivo_id,
                   d.estado,
                   d.motivo,
                   d.solicitado_at,
                   d.resuelto_at,
                   d.comentario_admin,
                   ah.nombre_archivo,
                   ah.anio,
                   ah.mes,
                   ah.razon_social_id,
                   rs.nombre AS razon_social_nombre,
                     ah.empresa_id,
                     e.nombre AS empresa_nombre,
                   us.alias AS solicitado_por_alias,
                   ur.alias AS resuelto_por_alias
            FROM archivo_delete_requests d
            LEFT JOIN archivos_historial ah ON ah.id = d.archivo_id
            LEFT JOIN usuarios us ON us.id = d.solicitado_por
            LEFT JOIN usuarios ur ON ur.id = d.resuelto_por
                 LEFT JOIN empresa e ON e.id = ah.empresa_id
            LEFT JOIN razon_social rs ON rs.id = ah.razon_social_id
            WHERE 1 = 1
        `;

        if (!isAdmin && razonSocialId) {
            params.push(razonSocialId);
            query += ` AND ah.razon_social_id = $${params.length}`;
        }

        if (empresaId) {
            const prefixes = buildEmpresaStoragePrefixes(
                empresaContext.r2_folder,
                empresaContext.carpeta,
                empresaContext.nombre
            );
            const empresaParamIndex = params.push(empresaId);
            const prefixClauses = prefixes.map((prefix) => {
                const prefixParamIndex = params.push(`${prefix}%`);
                return `LOWER(ah.storage_key) LIKE LOWER($${prefixParamIndex})`;
            });

            query += ` AND (ah.empresa_id = $${empresaParamIndex}${prefixClauses.length ? ` OR ${prefixClauses.join(' OR ')}` : ''})`;
        }

        if (estado !== 'todos') {
            params.push(estado);
            query += ` AND d.estado = $${params.length}`;
        }

        query += ' ORDER BY d.solicitado_at DESC LIMIT 200';

        const result = await pool.query(query, params);
        return res.json({ solicitudes: result.rows });
    } catch (err) {
        console.error('[FILES][DELETE_REQUESTS][LIST] Error:', err);
        return res.status(500).json({ error: 'Error al listar solicitudes de eliminación.' });
    }
}

// PATCH /api/files/delete-requests/:requestId
async function resolverSolicitudEliminacion(req, res) {
    if (!canAttendDeleteRequests(req)) {
        return res.status(403).json({ error: 'Acceso denegado. Se requiere rol admin o inventarios.' });
    }

    const { requestId } = req.params;
    const decision = String(req.body?.decision || '').toLowerCase();
    const comentarioAdmin = req.body?.comentario_admin ? String(req.body.comentario_admin).trim() : null;

    if (!['aprobar', 'rechazar'].includes(decision)) {
        return res.status(400).json({ error: 'Decision inválida. Usa aprobar o rechazar.' });
    }

    try {
        await ensureDeleteRequestsTable();

        const solicitudResult = await pool.query(
            `SELECT d.*, ah.storage_key, ah.razon_social_id
             FROM archivo_delete_requests d
             LEFT JOIN archivos_historial ah ON ah.id = d.archivo_id
             WHERE d.id = $1`,
            [requestId]
        );

        if (solicitudResult.rows.length === 0) {
            return res.status(404).json({ error: 'Solicitud no encontrada.' });
        }

        const solicitud = solicitudResult.rows[0];
        const isAdmin = isAdminUser(req);
        const userRazonSocialId = Number(req.user?.razon_social_id);

        if (!isAdmin && Number(solicitud.razon_social_id) !== userRazonSocialId) {
            return res.status(403).json({ error: 'No tiene acceso a esta solicitud.' });
        }

        if (solicitud.estado !== 'pendiente') {
            return res.status(400).json({ error: 'La solicitud ya fue procesada.' });
        }

        if (decision === 'rechazar') {
            const rechazoResult = await pool.query(
                `UPDATE archivo_delete_requests
                 SET estado = 'rechazado',
                     resuelto_por = $2,
                     resuelto_at = NOW(),
                     comentario_admin = $3
                 WHERE id = $1
                 RETURNING id, archivo_id, estado, resuelto_at, comentario_admin`,
                [requestId, req.user.id, comentarioAdmin]
            );

            return res.json({
                message: 'Solicitud rechazada.',
                solicitud: rechazoResult.rows[0],
            });
        }

        if (!solicitud.storage_key) {
            return res.status(400).json({ error: 'No se puede eliminar: storage_key inválido.' });
        }

        await deleteFile(solicitud.storage_key);
        await pool.query('DELETE FROM archivos_historial WHERE id = $1', [solicitud.archivo_id]);

        const aprobacionResult = await pool.query(
            `UPDATE archivo_delete_requests
             SET estado = 'aprobado',
                 resuelto_por = $2,
                 resuelto_at = NOW(),
                 comentario_admin = $3
             WHERE id = $1
             RETURNING id, archivo_id, estado, resuelto_at, comentario_admin`,
            [requestId, req.user.id, comentarioAdmin]
        );

        return res.json({
            message: 'Solicitud aprobada y archivo eliminado.',
            solicitud: aprobacionResult.rows[0],
        });
    } catch (err) {
        console.error('[FILES][DELETE_REQUESTS][RESOLVE] Error:', err);
        if (err.code === 'INVALID_STORAGE_KEY') {
            return res.status(400).json({ error: 'La eliminación solo acepta archivos válidos.' });
        }
        return res.status(500).json({ error: 'Error al resolver la solicitud de eliminación.' });
    }
}

// DELETE /api/files/:id
async function deleteArchivo(req, res) {
    if (!canAttendDeleteRequests(req)) {
        return res.status(403).json({ error: 'Solo un usuario de atención puede eliminar archivos directamente.' });
    }

    const { id } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM archivos_historial WHERE id = $1',
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Archivo no encontrado.' });
        }

        const archivo = result.rows[0];
        await deleteFile(archivo.storage_key);
        await pool.query('DELETE FROM archivos_historial WHERE id = $1', [id]);

        res.json({ message: 'Archivo eliminado correctamente.' });
    } catch (err) {
        console.error('Error al eliminar archivo:', err);
        res.status(500).json({ error: 'Error al eliminar el archivo.' });
    }
}

// GET /api/files/:id/download-url
async function getArchivoDownloadUrl(req, res) {
    const { id } = req.params;

    try {
        const result = await pool.query(
            `SELECT ah.id, ah.storage_key, ah.storage_url, ah.razon_social_id, ah.nombre_archivo
             FROM archivos_historial ah
             WHERE ah.id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Archivo no encontrado.' });
        }

        const archivo = result.rows[0];
        const isPrivileged = isAdminUser(req) || isInventariosUser(req);

        if (!isPrivileged && Number(archivo.razon_social_id) !== Number(req.user?.razon_social_id)) {
            return res.status(403).json({ error: 'No tiene acceso a este archivo.' });
        }

        const downloadUrl = await getDownloadUrl({
            storageKey: archivo.storage_key,
            storageUrl: archivo.storage_url,
            filename: archivo.nombre_archivo,
        });

        if (!downloadUrl) {
            return res.status(404).json({ error: 'No se pudo generar la URL de descarga.' });
        }

        return res.json({ download_url: downloadUrl });
    } catch (err) {
        console.error('[FILES][DOWNLOAD_URL] Error:', err);
        if (err.code === 'INVALID_STORAGE_KEY') {
            return res.status(400).json({ error: 'El archivo no tiene una ruta de almacenamiento válida.' });
        }
        return res.status(500).json({ error: 'Error al obtener la URL de descarga.' });
    }
}

module.exports = {
    razonesSocialesDisponibles,
    empresasDisponibles,
    upload,
    historial,
    resumenHistorial,
    dashboardSummary,
    getArchivoDownloadUrl,
    deleteArchivo,
    solicitarEliminacionArchivo,
    listarSolicitudesEliminacion,
    resolverSolicitudEliminacion,
};
