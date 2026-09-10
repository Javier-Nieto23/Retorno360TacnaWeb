const pool = require('../config/database');


export const getInventariosMetrics = async (req, res) => {
    try {
        const query = `
            SELECT 
                id,
                mes,
                anio,
                planta,
                razon_social,
                COALESCE(total_np, 0) as total_np,
                COALESCE(vigente_bom, 0) as vigente_bom,
                COALESCE(pct_base_limpia, 0) as pct_base_limpia,
                COALESCE(pct_retorno_cubierto, 0) as pct_retorno_cubierto,
                fecha_calculo
            FROM anexos
            ORDER BY
                anio DESC,
                CASE
                    WHEN LOWER(TRIM(mes)) = 'enero' THEN 1
                    WHEN LOWER(TRIM(mes)) = 'febrero' THEN 2
                    WHEN LOWER(TRIM(mes)) = 'marzo' THEN 3
                    WHEN LOWER(TRIM(mes)) = 'abril' THEN 4
                    WHEN LOWER(TRIM(mes)) = 'mayo' THEN 5
                    WHEN LOWER(TRIM(mes)) = 'junio' THEN 6
                    WHEN LOWER(TRIM(mes)) = 'julio' THEN 7
                    WHEN LOWER(TRIM(mes)) = 'agosto' THEN 8
                    WHEN LOWER(TRIM(mes)) = 'septiembre' THEN 9
                    WHEN LOWER(TRIM(mes)) = 'octubre' THEN 10
                    WHEN LOWER(TRIM(mes)) = 'noviembre' THEN 11
                    WHEN LOWER(TRIM(mes)) = 'diciembre' THEN 12
                    ELSE 99
                END DESC,
                razon_social ASC;
        `;
        const { rows } = await pool.query(query);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error al consultar anexos:', error);
        res.status(500).json({ success: false, message: 'Error interno en la base de datos' });
    }
};