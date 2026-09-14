const pool = require('../config/database');
const { uploadFile, getObjectMetadata, getDownloadUrl } = require('../config/storage');

const DOCUMENT_TYPES = [
    'Opinión Positiva',
    'CSF',
    'Factura SEER',
    'Pedimento Pagado',
    'Pedimento Contraparte Pagado',
    'CFDI / Remisión',
    'Verificación de domicilio',
    'Proceso Productivo',
];

async function ensureDocumentCatalogTables() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS public.razon_social_documentos (
            id SERIAL PRIMARY KEY,
            id_razon INTEGER NOT NULL UNIQUE,
            nombre_razon_social VARCHAR(255) NOT NULL,
            created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS public.empresas_documentos (
            id SERIAL PRIMARY KEY,
            id_empresa INTEGER NOT NULL UNIQUE,
            nombre_empresa VARCHAR(255) NOT NULL,
            id_razon INTEGER NOT NULL,
            created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
        );
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_empresas_documentos_id_razon
        ON public.empresas_documentos (id_razon);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_razon_social_documentos_nombre
        ON public.razon_social_documentos (nombre_razon_social);
    `);
}

async function syncDocumentCatalogFromMainCatalog() {
    await ensureDocumentCatalogTables();

    await pool.query(`
        INSERT INTO public.razon_social_documentos (id_razon, nombre_razon_social)
        SELECT rs.id, rs.nombre
        FROM public.razon_social rs
        ON CONFLICT (id_razon) DO UPDATE
        SET nombre_razon_social = EXCLUDED.nombre_razon_social;
    `);

    await pool.query(`
        INSERT INTO public.empresas_documentos (id_empresa, nombre_empresa, id_razon)
        SELECT e.id, e.nombre, e.razon_social_id
        FROM public.empresa e
        ON CONFLICT (id_empresa) DO UPDATE
        SET nombre_empresa = EXCLUDED.nombre_empresa,
            id_razon = EXCLUDED.id_razon;
    `);
}

async function ensureRgceTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS public.documentos_rgce (
            id SERIAL PRIMARY KEY,
            razon_social_id INTEGER,
            empresa_id INTEGER,
            razon_social_carpeta VARCHAR(500) NOT NULL,
            empresa_carpeta VARCHAR(500) NOT NULL,
            tipo_archivo VARCHAR(120) NOT NULL,
            nombre_archivo VARCHAR(500) NOT NULL,
            nombre_almacenado VARCHAR(500) NOT NULL,
            storage_key VARCHAR(1000) NOT NULL,
            storage_url TEXT,
            estado VARCHAR(30) NOT NULL DEFAULT 'pendiente',
            porcentaje_completado INTEGER NOT NULL DEFAULT 0,
            observaciones TEXT,
            mes_evaluacion INTEGER NOT NULL,
            anio_evaluacion INTEGER NOT NULL,
            usuario_id INTEGER,
            created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
        );
    `);

    await pool.query(`
        ALTER TABLE public.documentos_rgce
        ADD COLUMN IF NOT EXISTS razon_social_id INTEGER,
        ADD COLUMN IF NOT EXISTS empresa_id INTEGER,
        ADD COLUMN IF NOT EXISTS razon_social_carpeta VARCHAR(500),
        ADD COLUMN IF NOT EXISTS empresa_carpeta VARCHAR(500),
        ADD COLUMN IF NOT EXISTS tipo_archivo VARCHAR(120),
        ADD COLUMN IF NOT EXISTS nombre_archivo VARCHAR(500),
        ADD COLUMN IF NOT EXISTS nombre_almacenado VARCHAR(500),
        ADD COLUMN IF NOT EXISTS storage_key VARCHAR(1000),
        ADD COLUMN IF NOT EXISTS storage_url TEXT,
        ADD COLUMN IF NOT EXISTS estado VARCHAR(30),
        ADD COLUMN IF NOT EXISTS porcentaje_completado INTEGER,
        ADD COLUMN IF NOT EXISTS observaciones TEXT,
        ADD COLUMN IF NOT EXISTS mes_evaluacion INTEGER,
        ADD COLUMN IF NOT EXISTS anio_evaluacion INTEGER,
        ADD COLUMN IF NOT EXISTS usuario_id INTEGER,
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITHOUT TIME ZONE,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE;
    `);

    await pool.query(`
        UPDATE public.documentos_rgce
        SET estado = 'entregado'
        WHERE estado IS NULL OR TRIM(estado) = '';
    `);

    await pool.query(`
        UPDATE public.documentos_rgce
        SET porcentaje_completado = 0
        WHERE porcentaje_completado IS NULL;
    `);

    await pool.query(`
        UPDATE public.documentos_rgce
        SET mes_evaluacion = EXTRACT(MONTH FROM NOW())::int
        WHERE mes_evaluacion IS NULL;
    `);

    await pool.query(`
        UPDATE public.documentos_rgce
        SET anio_evaluacion = EXTRACT(YEAR FROM NOW())::int
        WHERE anio_evaluacion IS NULL;
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_documentos_rgce_empresa
        ON public.documentos_rgce (empresa_id);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_documentos_rgce_razon_social
        ON public.documentos_rgce (razon_social_id);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_documentos_rgce_mes_anio
        ON public.documentos_rgce (anio_evaluacion, mes_evaluacion);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_documentos_rgce_estado
        ON public.documentos_rgce (estado);
    `);
}

