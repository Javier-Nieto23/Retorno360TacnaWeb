const express = require('express');
const router = express.Router();
const { pool } = require('../config/database'); // <-- IMPORTANTE: Importar pool
const authMiddleware = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const {
	dashboard,
	catalogo,
	crearUsuario,
	listarUsuarios,
	actualizarUsuario,
	eliminarUsuario,
} = require('../controllers/adminController');

// Rutas de administración
router.get('/dashboard', authMiddleware, requireAdmin, dashboard);
router.get('/catalogo', authMiddleware, requireAdmin, catalogo);
router.get('/users', authMiddleware, requireAdmin, listarUsuarios);
router.post('/users', authMiddleware, requireAdmin, crearUsuario);
router.put('/users/:id', authMiddleware, requireAdmin, actualizarUsuario);
router.delete('/users/:id', authMiddleware, requireAdmin, eliminarUsuario);

// Ruta de métricas de inventarios
router.get('/inventarios', authMiddleware, requireAdmin, async (req, res) => {
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
		console.error('Error al consultar tabla anexos:', error);
		res.status(500).json({ success: false, message: 'Error interno del servidor' });
	}
});

module.exports = router;