// Ruta de métricas de cumplimiento T-MEC / IMMEX
router.get('/cumplimiento', authMiddleware, requireCluster, async (req, res) => {
	try {
		const query = `
			SELECT 
				id,
				mes,
				anio,
				razon_social,
				planta,
				COALESCE(operaciones, 0) as operaciones,
				COALESCE(pago_igi, 0) as pago_igi,
				COALESCE(ahorro_igi, 0) as ahorro_igi,
				COALESCE(pago_iva, 0) as pago_iva,
				COALESCE(ahorro_iva, 0) as ahorro_iva
			FROM cumplimiento
			ORDER BY anio DESC, mes DESC;
			`;

		const { rows } = await pool.query(query);
		res.json({ success: true, data: rows });
	} catch (error) {
		console.error('Error al consultar tabla cumplimiento:', error);
		res.status(500).json({ success: false, message: 'Error interno del servidor' });
	}
});