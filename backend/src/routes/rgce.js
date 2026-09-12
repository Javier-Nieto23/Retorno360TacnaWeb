const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const requireImp = require('../middleware/requireImp');
const uploadRgce = require('../middleware/uploadRgce');
const {
    getDashboard,
    getDocumentos,
    uploadDocuments,
    updateDocumento,
    getCatalogo,
} = require('../controllers/rgceController');

router.get('/catalogo', authMiddleware, requireImp, getCatalogo);
router.get('/dashboard', authMiddleware, requireImp, getDashboard);
router.get('/documentos', authMiddleware, requireImp, getDocumentos);
router.post('/upload', authMiddleware, requireImp, uploadRgce.array('archivos', 20), uploadDocuments);
router.patch('/:id', authMiddleware, requireImp, updateDocumento);

module.exports = router;