function sanitizeStorageName(fileName) {
    return String(fileName || 'documento')
        .replace(/\\/g, '/')
        .split('/')
        .pop()
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .trim();
}

function normalizeStorageFolder(value, fallback = '') {
    const cleaned = String(value ?? '')
        .trim()
        .replace(/\\/g, '/')
        .replace(/\/+/g, '/');

    const finalValue = cleaned.replace(/^\/+|\/+$/g, '');
    return finalValue || fallback;
}

function buildRgceStorageKey({ razonSocial, empresa, anioEvaluacion, mesEvaluacion, nombreArchivo }) {
    const razonFolder = normalizeStorageFolder(razonSocial?.r2_folder || razonSocial?.nombre || 'razon_social');
    const empresaFolder = normalizeStorageFolder(empresa?.carpeta || empresa?.nombre || 'empresa');
    const nombreAlmacenado = sanitizeStorageName(nombreArchivo);

    const pathParts = [
        razonFolder,
        empresaFolder,
        'rgce',
        String(anioEvaluacion),
        String(mesEvaluacion).padStart(2, '0'),
        nombreAlmacenado,
    ].filter(Boolean);

    return pathParts.join('/').replace(/\/+/g, '/');
}

function normalizeDocumentType(value) {
    const raw = String(value || '').trim();
    if (!raw) return 'Documento';

    const map = {
        'opinion positiva': 'Opinión Positiva',
        'opinión positiva': 'Opinión Positiva',
        'csf': 'CSF',
        'factura seer': 'Factura SEER',
        'pedimento pagado': 'Pedimento Pagado',
        'pedimento contraparte pagado': 'Pedimento Contraparte Pagado',
        'cfdi': 'CFDI / Remisión',
        'cfdi / remision': 'CFDI / Remisión',
        'cfdi / remisión': 'CFDI / Remisión',
        'verificacion de domicilio': 'Verificación de domicilio',
        'verificación de domicilio': 'Verificación de domicilio',
        'proceso productivo': 'Proceso Productivo',
    };

    return map[raw.toLowerCase()] || raw;
}

async function getRazonSocialAndEmpresa(razonSocialId, empresaId) {
    const razonSocialResult = await pool.query(
        `SELECT id, nombre, r2_folder FROM public.razon_social WHERE id = $1`,
        [razonSocialId]
    );

    const empresaResult = await pool.query(
        `SELECT id, nombre, razon_social_id, carpeta FROM public.empresa WHERE id = $1`,
        [empresaId]
    );

    return {
        razonSocial: razonSocialResult.rows[0],
        empresa: empresaResult.rows[0],
    };
}

