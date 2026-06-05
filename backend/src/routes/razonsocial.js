const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { listar, crear } = require('../controllers/razonsocialController');

router.get('/', authMiddleware, listar);
router.post('/', authMiddleware, crear);

module.exports = router;
