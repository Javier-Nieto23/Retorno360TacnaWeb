const pool = require('../config/database');
const { uploadFile, deleteFile, getDownloadUrl } = require('../config/storage');

let deleteRequestsTableReady = false;
let deleteRequestsTableInitPromise = null;
let historialEmpresaColumnReady = false;
let historialEmpresaColumnInitPromise = null;
let numerosParteTableReady = false;
let numerosParteTableInitPromise = null;
let observacionesTableReady = false;
let observacionesTableInitPromise = null;
let observacionMensajesTableReady = false;
let observacionMensajesTableInitPromise = null;

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
                observacion_id INTEGER REFERENCES observaciones(id) ON DELETE SET NULL,
                solicitado_at TIMESTAMP DEFAULT NOW(),
                resuelto_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
                resuelto_at TIMESTAMP,
                comentario_admin TEXT,
                CONSTRAINT archivo_delete_requests_estado_chk CHECK (estado IN ('pendiente', 'en_proceso', 'aprobado', 'rechazado'))
            )`
        );

        await pool.query(
            `ALTER TABLE archivo_delete_requests
             ADD COLUMN IF NOT EXISTS observacion_id INTEGER REFERENCES observaciones(id) ON DELETE SET NULL`
        );

        await pool.query(
            `DO $$
             BEGIN
                 IF EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'archivo_delete_requests_estado_chk'
                 ) THEN
                    ALTER TABLE archivo_delete_requests DROP CONSTRAINT archivo_delete_requests_estado_chk;
                 END IF;

                 ALTER TABLE archivo_delete_requests
                 ADD CONSTRAINT archivo_delete_requests_estado_chk
                 CHECK (estado IN ('pendiente', 'en_proceso', 'aprobado', 'rechazado'));
             END
             $$;`
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

async function ensureObservacionesTable() {
    if (observacionesTableReady) return;
    if (observacionesTableInitPromise) {
        await observacionesTableInitPromise;
        return;
    }

    observacionesTableInitPromise = (async () => {
        await pool.query(
            `CREATE TABLE IF NOT EXISTS observaciones (
                id SERIAL PRIMARY KEY,
                descripcion VARCHAR(500) NOT NULL,
                iduser INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
                idarchivo INTEGER NOT NULL REFERENCES archivos_historial(id) ON DELETE CASCADE,
                estado VARCHAR(20) NOT NULL DEFAULT 'abierto',
                created_at TIMESTAMPTZ DEFAULT NOW()
            )`
        );

        await pool.query(
            `ALTER TABLE observaciones
             ADD COLUMN IF NOT EXISTS estado VARCHAR(20)`
        );

        await pool.query(
            `ALTER TABLE observaciones
             ADD COLUMN IF NOT EXISTS cliente_participante_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL`
        );

        await pool.query(
            `UPDATE observaciones
             SET estado = 'abierto'
             WHERE estado IS NULL OR TRIM(estado) = ''`
        );

        await pool.query(
            `ALTER TABLE observaciones
             ALTER COLUMN estado SET DEFAULT 'abierto'`
        );

        await pool.query(
            `ALTER TABLE observaciones
             ALTER COLUMN estado SET NOT NULL`
        );

        await pool.query(
            `DO $$
             BEGIN
                 IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'observaciones_estado_chk'
                 ) THEN
                    ALTER TABLE observaciones
                    ADD CONSTRAINT observaciones_estado_chk
                    CHECK (estado IN ('abierto', 'en_revision', 'cerrado'));
                 END IF;
             END
             $$;`
        );

        await pool.query(
            `ALTER TABLE observaciones
               ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ`
        );

        await pool.query(
            `ALTER TABLE observaciones
               ALTER COLUMN created_at TYPE TIMESTAMPTZ
               USING created_at::timestamptz`
        );

        await pool.query(
            `ALTER TABLE observaciones
             ALTER COLUMN created_at SET DEFAULT NOW()`
        );

        await pool.query(
            `UPDATE observaciones
             SET created_at = NOW()
             WHERE created_at IS NULL`
        );

        // Compatibilidad con tablas legacy: si id no tiene secuencia/default, lo repara.
        await pool.query(`CREATE SEQUENCE IF NOT EXISTS observaciones_id_seq`);

        await pool.query(
            `ALTER TABLE observaciones
             ALTER COLUMN id SET DEFAULT nextval('observaciones_id_seq')`
        );

        await pool.query(
            `ALTER SEQUENCE observaciones_id_seq OWNED BY observaciones.id`
        );

        await pool.query(
            `SELECT setval(
                'observaciones_id_seq',
                COALESCE((SELECT MAX(id) FROM observaciones), 0) + 1,
                false
            )`
        );

        await pool.query(
            `CREATE INDEX IF NOT EXISTS idx_observaciones_archivo
             ON observaciones (idarchivo)`
        );

        await pool.query(
            `CREATE INDEX IF NOT EXISTS idx_observaciones_created_at
             ON observaciones (created_at DESC)`
        );

        await pool.query(
            `CREATE INDEX IF NOT EXISTS idx_observaciones_estado
             ON observaciones (estado)`
        );

        observacionesTableReady = true;
    })();

    try {
        await observacionesTableInitPromise;
    } finally {
        observacionesTableInitPromise = null;
    }
}

async function ensureObservacionMensajesTable() {
    if (observacionMensajesTableReady) return;
    if (observacionMensajesTableInitPromise) {
        await observacionMensajesTableInitPromise;
        return;
    }

    observacionMensajesTableInitPromise = (async () => {
        await pool.query(
            `CREATE TABLE IF NOT EXISTS observacion_mensajes (
                id SERIAL PRIMARY KEY,
                observacion_id INTEGER NOT NULL REFERENCES observaciones(id) ON DELETE CASCADE,
                iduser INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
                mensaje VARCHAR(1000) NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )`
        );

        await pool.query(
            `CREATE INDEX IF NOT EXISTS idx_observacion_mensajes_observacion
             ON observacion_mensajes (observacion_id, created_at ASC)`
        );

        observacionMensajesTableReady = true;
    })();

    try {
        await observacionMensajesTableInitPromise;
    } finally {
        observacionMensajesTableInitPromise = null;
    }
}

async function ensureNumerosParteTable() {
    if (numerosParteTableReady) return;
    if (numerosParteTableInitPromise) {
        await numerosParteTableInitPromise;
        return;
    }

    numerosParteTableInitPromise = (async () => {
        await pool.query(
            `CREATE TABLE IF NOT EXISTS numeros_parte (
                id SERIAL PRIMARY KEY,
                numero_parte VARCHAR(120) NOT NULL,
                descripcion VARCHAR(500),
                descripcion_esp VARCHAR(500),
                descripcion_ing VARCHAR(500),
                unidad_medida VARCHAR(100),
                unit_horas NUMERIC(10,2),
                peso_cantidad NUMERIC(10,3),
                piezas INTEGER,
                pais_origen VARCHAR(120),
                similar VARCHAR(250),
                imagen_nombre VARCHAR(255),
                imagen_storage_key VARCHAR(1000),
                imagen_storage_url TEXT,
                usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
                razon_social_id INTEGER REFERENCES razon_social(id) ON DELETE SET NULL,
                empresa_id INTEGER REFERENCES empresa(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )`
        );

        await pool.query(
            `ALTER TABLE numeros_parte
             ADD COLUMN IF NOT EXISTS descripcion_esp VARCHAR(500)`
        );

        await pool.query(
            `ALTER TABLE numeros_parte
             ADD COLUMN IF NOT EXISTS descripcion_ing VARCHAR(500)`
        );

        await pool.query(
            `ALTER TABLE numeros_parte
             ADD COLUMN IF NOT EXISTS unidad_medida VARCHAR(100)`
        );

        await pool.query(
            `ALTER TABLE numeros_parte
             ADD COLUMN IF NOT EXISTS unit_horas NUMERIC(10,2)`
        );

        await pool.query(
            `ALTER TABLE numeros_parte
             ADD COLUMN IF NOT EXISTS peso_cantidad NUMERIC(10,3)`
        );

        await pool.query(
            `ALTER TABLE numeros_parte
             ADD COLUMN IF NOT EXISTS piezas INTEGER`
        );

        await pool.query(
            `ALTER TABLE numeros_parte
             ADD COLUMN IF NOT EXISTS pais_origen VARCHAR(120)`
        );

        await pool.query(
            `ALTER TABLE numeros_parte
             ADD COLUMN IF NOT EXISTS similar VARCHAR(250)`
        );

        await pool.query(
            `ALTER TABLE numeros_parte
             ADD COLUMN IF NOT EXISTS imagen_nombre VARCHAR(255)`
        );

        await pool.query(
            `ALTER TABLE numeros_parte
             ADD COLUMN IF NOT EXISTS imagen_storage_key VARCHAR(1000)`
        );

        await pool.query(
            `ALTER TABLE numeros_parte
             ADD COLUMN IF NOT EXISTS imagen_storage_url TEXT`
        );

        await pool.query(
            `CREATE INDEX IF NOT EXISTS idx_numeros_parte_created_at
             ON numeros_parte (created_at DESC)`
        );

        await pool.query(
            `CREATE INDEX IF NOT EXISTS idx_numeros_parte_empresa
             ON numeros_parte (empresa_id)`
        );

        await pool.query(
            `CREATE INDEX IF NOT EXISTS idx_numeros_parte_razon_social
             ON numeros_parte (razon_social_id)`
        );

        numerosParteTableReady = true;
    })();

    try {
        await numerosParteTableInitPromise;
    } finally {
        numerosParteTableInitPromise = null;
    }
}

function canAccessArchivoScope(req, razonSocialId, empresaId) {
    if (isAdminUser(req) || isInventariosUser(req)) {
        return true;
    }

    const userRazonSocialId = Number(req.user?.razon_social_id);
    const userEmpresaId = Number(req.user?.empresa_id);

    if (!userRazonSocialId || userRazonSocialId !== Number(razonSocialId)) {
        return false;
    }

    if (!userEmpresaId) {
        return false;
    }

    return userEmpresaId === Number(empresaId);
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

        const empresaIdFinal = Number(resolvedEmpresaId) || empresaIdNum;
        const razonSocialIdFinal = Number(resolvedRazonSocialId) || razonSocialIdNum;

        const archivoExistente = await pool.query(
            `SELECT id, nombre_archivo, uploaded_at
               FROM archivos_historial
              WHERE razon_social_id = $1
                AND empresa_id = $2
                AND anio = $3
                AND mes = $4
              LIMIT 1`,
            [razonSocialIdFinal, empresaIdFinal, anioNum, mesNum]
        );

        if (archivoExistente.rows.length > 0) {
            return res.status(409).json({
                error: 'Ya existe un archivo cargado para este mes en esta empresa. No se permiten más subidas en ese período.',
            });
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
                razonSocialIdFinal,
                req.user.id,
                empresaIdFinal,
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

// GET /api/files/numeros-parte
async function listarNumerosParte(req, res) {
    if (!isClientUser(req)) {
        return res.status(403).json({ error: 'Solo el rol cliente puede consultar los números de parte.' });
    }

    try {
        await ensureNumerosParteTable();

        const companyResult = await pool.query(
            `SELECT u.empresa_id,
                    e.razon_social_id,
                    e.nombre AS empresa_nombre,
                    rs.nombre AS razon_social_nombre
               FROM usuarios u
               JOIN empresa e ON e.id = u.empresa_id
               JOIN razon_social rs ON rs.id = e.razon_social_id
              WHERE u.id = $1`,
            [req.user.id]
        );

        if (companyResult.rows.length === 0) {
            return res.status(400).json({ error: 'El usuario no tiene una empresa válida asociada.' });
        }

        const company = companyResult.rows[0];
        const result = await pool.query(
            `SELECT np.id,
                    np.numero_parte,
                    COALESCE(np.descripcion_esp, np.descripcion) AS descripcion_esp,
                    np.descripcion_ing,
                    np.unidad_medida,
                    np.unit_horas,
                    np.peso_cantidad,
                    np.piezas,
                    np.pais_origen,
                    np.similar,
                    np.imagen_nombre,
                    np.imagen_storage_url,
                    np.created_at,
                    u.alias AS usuario_alias
               FROM numeros_parte np
               LEFT JOIN usuarios u ON u.id = np.usuario_id
              WHERE np.empresa_id = $1
                AND np.razon_social_id = $2
              ORDER BY np.created_at DESC
              LIMIT 20`,
            [company.empresa_id, company.razon_social_id]
        );

        return res.json({
            numeros_parte: result.rows,
            contexto: company,
        });
    } catch (err) {
        console.error('[FILES][NUMEROS_PARTE][LISTAR] Error:', err);
        return res.status(500).json({ error: 'Error al obtener los números de parte.' });
    }
}

// POST /api/files/numeros-parte
async function crearNumeroParte(req, res) {
    if (!isClientUser(req)) {
        return res.status(403).json({ error: 'Solo el rol cliente puede registrar números de parte.' });
    }

    const numeroParte = String(req.body?.numero_parte || '').trim();
    const descripcionEsp = String(req.body?.descripcion_esp || req.body?.descripcion || '').trim();
    const descripcionIng = String(req.body?.descripcion_ing || '').trim();
    const unidadMedida = String(req.body?.unidad_medida || '').trim();
    const paisOrigen = String(req.body?.pais_origen || '').trim();
    const similar = String(req.body?.similar || '').trim();
    const unitHorasRaw = String(req.body?.unit_horas || '').trim();
    const pesoCantidadRaw = String(req.body?.peso_cantidad || '').trim();
    const piezasRaw = String(req.body?.piezas || '').trim();

    const unitHoras = unitHorasRaw === '' ? null : Number(unitHorasRaw);
    const pesoCantidad = pesoCantidadRaw === '' ? null : Number(pesoCantidadRaw);
    const piezas = piezasRaw === '' ? null : Number.parseInt(piezasRaw, 10);

    if (!numeroParte) {
        return res.status(400).json({ error: 'El número de parte es requerido.' });
    }

    if (numeroParte.length > 120) {
        return res.status(400).json({ error: 'El número de parte no puede superar 120 caracteres.' });
    }

    if (descripcionEsp.length > 500) {
        return res.status(400).json({ error: 'La descripción en español no puede superar 500 caracteres.' });
    }

    if (descripcionIng.length > 500) {
        return res.status(400).json({ error: 'La descripción en inglés no puede superar 500 caracteres.' });
    }

    if (unidadMedida.length > 100) {
        return res.status(400).json({ error: 'La unidad de medida no puede superar 100 caracteres.' });
    }

    if (paisOrigen.length > 120) {
        return res.status(400).json({ error: 'El país de origen no puede superar 120 caracteres.' });
    }

    if (similar.length > 250) {
        return res.status(400).json({ error: 'El campo similar no puede superar 250 caracteres.' });
    }

    if (unitHorasRaw !== '' && !Number.isFinite(unitHoras)) {
        return res.status(400).json({ error: 'El valor de unit en horas debe ser numérico.' });
    }

    if (pesoCantidadRaw !== '' && !Number.isFinite(pesoCantidad)) {
        return res.status(400).json({ error: 'El valor de peso (cantidad) debe ser numérico.' });
    }

    if (piezasRaw !== '' && (!Number.isInteger(piezas) || piezas < 0)) {
        return res.status(400).json({ error: 'El valor de piezas debe ser un entero positivo.' });
    }

    try {
        await ensureNumerosParteTable();

        const companyResult = await pool.query(
            `SELECT u.empresa_id,
                    e.razon_social_id,
                    e.nombre AS empresa_nombre,
                    rs.nombre AS razon_social_nombre
               FROM usuarios u
               JOIN empresa e ON e.id = u.empresa_id
               JOIN razon_social rs ON rs.id = e.razon_social_id
              WHERE u.id = $1`,
            [req.user.id]
        );

        if (companyResult.rows.length === 0) {
            return res.status(400).json({ error: 'El usuario no tiene una empresa válida asociada.' });
        }

        const company = companyResult.rows[0];
        let imagenNombre = null;
        let imagenStorageKey = null;
        let imagenStorageUrl = null;

        if (req.file) {
            const ext = (req.file.originalname.match(/\.[^.]+$/) || [''])[0];
            const mesPadded = String(new Date().getMonth() + 1).padStart(2, '0');
            const timestamp = Date.now();
            const imagenBase = toStorageSegment(numeroParte) || 'numero_parte';
            const empresaFolder = toStorageSegment(company.empresa_nombre || 'empresa');
            const razonSocialFolder = toStorageSegment(company.razon_social_nombre || 'razon_social');
            imagenNombre = `${imagenBase}-${timestamp}${ext}`;
            imagenStorageKey = `${razonSocialFolder}/${empresaFolder}/numeros-parte/${mesPadded}/${imagenNombre}`;
            const uploadResult = await uploadFile(req.file.buffer, imagenStorageKey, req.file.mimetype);
            imagenStorageUrl = uploadResult.storageUrl;
        }

        const result = await pool.query(
            `INSERT INTO numeros_parte
                 (numero_parte, descripcion, descripcion_esp, descripcion_ing, unidad_medida, unit_horas, peso_cantidad, piezas, pais_origen, similar, imagen_nombre, imagen_storage_key, imagen_storage_url, usuario_id, razon_social_id, empresa_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
             RETURNING id, numero_parte, descripcion, descripcion_esp, descripcion_ing, unidad_medida, unit_horas, peso_cantidad, piezas, pais_origen, similar, imagen_nombre, imagen_storage_key, imagen_storage_url, created_at, razon_social_id, empresa_id` ,
            [
                numeroParte,
                descripcionEsp || null,
                descripcionEsp || null,
                descripcionIng || null,
                unidadMedida || null,
                unitHoras,
                pesoCantidad,
                piezas,
                paisOrigen || null,
                similar || null,
                imagenNombre,
                imagenStorageKey,
                imagenStorageUrl,
                req.user.id,
                company.razon_social_id,
                company.empresa_id,
            ]
        );

        return res.status(201).json({
            mensaje: 'Número de parte registrado correctamente.',
            numero_parte: result.rows[0],
        });
    } catch (err) {
        console.error('[FILES][NUMEROS_PARTE][CREAR] Error:', err);
        return res.status(500).json({ error: 'Error al registrar el número de parte.' });
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

// POST /api/files/:id/observaciones
async function crearObservacionArchivo(req, res) {
    if (!isAdminUser(req)) {
        return res.status(403).json({ error: 'Solo un administrador puede registrar observaciones.' });
    }

    const archivoId = Number(req.params?.id);
    if (Number.isNaN(archivoId)) {
        return res.status(400).json({ error: 'Archivo inválido.' });
    }

    const descripcion = String(req.body?.descripcion || '').trim();
    if (!descripcion) {
        return res.status(400).json({ error: 'La descripción de la observación es requerida.' });
    }

    if (descripcion.length > 500) {
        return res.status(400).json({ error: 'La descripción no puede exceder 500 caracteres.' });
    }

    try {
        await ensureObservacionesTable();

        const archivoResult = await pool.query(
            `SELECT ah.id, ah.nombre_archivo, ah.empresa_id, ah.razon_social_id
             FROM archivos_historial ah
             WHERE ah.id = $1`,
            [archivoId]
        );

        if (!archivoResult.rows.length) {
            return res.status(404).json({ error: 'Archivo no encontrado.' });
        }

        const insertResult = await pool.query(
            `INSERT INTO observaciones (descripcion, iduser, idarchivo, estado)
             VALUES ($1, $2, $3, 'abierto')
             RETURNING id, descripcion, iduser, idarchivo, estado, created_at`,
            [descripcion, req.user.id, archivoId]
        );

        const archivo = archivoResult.rows[0];

        return res.status(201).json({
            message: 'Observación registrada correctamente.',
            observacion: {
                ...insertResult.rows[0],
                archivo_nombre: archivo.nombre_archivo,
                empresa_id: archivo.empresa_id,
                razon_social_id: archivo.razon_social_id,
            },
        });
    } catch (err) {
        console.error('[FILES][OBSERVACIONES][CREATE] Error:', err);
        return res.status(500).json({ error: 'Error al registrar la observación.' });
    }
}

// GET /api/files/observaciones
async function listarObservaciones(req, res) {
    const razonSocialId = getAuthorizedRazonSocialId(req, res);
    if (typeof razonSocialId === 'undefined') return;

    const empresaId = getAuthorizedEmpresaId(req, res);
    if (typeof empresaId === 'undefined') return;

    const anio = req.query?.anio ? Number(req.query.anio) : null;
    const mes = req.query?.mes ? Number(req.query.mes) : null;
    const estado = String(req.query?.estado || 'todos').toLowerCase();

    const estadosValidos = ['abierto', 'en_revision', 'cerrado', 'todos'];
    if (!estadosValidos.includes(estado)) {
        return res.status(400).json({ error: 'estado inválido. Usa abierto, en_revision, cerrado o todos.' });
    }

    if (req.query?.anio && Number.isNaN(anio)) {
        return res.status(400).json({ error: 'anio inválido.' });
    }

    if (req.query?.mes && (Number.isNaN(mes) || mes < 1 || mes > 12)) {
        return res.status(400).json({ error: 'mes inválido.' });
    }

    try {
        await ensureObservacionesTable();
        await ensureObservacionMensajesTable();

        const params = [];
        let query = `
            SELECT o.id,
                   o.descripcion,
                     o.estado,
                   o.iduser AS reportado_por_id,
                   u.alias AS reportado_por_alias,
                   o.idarchivo AS archivo_id,
                   o.created_at,
                   ah.nombre_archivo,
                   ah.anio,
                   ah.mes,
                   ah.empresa_id,
                   e.nombre AS empresa_nombre,
                   ah.razon_social_id,
                   rs.nombre AS razon_social_nombre,
                   lm.created_at AS ultimo_mensaje_at,
                   lm.rol_nombre AS ultimo_mensaje_rol
            FROM observaciones o
            JOIN archivos_historial ah ON ah.id = o.idarchivo
            LEFT JOIN usuarios u ON u.id = o.iduser
            LEFT JOIN empresa e ON e.id = ah.empresa_id
            LEFT JOIN razon_social rs ON rs.id = ah.razon_social_id
            LEFT JOIN LATERAL (
                SELECT om.created_at, rr.nombrerol AS rol_nombre
                FROM observacion_mensajes om
                LEFT JOIN usuarios uu ON uu.id = om.iduser
                LEFT JOIN roles rr ON rr.id = uu.rol
                WHERE om.observacion_id = o.id
                ORDER BY om.created_at DESC, om.id DESC
                LIMIT 1
            ) lm ON TRUE
            WHERE 1 = 1
        `;

        if (razonSocialId) {
            params.push(razonSocialId);
            query += ` AND ah.razon_social_id = $${params.length}`;
        }

        if (empresaId) {
            params.push(empresaId);
            query += ` AND ah.empresa_id = $${params.length}`;
        }

        if (anio) {
            params.push(anio);
            query += ` AND ah.anio = $${params.length}`;
        }

        if (mes) {
            params.push(mes);
            query += ` AND ah.mes = $${params.length}`;
        }

        if (estado !== 'todos') {
            params.push(estado);
            query += ` AND o.estado = $${params.length}`;
        }

        query += ' ORDER BY o.created_at DESC, o.id DESC LIMIT 200';

        const result = await pool.query(query, params);
        return res.json({ observaciones: result.rows });
    } catch (err) {
        console.error('[FILES][OBSERVACIONES][LIST] Error:', err);
        return res.status(500).json({ error: 'Error al listar observaciones.' });
    }
}

// GET /api/files/observaciones/:id
async function obtenerDetalleObservacion(req, res) {
    const observacionId = Number(req.params?.id);
    if (Number.isNaN(observacionId)) {
        return res.status(400).json({ error: 'Observación inválida.' });
    }

    try {
        await ensureObservacionesTable();
        await ensureObservacionMensajesTable();

        const observacionResult = await pool.query(
            `SELECT o.id,
                    o.descripcion,
                    o.estado,
                    o.iduser AS reportado_por_id,
                    o.cliente_participante_id,
                    u.alias AS reportado_por_alias,
                    o.idarchivo AS archivo_id,
                    o.created_at,
                    ah.nombre_archivo,
                    ah.anio,
                    ah.mes,
                    ah.uploaded_at,
                    ah.storage_url,
                    ah.empresa_id,
                    e.nombre AS empresa_nombre,
                    ah.razon_social_id,
                    rs.nombre AS razon_social_nombre
             FROM observaciones o
             JOIN archivos_historial ah ON ah.id = o.idarchivo
             LEFT JOIN usuarios u ON u.id = o.iduser
             LEFT JOIN empresa e ON e.id = ah.empresa_id
             LEFT JOIN razon_social rs ON rs.id = ah.razon_social_id
             WHERE o.id = $1`,
            [observacionId]
        );

        if (!observacionResult.rows.length) {
            return res.status(404).json({ error: 'Observación no encontrada.' });
        }

        const observacion = observacionResult.rows[0];

        if (!canAccessArchivoScope(req, observacion.razon_social_id, observacion.empresa_id)) {
            return res.status(403).json({ error: 'No tiene acceso a esta observación.' });
        }

        const mensajesResult = await pool.query(
            `SELECT m.id,
                    m.observacion_id,
                    m.iduser,
                    um.alias AS usuario_alias,
                    r.nombrerol AS rol_nombre,
                    m.mensaje,
                    m.created_at
             FROM observacion_mensajes m
             LEFT JOIN usuarios um ON um.id = m.iduser
             LEFT JOIN roles r ON r.id = um.rol
             WHERE m.observacion_id = $1
             ORDER BY m.created_at ASC, m.id ASC`,
            [observacionId]
        );

        const currentUserId = Number(req.user?.id);
        const isAdminReporter = isAdminUser(req) && Number(observacion.reportado_por_id) === currentUserId;
        const isClientResponderCandidate = isClientUser(req)
            && (!observacion.cliente_participante_id || Number(observacion.cliente_participante_id) === currentUserId);
        const canRespond = String(observacion.estado || '').toLowerCase() !== 'cerrado'
            && (isAdminReporter || isClientResponderCandidate);
        const canClose = isAdminReporter;

        return res.json({
            observacion,
            mensajes: mensajesResult.rows,
            permisos: {
                can_respond: canRespond,
                can_close: canClose,
            },
        });
    } catch (err) {
        console.error('[FILES][OBSERVACIONES][DETAIL] Error:', err);
        return res.status(500).json({ error: 'Error al obtener detalle de observación.' });
    }
}

// POST /api/files/observaciones/:id/responder
async function responderObservacionCliente(req, res) {
    if (isAdminUser(req) || isInventariosUser(req)) {
        return res.status(403).json({ error: 'Solo el cliente puede responder esta observación.' });
    }

    const observacionId = Number(req.params?.id);
    if (Number.isNaN(observacionId)) {
        return res.status(400).json({ error: 'Observación inválida.' });
    }

    const mensaje = String(req.body?.mensaje || '').trim();
    if (!mensaje) {
        return res.status(400).json({ error: 'La respuesta del cliente es requerida.' });
    }

    if (mensaje.length > 1000) {
        return res.status(400).json({ error: 'La respuesta no puede exceder 1000 caracteres.' });
    }

    try {
        await ensureObservacionesTable();
        await ensureObservacionMensajesTable();

        const observacionResult = await pool.query(
            `SELECT o.id, o.estado, o.idarchivo, o.iduser AS reportado_por_id,
                    o.cliente_participante_id, ah.razon_social_id, ah.empresa_id
             FROM observaciones o
             JOIN archivos_historial ah ON ah.id = o.idarchivo
             WHERE o.id = $1`,
            [observacionId]
        );

        if (!observacionResult.rows.length) {
            return res.status(404).json({ error: 'Observación no encontrada.' });
        }

        const observacion = observacionResult.rows[0];
        if (!canAccessArchivoScope(req, observacion.razon_social_id, observacion.empresa_id)) {
            return res.status(403).json({ error: 'No tiene acceso a esta observación.' });
        }

        if (String(observacion.estado || '').toLowerCase() === 'cerrado') {
            return res.status(400).json({ error: 'La observación está cerrada y no admite nuevas respuestas.' });
        }

        const clienteParticipanteId = observacion.cliente_participante_id
            ? Number(observacion.cliente_participante_id)
            : null;

        if (clienteParticipanteId && clienteParticipanteId !== Number(req.user.id)) {
            return res.status(403).json({
                error: 'Solo el cliente participante de esta observación puede continuar la conversación. Puede verla en modo lectura.',
            });
        }

        if (!clienteParticipanteId) {
            const reserveResult = await pool.query(
                `UPDATE observaciones
                 SET cliente_participante_id = $2
                 WHERE id = $1
                   AND cliente_participante_id IS NULL
                 RETURNING cliente_participante_id`,
                [observacionId, req.user.id]
            );

            if (!reserveResult.rows.length) {
                const lockCheckResult = await pool.query(
                    `SELECT cliente_participante_id
                     FROM observaciones
                     WHERE id = $1`,
                    [observacionId]
                );
                const lockedClientId = Number(lockCheckResult.rows[0]?.cliente_participante_id || 0);
                if (lockedClientId && lockedClientId !== Number(req.user.id)) {
                    return res.status(403).json({
                        error: 'Solo el cliente participante de esta observación puede continuar la conversación. Puede verla en modo lectura.',
                    });
                }
            }
        }

        const insertMensajeResult = await pool.query(
            `INSERT INTO observacion_mensajes (observacion_id, iduser, mensaje)
             VALUES ($1, $2, $3)
             RETURNING id, observacion_id, iduser, mensaje, created_at`,
            [observacionId, req.user.id, mensaje]
        );

        await pool.query(
            `UPDATE observaciones
             SET estado = 'en_revision'
             WHERE id = $1`,
            [observacionId]
        );

        return res.status(201).json({
            message: 'Respuesta enviada. Estado de observación actualizado a en revisión.',
            mensaje: insertMensajeResult.rows[0],
            estado: 'en_revision',
        });
    } catch (err) {
        console.error('[FILES][OBSERVACIONES][RESPONDER] Error:', err);
        return res.status(500).json({ error: 'Error al responder la observación.' });
    }
}

// POST /api/files/observaciones/:id/responder-admin
async function responderObservacionAdmin(req, res) {
    if (!isAdminUser(req)) {
        return res.status(403).json({ error: 'Solo un administrador puede responder observaciones.' });
    }

    const observacionId = Number(req.params?.id);
    if (Number.isNaN(observacionId)) {
        return res.status(400).json({ error: 'Observación inválida.' });
    }

    const mensaje = String(req.body?.mensaje || '').trim();
    if (!mensaje) {
        return res.status(400).json({ error: 'La respuesta del administrador es requerida.' });
    }

    if (mensaje.length > 1000) {
        return res.status(400).json({ error: 'La respuesta no puede exceder 1000 caracteres.' });
    }

    try {
        await ensureObservacionesTable();
        await ensureObservacionMensajesTable();

        const observacionResult = await pool.query(
            `SELECT id, estado, iduser AS reportado_por_id
             FROM observaciones
             WHERE id = $1`,
            [observacionId]
        );

        if (!observacionResult.rows.length) {
            return res.status(404).json({ error: 'Observación no encontrada.' });
        }

        const observacion = observacionResult.rows[0];
        if (Number(observacion.reportado_por_id) !== Number(req.user.id)) {
            return res.status(403).json({
                error: 'Solo el administrador que reportó la observación puede continuar la conversación. Puede verla en modo lectura.',
            });
        }

        if (String(observacion.estado || '').toLowerCase() === 'cerrado') {
            return res.status(400).json({ error: 'No se puede responder una observación cerrada.' });
        }

        const insertMensajeResult = await pool.query(
            `INSERT INTO observacion_mensajes (observacion_id, iduser, mensaje)
             VALUES ($1, $2, $3)
             RETURNING id, observacion_id, iduser, mensaje, created_at`,
            [observacionId, req.user.id, mensaje]
        );

        await pool.query(
            `UPDATE observaciones
             SET estado = 'en_revision'
             WHERE id = $1`,
            [observacionId]
        );

        return res.status(201).json({
            message: 'Respuesta del administrador enviada.',
            mensaje: insertMensajeResult.rows[0],
            estado: 'en_revision',
        });
    } catch (err) {
        console.error('[FILES][OBSERVACIONES][RESPONDER_ADMIN] Error:', err);
        return res.status(500).json({ error: 'Error al responder la observación desde administración.' });
    }
}

// PATCH /api/files/observaciones/:id/cerrar
async function cerrarObservacionAdmin(req, res) {
    if (!isAdminUser(req)) {
        return res.status(403).json({ error: 'Solo un administrador puede cerrar observaciones.' });
    }

    const observacionId = Number(req.params?.id);
    if (Number.isNaN(observacionId)) {
        return res.status(400).json({ error: 'Observación inválida.' });
    }

    try {
        await ensureObservacionesTable();

        const closeResult = await pool.query(
            `UPDATE observaciones
             SET estado = 'cerrado'
             WHERE id = $1
               AND iduser = $2
             RETURNING id, estado`,
            [observacionId, req.user.id]
        );

        if (!closeResult.rows.length) {
            const existsResult = await pool.query('SELECT id FROM observaciones WHERE id = $1', [observacionId]);
            if (!existsResult.rows.length) {
                return res.status(404).json({ error: 'Observación no encontrada.' });
            }
            return res.status(403).json({
                error: 'Solo el administrador que reportó la observación puede cerrarla. Puede verla en modo lectura.',
            });
        }

        return res.json({
            message: 'Observación cerrada correctamente.',
            observacion: closeResult.rows[0],
        });
    } catch (err) {
        console.error('[FILES][OBSERVACIONES][CERRAR] Error:', err);
        return res.status(500).json({ error: 'Error al cerrar la observación.' });
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
        const estadosValidos = ['pendiente', 'en_proceso', 'aprobado', 'rechazado', 'todos'];
        if (!estadosValidos.includes(estado)) {
            return res.status(400).json({ error: 'Estado inválido. Usa pendiente, en_proceso, aprobado, rechazado o todos.' });
        }

        const params = [];
        let query = `
            SELECT d.id,
                   d.archivo_id,
                   d.estado,
                   d.motivo,
                   d.observacion_id,
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

// POST /api/files/delete-requests/:requestId/start-observation
async function iniciarObservacionDesdeSolicitud(req, res) {
    if (!isAdminUser(req)) {
        return res.status(403).json({ error: 'Solo un administrador puede iniciar observaciones desde solicitudes.' });
    }

    const requestId = Number(req.params?.requestId);
    if (Number.isNaN(requestId)) {
        return res.status(400).json({ error: 'Solicitud inválida.' });
    }

    try {
        await ensureDeleteRequestsTable();
        await ensureObservacionesTable();

        const solicitudResult = await pool.query(
            `SELECT d.id,
                    d.archivo_id,
                    d.estado,
                    d.motivo,
                    d.observacion_id,
                    ah.nombre_archivo,
                    ah.empresa_id,
                    ah.razon_social_id
             FROM archivo_delete_requests d
             JOIN archivos_historial ah ON ah.id = d.archivo_id
             WHERE d.id = $1`,
            [requestId]
        );

        if (!solicitudResult.rows.length) {
            return res.status(404).json({ error: 'Solicitud no encontrada.' });
        }

        const solicitud = solicitudResult.rows[0];
        if (!['pendiente', 'en_proceso'].includes(String(solicitud.estado || '').toLowerCase())) {
            return res.status(400).json({ error: 'Solo las solicitudes pendientes pueden pasar a observación.' });
        }

        if (solicitud.observacion_id) {
            return res.json({
                message: 'La solicitud ya se encuentra en caso de observación.',
                solicitud: {
                    id: solicitud.id,
                    estado: 'en_proceso',
                    observacion_id: solicitud.observacion_id,
                },
            });
        }

        const descripcion = String(req.body?.descripcion || '').trim()
            || `Caso de observación iniciado desde solicitud de eliminación: ${String(solicitud.motivo || '').trim() || 'Sin detalle adicional.'}`;

        const observacionInsertResult = await pool.query(
            `INSERT INTO observaciones (descripcion, iduser, idarchivo, estado)
             VALUES ($1, $2, $3, 'abierto')
             RETURNING id, descripcion, idarchivo, estado, created_at`,
            [descripcion, req.user.id, solicitud.archivo_id]
        );

        const observacion = observacionInsertResult.rows[0];

        const updateSolicitudResult = await pool.query(
            `UPDATE archivo_delete_requests
             SET estado = 'en_proceso',
                 observacion_id = $2,
                 comentario_admin = COALESCE(comentario_admin, 'Caso derivado a observación.'),
                 resuelto_por = $3,
                 resuelto_at = NOW()
             WHERE id = $1
             RETURNING id, archivo_id, estado, observacion_id, resuelto_at`,
            [requestId, observacion.id, req.user.id]
        );

        return res.status(201).json({
            message: 'La solicitud pasó a caso de observación y quedó en proceso.',
            solicitud: updateSolicitudResult.rows[0],
            observacion: {
                ...observacion,
                archivo_nombre: solicitud.nombre_archivo,
                empresa_id: solicitud.empresa_id,
                razon_social_id: solicitud.razon_social_id,
            },
        });
    } catch (err) {
        console.error('[FILES][DELETE_REQUESTS][START_OBSERVATION] Error:', err);
        return res.status(500).json({ error: 'Error al iniciar observación desde la solicitud.' });
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
    listarNumerosParte,
    crearNumeroParte,
    historial,
    resumenHistorial,
    dashboardSummary,
    crearObservacionArchivo,
    listarObservaciones,
    obtenerDetalleObservacion,
    responderObservacionCliente,
    responderObservacionAdmin,
    cerrarObservacionAdmin,
    getArchivoDownloadUrl,
    deleteArchivo,
    solicitarEliminacionArchivo,
    listarSolicitudesEliminacion,
    iniciarObservacionDesdeSolicitud,
    resolverSolicitudEliminacion,
    getAuthorizedRazonSocialId,
    getAuthorizedEmpresaId,
    ensureHistorialEmpresaColumn,
};