async function getDashboard(req, res) {
    try {
        await ensureRgceTable();

        const razonSocialId = req.query.razon_social_id ? Number(req.query.razon_social_id) : null;
        const empresaId = req.query.empresa_id ? Number(req.query.empresa_id) : null;
        const mes = req.query.mes_evaluacion ? Number(req.query.mes_evaluacion) : null;
        const anio = req.query.anio_evaluacion ? Number(req.query.anio_evaluacion) : null;

        const conditions = [];
        const values = [];

        if (razonSocialId) {
            values.push(razonSocialId);
            conditions.push(`d.razon_social_id = $${values.length}`);
        }

        if (empresaId) {
            values.push(empresaId);
            conditions.push(`d.empresa_id = $${values.length}`);
        }

        if (mes) {
            values.push(mes);
            conditions.push(`d.mes_evaluacion = $${values.length}`);
        }

        if (anio) {
            values.push(anio);
            conditions.push(`d.anio_evaluacion = $${values.length}`);
        }

        const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const resumenResult = await pool.query(`
            SELECT
                COUNT(*)::int AS total_documentos,
                COUNT(*) FILTER (WHERE estado = 'aprobado')::int AS aprobados,
                COUNT(*) FILTER (WHERE estado = 'entregado')::int AS entregados,
                COUNT(*) FILTER (WHERE estado = 'pendiente')::int AS pendientes,
                COUNT(*) FILTER (WHERE estado = 'en_revision')::int AS en_revision,
                COUNT(*) FILTER (WHERE estado = 'observado')::int AS observados,
                COUNT(*) FILTER (WHERE estado = 'atencion')::int AS atencion,
                COUNT(*) FILTER (WHERE estado = 'terminado')::int AS terminados,
                AVG(COALESCE(porcentaje_completado, 0))::numeric(10,2) AS porcentaje_promedio
            FROM public.documentos_rgce d
            ${whereClause}
        `, values);

        const documentosResult = await pool.query(`
            SELECT
                d.id,
                d.razon_social_id,
                d.empresa_id,
                d.razon_social_carpeta,
                d.empresa_carpeta,
                d.tipo_archivo,
                d.nombre_archivo,
                d.nombre_almacenado,
                d.storage_key,
                d.storage_url,
                d.estado,
                d.porcentaje_completado,
                d.observaciones,
                d.mes_evaluacion,
                d.anio_evaluacion,
                d.created_at,
                rs.nombre AS razon_social_nombre,
                e.nombre AS empresa_nombre
            FROM public.documentos_rgce d
            LEFT JOIN public.razon_social rs ON rs.id = d.razon_social_id
            LEFT JOIN public.empresa e ON e.id = d.empresa_id
            ${whereClause}
            ORDER BY d.anio_evaluacion DESC, d.mes_evaluacion DESC, d.created_at DESC
        `, values);

        const summary = resumenResult.rows[0] || {
            total_documentos: 0,
            aprobados: 0,
            entregados: 0,
            pendientes: 0,
            en_revision: 0,
            observados: 0,
            atencion: 0,
            terminados: 0,
            porcentaje_promedio: 0,
        };

        res.json({
            success: true,
            summary,
            documentos: documentosResult.rows,
            filtros: { razon_social_id: razonSocialId, empresa_id: empresaId, mes_evaluacion: mes, anio_evaluacion: anio },
        });
    } catch (error) {
        console.error('Error al consultar dashboard RGCE:', error);
        res.status(500).json({ success: false, message: 'Error al obtener el dashboard RGCE.' });
    }
}

