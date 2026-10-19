const express = require('express');
const { testConnection, statusConnection } = require('../controllers/sqlServerController');

const router = express.Router();

router.get('/status', statusConnection);
router.get('/test', testConnection);

module.exports = router;
