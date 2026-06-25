const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const { dashboard, catalogo, crearUsuario } = require('../controllers/adminController');

router.get('/dashboard', authMiddleware, requireAdmin, dashboard);
router.get('/catalogo', authMiddleware, requireAdmin, catalogo);
router.post('/users', authMiddleware, requireAdmin, crearUsuario);

module.exports = router;