async function getDocumentos(req, res) {
    try {
        await ensureRgceTable();
        const razonSocialId = req.query.razon_social_id ? Number(req.query.razon_social_id) : null;
        const empresaId = req.query.empresa_id ? Number(req.query.empresa_id) : null;
        const mes = req.query.mes_evaluacion ? Number(req.query.mes_evaluacion) : null;
        const anio = req.query.anio_evaluacion ? Number(req.query.anio_evaluacion) : null;

        const conditions = [];
        const values = [];

        if (razonSocialId) {
            values.push(razonSocialId);
            conditions.push(`d.razon_social_id = $${values.length}`);
        }

        if (empresaId) {
            values.push(empresaId);
            conditions.push(`d.empresa_id = $${values.length}`);
        }

        if (mes) {
            values.push(mes);
            conditions.push(`d.mes_evaluacion = $${values.length}`);
        }

        if (anio) {
            values.push(anio);
            conditions.push(`d.anio_evaluacion = $${values.length}`);
        }

        const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const result = await pool.query(`
            SELECT
                d.*,
                rs.nombre AS razon_social_nombre,
                e.nombre AS empresa_nombre
            FROM public.documentos_rgce d
            LEFT JOIN public.razon_social rs ON rs.id = d.razon_social_id
            LEFT JOIN public.empresa e ON e.id = d.empresa_id
            ${whereClause}
            ORDER BY d.anio_evaluacion DESC, d.mes_evaluacion DESC, d.created_at DESC
        `, values);

        res.json({ success: true, documentos: result.rows });
    } catch (error) {
        console.error('Error al listar documentos RGCE:', error);
        res.status(500).json({ success: false, message: 'Error al listar documentos RGCE.' });
    }
}

async function uploadDocuments(req, res) {
    try {
        await ensureRgceTable();
        await syncDocumentCatalogFromMainCatalog();

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, message: 'Debe seleccionar al menos un archivo.' });
        }

        const razonSocialId = Number(req.body.razon_social_id);
        const empresaId = Number(req.body.empresa_id);

        if (!razonSocialId || !empresaId) {
            return res.status(400).json({ success: false, message: 'Debe seleccionar razón social y empresa antes de subir archivos.' });
        }

        const metadataRaw = req.body.documentos || '[]';
        let metadata = [];

        try {
            metadata = JSON.parse(metadataRaw);
        } catch {
            return res.status(400).json({ success: false, message: 'La metadata de los archivos es inválida.' });
        }

        if (!Array.isArray(metadata) || metadata.length !== req.files.length) {
            return res.status(400).json({ success: false, message: 'La cantidad de archivos y tipos no coincide.' });
        }

        const { razonSocial, empresa } = await getRazonSocialAndEmpresa(razonSocialId, empresaId);

        if (!razonSocial || !empresa) {
            console.warn('[RGCE UPLOAD] Razón social o empresa inválidas.', {
                razonSocialId,
                empresaId,
                razonSocialFound: !!razonSocial,
                empresaFound: !!empresa,
            });
            return res.status(404).json({ success: false, message: `Razón social o empresa no válidas. razon_social_id=${razonSocialId}, empresa_id=${empresaId}` });
        }

        if (Number(empresa.razon_social_id) !== razonSocialId) {
            console.warn('[RGCE UPLOAD] La empresa no pertenece a la razón social seleccionada.', {
                razonSocialId,
                empresaId,
                empresaRazonSocialId: empresa.razon_social_id,
                empresaNombre: empresa.nombre,
            });
            return res.status(400).json({
                success: false,
                message: `La empresa seleccionada no pertenece a la razón social elegida. razon_social_id=${razonSocialId}, empresa_id=${empresaId}`,
            });
        }

        const savedDocuments = [];

        for (let index = 0; index < req.files.length; index += 1) {
            const file = req.files[index];
            const fileMeta = metadata[index] || {};
            const proposedName = String(fileMeta.nombre_archivo || file.originalname || 'Documento').trim();
            const nombreArchivo = proposedName || file.originalname || 'Documento';
            const tipoArchivo = normalizeDocumentType(fileMeta.tipo_archivo || file.originalname || 'Documento');
            const mesEvaluacion = Number(fileMeta.mes_evaluacion || req.body.mes_evaluacion || new Date().getMonth() + 1);
            const anioEvaluacion = Number(fileMeta.anio_evaluacion || req.body.anio_evaluacion || new Date().getFullYear());

            const existingDocument = await pool.query(`
                SELECT id
                FROM public.documentos_rgce
                WHERE razon_social_id = $1
                  AND empresa_id = $2
                  AND LOWER(TRIM(nombre_archivo)) = LOWER(TRIM($3))
                LIMIT 1;
            `, [razonSocialId, empresaId, nombreArchivo]);

            if (existingDocument.rows.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: `No se puede subir el archivo porque ya existe en la base de datos: ${nombreArchivo}`,
                });
            }

            const nombreAlmacenado = sanitizeStorageName(nombreArchivo);
            const storageKey = buildRgceStorageKey({
                razonSocial,
                empresa,
                anioEvaluacion,
                mesEvaluacion,
                nombreArchivo,
            });

            const uploadResult = await uploadFile(file.buffer, storageKey, file.mimetype || 'application/octet-stream', { context: 'rgce' });

            const insertResult = await pool.query(`
                INSERT INTO public.documentos_rgce (
                    razon_social_id,
                    empresa_id,
                    razon_social_carpeta,
                    empresa_carpeta,
                    tipo_archivo,
                    nombre_archivo,
                    nombre_almacenado,
                    storage_key,
                    storage_url,
                    estado,
                    porcentaje_completado,
                    observaciones,
                    mes_evaluacion,
                    anio_evaluacion,
                    usuario_id,
                    created_at,
                    updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
                RETURNING *;
            `, [
                razonSocialId,
                empresaId,
                razonSocial.r2_folder,
                empresa.carpeta,
                tipoArchivo,
                nombreArchivo,
                nombreAlmacenado,
                storageKey,
                uploadResult.storageUrl,
                'entregado',
                0,
                'Subido y entregado',
                mesEvaluacion,
                anioEvaluacion,
                req.user?.id,
            ]);

            savedDocuments.push(insertResult.rows[0]);
        }

        res.status(201).json({ success: true, message: `${savedDocuments.length} archivo(s) registrados.`, documentos: savedDocuments });
    } catch (error) {
        console.error('Error al subir documentos RGCE:', error);
        res.status(500).json({ success: false, message: 'Error al guardar los documentos RGCE.' });
    }
}

