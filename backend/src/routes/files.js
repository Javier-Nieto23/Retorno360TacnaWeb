const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const upload = require('../middleware/upload');
const { upload: uploadFile, historial, resumenHistorial, deleteArchivo } = require('../controllers/fileController');

router.post('/upload', authMiddleware, upload.single('archivo'), uploadFile);
router.get('/historial', authMiddleware, historial);
router.get('/historial/resumen', authMiddleware, resumenHistorial);
router.delete('/:id', authMiddleware, deleteArchivo);

module.exports = router;
