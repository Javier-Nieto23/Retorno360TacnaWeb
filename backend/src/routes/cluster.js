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

module.exports = router;