function determinePreviewType(contentType = '') {
    const normalized = String(contentType || '').toLowerCase();
    if (normalized.includes('pdf')) return 'pdf';
    if (normalized.startsWith('image/')) return 'image';
    if (normalized.includes('sheet') || normalized.includes('excel') || normalized.includes('csv')) return 'spreadsheet';
    if (normalized.includes('text/') || normalized.includes('json') || normalized.includes('xml')) return 'text';
    return 'unsupported';
}

async function getDocumentoPreview(req, res) {
    try {
        await ensureRgceTable();
        const documentoId = Number(req.params.id);
        const result = await pool.query(`
            SELECT d.*, rs.nombre AS razon_social_nombre, e.nombre AS empresa_nombre
            FROM public.documentos_rgce d
            LEFT JOIN public.razon_social rs ON rs.id = d.razon_social_id
            LEFT JOIN public.empresa e ON e.id = d.empresa_id
            WHERE d.id = $1
        `, [documentoId]);

        if (!result.rows.length) {
            return res.status(404).json({ success: false, message: 'Documento no encontrado.' });
        }

        const documento = result.rows[0];
        const storageKey = String(documento.storage_key || '').trim();
        if (!storageKey) {
            return res.status(400).json({ success: false, message: 'El documento no tiene clave de storage válida.' });
        }

        const metadata = await getObjectMetadata(storageKey, { context: 'rgce' });
        const previewType = determinePreviewType(metadata.contentType);
        const signedUrl = await getDownloadUrl({
            storageKey,
            storageUrl: documento.storage_url,
            filename: documento.nombre_archivo || 'archivo',
            context: 'rgce',
            contentDisposition: 'inline',
        });

        return res.json({
            success: true,
            previewType,
            storageUrl: signedUrl,
            downloadUrl: signedUrl,
            contentType: metadata.contentType,
            documento,
        });
    } catch (error) {
        console.error('Error al obtener preview de documento RGCE:', error);
        res.status(500).json({ success: false, message: 'No se pudo obtener la vista previa del documento.' });
    }
}

