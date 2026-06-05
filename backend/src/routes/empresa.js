const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { listarEmpresas } = require('../controllers/empresaController');

// GET /api/empresa?razon_social_id=ID
router.get('/', authMiddleware, listarEmpresas);

module.exports = router;
