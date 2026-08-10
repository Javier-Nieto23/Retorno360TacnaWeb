const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const requireCluster = require('../middleware/requireCluster');

// Ruta de métricas de cumplimiento T-MEC / IMMEX
router.get('/cumplimiento', authMiddleware, requireCluster, async (req, res) => {
	try {
		const query = `
			SELECT
				id,
				razon_social,
				planta,
				periodo,
				EXTRACT(MONTH FROM periodo)::int AS mes,
				EXTRACT(YEAR FROM periodo)::int AS anio,
				COALESCE(operaciones, 0) AS operaciones,
				COALESCE(igi_pagado, 0) AS igi_pagado,
				COALESCE(igi_pagado, 0) AS pago_igi,
				COALESCE(igi_calculado, 0) AS igi_calculado,
				COALESCE(ahorro_igi, 0) AS ahorro_igi,
				COALESCE(pago_iva, 0) AS pago_iva,
				COALESCE(ahorro_iva, 0) AS ahorro_iva
			FROM anexos
			ORDER BY periodo DESC NULLS LAST, id DESC;
			`;

		const { rows } = await pool.query(query);
		res.json({ success: true, data: rows });
	} catch (error) {
		console.error('Error al consultar tabla de cumplimiento:', error);
		res.status(500).json({ success: false, message: 'Error interno del servidor' });
	}
});

module.exports = router;