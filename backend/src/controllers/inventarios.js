// Ruta para consultar los datos de la tabla anexos
app.get('/admin/inventarios', async (req, res) => {
    try {
        const query = `
            SELECT 
                id,
                mes,
                anio,
                planta,
                razon_social,
                COALESCE(total_np, 0) as total_np,
                COALESCE(altas_np, 0) as altas_np,
                COALESCE(vigente_bom, 0) as vigente_bom,
                COALESCE(pct_base_limpia, 0) as pct_base_limpia,
                COALESCE(pct_retorno_cubierto, 0) as pct_retorno_cubierto,
                fecha_calculo
            FROM anexos
            ORDER BY anio DESC, mes DESC;
        `;
        const { rows } = await pool.query(query);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error al consultar la tabla anexos:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});