async function getDocumentoDownloadUrl(req, res) {
    try {
        await ensureRgceTable();
        const documentoId = Number(req.params.id);

        const result = await pool.query(`
            SELECT id, storage_key, storage_url, nombre_archivo, razon_social_id, empresa_id
            FROM public.documentos_rgce
            WHERE id = $1
        `, [documentoId]);

        if (!result.rows.length) {
            return res.status(404).json({ success: false, message: 'Documento no encontrado.' });
        }

        const documento = result.rows[0];
        const storageKey = String(documento.storage_key || '').trim();
        if (!storageKey) {
            return res.status(400).json({ success: false, message: 'El documento no tiene clave de storage válida.' });
        }

        const downloadUrl = await getDownloadUrl({
            storageKey,
            storageUrl: documento.storage_url,
            filename: documento.nombre_archivo || 'archivo',
            context: 'rgce',
        });

        return res.json({ success: true, download_url: downloadUrl });
    } catch (error) {
        console.error('Error al generar URL de descarga del documento RGCE:', error);
        res.status(500).json({ success: false, message: 'No se pudo generar la URL de descarga del documento.' });
    }
}

async function updateDocumento(req, res) {
    try {
        await ensureRgceTable();
        const documentoId = Number(req.params.id);
        const { estado, porcentaje_completado, observaciones, tipo_archivo } = req.body || {};

        const values = [];
        const updates = [];

        if (typeof tipo_archivo !== 'undefined') {
            updates.push(`tipo_archivo = $${values.length + 1}`);
            values.push(normalizeDocumentType(tipo_archivo));
        }

        if (typeof estado !== 'undefined') {
            const normalizedEstado = String(estado).trim().toLowerCase();
            const validStatus = ['entregado', 'pendiente', 'en_revision', 'observado', 'aprobado', 'cerrado', 'atencion', 'terminado'];
            updates.push(`estado = $${values.length + 1}`);
            values.push(validStatus.includes(normalizedEstado) ? normalizedEstado : 'entregado');
        }

        if (typeof porcentaje_completado !== 'undefined') {
            updates.push(`porcentaje_completado = $${values.length + 1}`);
            values.push(Number(porcentaje_completado) || 0);
        }

        if (typeof observaciones !== 'undefined') {
            updates.push(`observaciones = $${values.length + 1}`);
            values.push(String(observaciones || ''));
        }

        if (!updates.length) {
            return res.status(400).json({ success: false, message: 'No se envió ningún cambio válido.' });
        }

        updates.push(`updated_at = NOW()`);
        values.push(documentoId);

        const result = await pool.query(`
            UPDATE public.documentos_rgce
            SET ${updates.join(', ')}
            WHERE id = $${values.length}
            RETURNING *;
        `, values);

        if (!result.rows.length) {
            return res.status(404).json({ success: false, message: 'Documento no encontrado.' });
        }

        res.json({ success: true, documento: result.rows[0] });
    } catch (error) {
        console.error('Error al actualizar documento RGCE:', error);
        res.status(500).json({ success: false, message: 'Error al actualizar documento RGCE.' });
    }
}

async function getCatalogo(req, res) {
    try {
        await syncDocumentCatalogFromMainCatalog();

        const razonesResult = await pool.query(`
            SELECT id_razon AS id, nombre_razon_social AS nombre
            FROM public.razon_social_documentos
            ORDER BY nombre_razon_social ASC
        `);

        const empresasResult = await pool.query(`
            SELECT id_empresa AS id, nombre_empresa AS nombre, id_razon
            FROM public.empresas_documentos
            ORDER BY nombre_empresa ASC
        `);

        res.json({
            success: true,
            tipos: DOCUMENT_TYPES,
            estados: ['entregado', 'pendiente', 'en_revision', 'observado', 'aprobado'],
            razones_sociales: razonesResult.rows,
            empresas: empresasResult.rows,
        });
    } catch (error) {
        console.error('Error al obtener catálogo RGCE:', error);
        res.status(500).json({
            success: false,
            message: 'No se pudo cargar el catálogo de razones sociales y empresas.',
        });
    }
}

module.exports = {
    DOCUMENT_TYPES,
    ensureRgceTable,
    getDashboard,
    getDocumentos,
    uploadDocuments,
    updateDocumento,
    getCatalogo,
    getDocumentoPreview,
    getDocumentoDownloadUrl,
};
