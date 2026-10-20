const express = require('express');
const { testConnection, statusConnection, exportPedimentos } = require('../controllers/sqlServerController');

const router = express.Router();

router.get('/status', statusConnection);
router.get('/test', testConnection);
router.get('/export-pedimentos', exportPedimentos);

module.exports = router;
