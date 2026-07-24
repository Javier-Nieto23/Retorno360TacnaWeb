const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { generarReporte } = require('../controllers/contabilidadController');

router.get('/reporte', authMiddleware, generarReporte);

module.exports = router;