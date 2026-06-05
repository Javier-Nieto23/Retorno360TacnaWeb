const pool = require('../config/database');
const { uploadFile, deleteFile } = require('../config/storage');

function getAuthorizedRazonSocialId(req, res) {
    const userRazonSocialId = Number(req.user?.razon_social_id);
    if (!userRazonSocialId) {
        res.status(403).json({ error: 'El usuario no tiene razón social asignada.' });
        return null;
    }

    const requestedRazonSocialId = req.query?.razon_social_id
        ? Number(req.query.razon_social_id)
        : null;

    if (requestedRazonSocialId && requestedRazonSocialId !== userRazonSocialId) {
        res.status(403).json({ error: 'No tiene acceso a la razón social solicitada.' });
        return null;
    }

    return userRazonSocialId;
}

// POST /api/files/upload
async function upload(req, res) {
    if (!req.file) {
        return res.status(400).json({ error: 'No se recibió ningún archivo.' });
    }


    const { anio, mes, empresa_id } = req.body;
    if (!anio || !mes || !empresa_id) {
        return res.status(400).json({ error: 'El año, mes y empresa son requeridos.' });
    }

    const anioNum = parseInt(anio);
    const mesNum = parseInt(mes);
    const empresaIdNum = parseInt(empresa_id);
    if (isNaN(anioNum) || isNaN(mesNum) || mesNum < 1 || mesNum > 12 || isNaN(empresaIdNum)) {
        return res.status(400).json({ error: 'Año, mes o empresa inválidos.' });
    }

    try {
        // Obtener carpeta base de la razón social y carpeta de la empresa
        const empresaResult = await pool.query(
            `SELECT e.carpeta, rs.r2_folder FROM empresa e
             JOIN razon_social rs ON e.razon_social_id = rs.id
             WHERE e.id = $1 AND rs.id = $2`,
            [empresaIdNum, req.user.razon_social_id]
        );
        if (empresaResult.rows.length === 0) {
            return res.status(400).json({ error: 'Empresa no encontrada o no pertenece a la razón social.' });
        }
        const { carpeta: empresaCarpeta, r2_folder } = empresaResult.rows[0];

        // Construir la clave única del archivo
        const timestamp = Date.now();
        const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        const nombreAlmacenado = `${timestamp}_${safeName}`;
        // Estructura: razon_social/empresa/anio/mes/archivo
        const storageKey = `${r2_folder}${empresaCarpeta}/${anioNum}/${String(mesNum).padStart(2, '0')}/${nombreAlmacenado}`;

        // Subir al storage
        const { storageUrl } = await uploadFile(req.file.buffer, storageKey, req.file.mimetype);

        // Guardar registro en base de datos
        const result = await pool.query(
            `INSERT INTO archivos_historial
         (razon_social_id, usuario_id, nombre_archivo, nombre_almacenado, storage_key, storage_url, anio, mes, tamano)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
            [
                req.user.razon_social_id,
                req.user.id,
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
        console.error('Error al subir archivo:', err);
        res.status(500).json({ error: 'Error al subir el archivo.' });
    }
}

// GET /api/files/historial?anio=&mes=
async function historial(req, res) {
    const { anio, mes } = req.query;
    const razonSocialId = getAuthorizedRazonSocialId(req, res);
    if (!razonSocialId) return;

    try {
        let query = `
            SELECT ah.*, u.alias AS usuario_alias, rs.r2_folder AS razon_social_folder
      FROM archivos_historial ah
      LEFT JOIN usuarios u ON ah.usuario_id = u.id
            LEFT JOIN razon_social rs ON ah.razon_social_id = rs.id
      WHERE ah.razon_social_id = $1
    `;
        const params = [razonSocialId];

        if (anio) {
            params.push(parseInt(anio));
            query += ` AND ah.anio = $${params.length}`;
        }
        if (mes) {
            params.push(parseInt(mes));
            query += ` AND ah.mes = $${params.length}`;
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
    if (!razonSocialId) return;

    try {
        const result = await pool.query(
            `SELECT anio, mes, COUNT(*) AS total_archivos
       FROM archivos_historial
       WHERE razon_social_id = $1
       GROUP BY anio, mes
       ORDER BY anio DESC, mes DESC`,
            [razonSocialId]
        );
        res.json({ resumen: result.rows });
    } catch (err) {
        console.error('Error al obtener resumen:', err);
        res.status(500).json({ error: 'Error al obtener el resumen.' });
    }
}

// DELETE /api/files/:id
async function deleteArchivo(req, res) {
    const { id } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM archivos_historial WHERE id = $1 AND razon_social_id = $2',
            [id, req.user.razon_social_id]
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

module.exports = { upload, historial, resumenHistorial, deleteArchivo };
