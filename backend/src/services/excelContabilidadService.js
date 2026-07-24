const XLSX = require('xlsx');

/**
 * Encapsula toda la lógica de lectura y generación de Excel para el módulo de Contabilidad.
 * No conoce nada de la BD, de R2 ni de Express: solo recibe buffers y devuelve datos/buffers.
 */
class ExcelContabilidadService {
    /**
     * Busca una columna por nombre de encabezado (ignora mayúsculas/tildes/espacios extra)
     * y suma todos los valores numéricos encontrados en TODAS las hojas del archivo.
     *
     * @param {Buffer} buffer - Contenido del Excel
     * @param {string} nombreColumna - Encabezado a buscar, ej: "Cantidad"
     * @returns {{ total: number, filasLeidas: number, filasIgnoradas: number, columnaEncontrada: boolean }}
     */
    static sumarColumnaEnBuffer(buffer, nombreColumna) {
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const columnaNormalizada = ExcelContabilidadService._normalizarTexto(nombreColumna);

        let total = 0;
        let filasLeidas = 0;
        let filasIgnoradas = 0;
        let columnaEncontrada = false;

        for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const filas = XLSX.utils.sheet_to_json(sheet, { defval: null });

            if (filas.length === 0) continue;

            const headerReal = Object.keys(filas[0]).find(
                (header) => ExcelContabilidadService._normalizarTexto(header) === columnaNormalizada
            );

            if (!headerReal) continue;
            columnaEncontrada = true;

            for (const fila of filas) {
                const valorNumerico = ExcelContabilidadService._aNumero(fila[headerReal]);

                if (valorNumerico === null) {
                    filasIgnoradas += 1;
                    continue;
                }

                total += valorNumerico;
                filasLeidas += 1;
            }
        }

        return { total, filasLeidas, filasIgnoradas, columnaEncontrada };
    }

    /**
     * Genera el Excel final: una hoja con los 12 meses en columnas y el total acumulado,
     * más una hoja "Detalle" con metadata y una hoja "Errores" si hubo incidencias
     * (así se puede saber exactamente en qué archivo/mes ocurrió un problema).
     *
     * @param {Array<{ mes: number, mesNombre: string, total: number }>} datosPorMes
     * @param {{ campo: string, anio: number, errores?: Array }} metaInfo
     * @returns {Buffer}
     */
    static generarWorkbookResumen(datosPorMes, metaInfo = {}) {
        const headers = datosPorMes.map((item) => item.mesNombre);
        const valores = datosPorMes.map((item) => Number(item.total.toFixed(2)));

        const worksheet = XLSX.utils.aoa_to_sheet([headers, valores]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Resumen');

        const metaSheet = XLSX.utils.aoa_to_sheet([
            ['Campo analizado', metaInfo.campo || ''],
            ['Año', metaInfo.anio || ''],
            ['Generado el', new Date().toISOString()],
        ]);
        XLSX.utils.book_append_sheet(workbook, metaSheet, 'Detalle');

        if (metaInfo.errores && metaInfo.errores.length > 0) {
            const erroresSheet = XLSX.utils.json_to_sheet(
                metaInfo.errores.map((e) => ({
                    Archivo: e.archivo,
                    Mes: e.mes,
                    Motivo: e.motivo,
                }))
            );
            XLSX.utils.book_append_sheet(workbook, erroresSheet, 'Errores');
        }

        return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    }

    static _normalizarTexto(texto) {
        return String(texto || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    static _aNumero(valor) {
        if (valor === null || valor === undefined || valor === '') return null;
        if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;

        const limpio = String(valor).trim().replace(/[^\d.,-]/g, '').replace(',', '.');
        const numero = Number(limpio);
        return Number.isFinite(numero) ? numero : null;
    }
}

module.exports = ExcelContabilidadService;