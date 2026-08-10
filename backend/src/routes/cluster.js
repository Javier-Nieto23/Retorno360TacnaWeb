const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const requireCluster = require('../middleware/requireCluster');
const { dashboard } = require('../controllers/adminController'); // reutiliza el mismo controller de datos

router.get('/dashboard', authMiddleware, requireCluster, dashboard);

router.get('/inventarios', authMiddleware, requireCluster, async (req, res) => {
	try {
		const query = `
			SELECT id, mes, anio, planta, razon_social,
				COALESCE(total_np, 0) as total_np,
				COALESCE(altas_np, 0) as altas_np,
				COALESCE(vigente_bom, 0) as vigente_bom,
				ROUND((COALESCE(pct_base_limpia, 0) * 100)::numeric, 2) as pct_base_limpia,
				ROUND((COALESCE(pct_retorno_cubierto, 0) * 100)::numeric, 2) as pct_retorno_cubierto,
				fecha_calculo
			FROM anexos
			ORDER BY anio DESC, mes DESC;
			`;
		const { rows } = await pool.query(query);
		res.json({ success: true, data: rows });
	} catch (error) {
		console.error('Error al consultar tabla anexos:', error);
		res.status(500).json({ success: false, message: 'Error interno del servidor' });
	}
});

router.get('/cumplimiento', authMiddleware, requireCluster, async (req, res) => {
	try {
		const query = `
			SELECT *
			FROM retorno_porcentaje
			ORDER BY periodo DESC NULLS LAST;
		`;

		const { rows } = await pool.query(query);
		const mappedRows = rows.map((row, index) => {
			const periodo = row?.periodo ? new Date(row.periodo) : null;
			const mes = periodo && !Number.isNaN(periodo.getTime())
				? (periodo.getUTCMonth() + 1)
				: Number(row?.mes) || null;
			const anio = periodo && !Number.isNaN(periodo.getTime())
				? periodo.getUTCFullYear()
				: Number(row?.anio) || null;

			const pagoIgi = Number(row?.pago_igi ?? row?.igi_pagado ?? 0) || 0;
			const ahorroIgi = Number(row?.ahorro_igi ?? 0) || 0;
			const calculadoIgi = Number(row?.igi_calculado ?? (pagoIgi + ahorroIgi)) || 0;
			const pagoIva = Number(row?.pago_iva ?? row?.iva_pagado ?? 0) || 0;
			const ahorroIva = Number(row?.ahorro_iva ?? row?.iva_ahorro ?? 0) || 0;

			return {
				id: row?.id || index + 1,
				mes,
				anio,
				razon_social: row?.razon_social || row?.cliente || row?.empresa || 'N/A',
				planta: row?.planta || row?.site || 'N/A',
				operaciones: Number(row?.operaciones ?? 0) || 0,
				pago_igi: pagoIgi,
				ahorro_igi: ahorroIgi,
				igi_calculado: calculadoIgi,
				pago_iva: pagoIva,
				ahorro_iva: ahorroIva,
			};
		});

		res.json({ success: true, data: mappedRows });
	} catch (error) {
		console.error('Error al consultar tabla retorno_porcentaje (cumplimiento):', error);
		res.status(500).json({ success: false, message: 'Error interno del servidor' });
	}
});

module.exports = router;