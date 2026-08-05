const express = require('express');
const router = express.Router();
const pool = require('../config/database');
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



module.exports = router;