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
	const startedAt = Date.now();
	const userId = req.user?.id || 'desconocido';
	const roleName = String(req.user?.rol_nombre || 'desconocido');
	const requestPath = req.originalUrl || '/api/cluster/cumplimiento';
	const requestMethod = req.method || 'GET';
	console.log(`[CUMPLIMIENTO][REQUEST] ${requestMethod} ${requestPath} user_id=${userId} rol=${roleName}`);

	try {
		const primaryQuery = `
			SELECT
				id,
				razon_social,
				planta,
				periodo,
				operaciones,
				igi_pagado,
				igi_calculado,
				ahorro_igi,
				pago_iva,
				ahorro_iva,
				fecha_calculo
			FROM public.retorno_porcentaje
			ORDER BY periodo DESC NULLS LAST, id DESC;
		`;

		const fallbackQuery = `
			SELECT
				id,
				razon_social,
				planta,
				periodo,
				operaciones,
				COALESCE(pago_igi, igi_pagado) AS igi_pagado,
				COALESCE(igi_calculado, COALESCE(pago_igi, igi_pagado) + COALESCE(ahorro_igi, 0)) AS igi_calculado,
				ahorro_igi,
				COALESCE(pago_iva, iva_pagado) AS pago_iva,
				COALESCE(ahorro_iva, iva_ahorro) AS ahorro_iva,
				fecha_calculo
			FROM public.cumplimiento
			ORDER BY periodo DESC NULLS LAST, id DESC;
		`;

		let rows = [];
		let sourceTable = 'public.retorno_porcentaje';
		try {
			const result = await pool.query(primaryQuery);
			rows = result.rows;
			console.log(`[CUMPLIMIENTO][QUERY_OK] tabla=${sourceTable} rows=${rows.length}`);
		} catch (primaryError) {
			if (primaryError?.code !== '42P01' && primaryError?.code !== '42703') {
				console.error(`[CUMPLIMIENTO][QUERY_FAIL] tabla=${sourceTable} code=${primaryError?.code || 'NA'} mensaje=${primaryError?.message || 'sin mensaje'}`);
				throw primaryError;
			}

			sourceTable = 'public.cumplimiento';
			console.warn(`[CUMPLIMIENTO][FALLBACK] usando tabla alterna ${sourceTable} por error code=${primaryError?.code || 'NA'}`);
			const result = await pool.query(fallbackQuery);
			rows = result.rows;
			console.log(`[CUMPLIMIENTO][QUERY_OK] tabla=${sourceTable} rows=${rows.length}`);
		}

		const mappedRows = rows.map((row, index) => {
			const periodo = row?.periodo ? new Date(row.periodo) : null;
			const mes = periodo && !Number.isNaN(periodo.getTime())
				? (periodo.getUTCMonth() + 1)
				: Number(row?.mes) || null;
			const anio = periodo && !Number.isNaN(periodo.getTime())
				? periodo.getUTCFullYear()
				: Number(row?.anio) || null;

			const pagoIgi = Number(row?.igi_pagado ?? row?.pago_igi ?? 0) || 0;
			const ahorroIgi = Number(row?.ahorro_igi ?? 0) || 0;
			const calculadoIgi = Number(row?.igi_calculado ?? (pagoIgi + ahorroIgi)) || 0;
			const pagoIva = Number(row?.pago_iva ?? 0) || 0;
			const ahorroIva = Number(row?.ahorro_iva ?? 0) || 0;

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

		const elapsedMs = Date.now() - startedAt;
		const latestPeriod = mappedRows[0]
			? `${mappedRows[0].anio || 'NA'}-${String(mappedRows[0].mes || 'NA').padStart(2, '0')}`
			: 'sin_datos';
		console.log(`[CUMPLIMIENTO][RESPONSE_OK] tabla=${sourceTable} mapped_rows=${mappedRows.length} latest_period=${latestPeriod} duracion_ms=${elapsedMs}`);

		res.json({ success: true, data: mappedRows });
	} catch (error) {
		const elapsedMs = Date.now() - startedAt;
		console.error(`[CUMPLIMIENTO][RESPONSE_FAIL] duracion_ms=${elapsedMs} code=${error?.code || 'NA'} mensaje=${error?.message || 'sin mensaje'}`);
		console.error('Error al consultar datos de cumplimiento:', error);
		res.status(500).json({ success: false, message: 'Error interno del servidor' });
	}
});

module.exports = router;