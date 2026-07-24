const pool = require('../config/database');
const { getFileBuffer } = require('../config/storage');
const ExcelContabilidadService = require('../services/excelContabilidadService');
const {
    getAuthorizedRazonSocialId,
    getAuthorizedEmpresaId,
    ensureHistorialEmpresaColumn,
} = require('./fileController');

const MESES_NOMBRE = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// GET /api/contabilidad/reporte?campo=&anio=&razon_social_id=&empresa_id=
async function generarReporte(req, res) {
    const campo = String(req.query?.campo || '').trim();
    if (!campo) {
        return res.status(400).json({ error: 'Debes indicar el nombre del campo/columna a sumar.' });
    }

    const anio = req.query?.anio ? Number(req.query.anio) : new Date().getFullYear();
    if (Number.isNaN(anio)) {
        return res.status(400).json({ error: 'anio inválido.' });
    }

    const razonSocialId = getAuthorizedRazonSocialId(req, res);
    if (typeof razonSocialId === 'undefined') return;

    const empresaId = getAuthorizedEmpresaId(req, res);
    if (typeof empresaId === 'undefined') return;

    try {
        await ensureHistorialEmpresaColumn();

        const conditions = ['ah.anio = $1'];
        const values = [anio];

        if (razonSocialId) {
            values.push(razonSocialId);
            conditions.push(`ah.razon_social_id = $${values.length}`);
        }
        if (empresaId) {
            values.push(empresaId);
            conditions.push(`ah.empresa_id = $${values.length}`);
        }

        const archivosResult = await pool.query(
            `SELECT id, nombre_archivo, storage_key, mes
             FROM archivos_historial ah
             WHERE ${conditions.join(' AND ')}
             ORDER BY mes ASC`,
            values
        );

        const archivos = archivosResult.rows;

        if (archivos.length === 0) {
            return res.status(404).json({ error: `No se encontraron archivos para el año ${anio} con los filtros indicados.` });
        }

        const totalesPorMes = new Map();
        const errores = [];

        for (const archivo of archivos) {
            try {
                const buffer = await getFileBuffer(archivo.storage_key);
                const { total, columnaEncontrada, filasIgnoradas } =
                    ExcelContabilidadService.sumarColumnaEnBuffer(buffer, campo);

                if (!columnaEncontrada) {
                    errores.push({
                        archivo: archivo.nombre_archivo,
                        mes: MESES_NOMBRE[archivo.mes - 1] || archivo.mes,
                        motivo: `No se encontró la columna "${campo}" en este archivo.`,
                    });
                    continue;
                }

                totalesPorMes.set(archivo.mes, (totalesPorMes.get(archivo.mes) || 0) + total);

                if (filasIgnoradas > 0) {
                    errores.push({
                        archivo: archivo.nombre_archivo,
                        mes: MESES_NOMBRE[archivo.mes - 1] || archivo.mes,
                        motivo: `${filasIgnoradas} fila(s) con valores no numéricos fueron ignoradas.`,
                    });
                }
            } catch (fileErr) {
                // Este console.error es la clave para depurar: te dice EXACTAMENTE
                // qué archivo (id y nombre) falló y por qué.
                console.error(`[CONTABILIDAD] Error en archivo "${archivo.nombre_archivo}" (id ${archivo.id}):`, fileErr);
                errores.push({
                    archivo: archivo.nombre_archivo,
                    mes: MESES_NOMBRE[archivo.mes - 1] || archivo.mes,
                    motivo: fileErr.message || 'Error desconocido al procesar el archivo.',
                });
            }
        }

        const datosPorMes = Array.from({ length: 12 }, (_, index) => ({
            mes: index + 1,
            mesNombre: MESES_NOMBRE[index],
            total: totalesPorMes.get(index + 1) || 0,
        }));

        const workbookBuffer = ExcelContabilidadService.generarWorkbookResumen(datosPorMes, { campo, anio, errores });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="contabilidad_${campo.replace(/\s+/g, '_')}_${anio}.xlsx"`);
        res.setHeader('X-Contabilidad-Errores', String(errores.length));
        res.setHeader('Access-Control-Expose-Headers', 'X-Contabilidad-Errores');

        return res.send(Buffer.from(workbookBuffer));
    } catch (err) {
        console.error('[CONTABILIDAD][GENERAR_REPORTE] Error:', err);
        return res.status(500).json({ error: 'Error al generar el reporte de contabilidad.' });
    }
}

module.exports = { generarReporte };