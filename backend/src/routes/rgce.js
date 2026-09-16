const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const requireImp = require('../middleware/requireImp');
const requireExp = require('../middleware/requireExp');
const uploadRgce = require('../middleware/uploadRgce');
const {
    getDashboard,
    getDocumentos,
    uploadDocuments,
    updateDocumento,
    getCatalogo,
    getDocumentoPreview,
    getDocumentoDownloadUrl,
    createPedimento,
    getPedimentos,
} = require('../controllers/rgceController');

function allowImpOrExp(req, res, next) {
    const roleName = String(req.user?.rol_nombre || '').toLowerCase().trim();
    if (['imp', 'importacion', 'import'].includes(roleName)) return next();
    if (['exp', 'exportacion', 'export'].includes(roleName)) return next();
    return res.status(403).json({ error: 'Acceso denegado. Se requiere rol IMP o EXP.' });
}

router.get('/catalogo', authMiddleware, allowImpOrExp, getCatalogo);
router.get('/pedimentos', authMiddleware, allowImpOrExp, getPedimentos);
router.get('/dashboard', authMiddleware, allowImpOrExp, getDashboard);
router.get('/documentos', authMiddleware, allowImpOrExp, getDocumentos);
router.get('/:id/download-url', authMiddleware, allowImpOrExp, getDocumentoDownloadUrl);
router.get('/:id/preview', authMiddleware, allowImpOrExp, getDocumentoPreview);
router.post('/pedimentos', authMiddleware, requireImp, createPedimento);
router.post('/upload', authMiddleware, requireImp, uploadRgce.array('archivos', 20), uploadDocuments);
router.patch('/:id', authMiddleware, allowImpOrExp, updateDocumento);

module.exports = router;
