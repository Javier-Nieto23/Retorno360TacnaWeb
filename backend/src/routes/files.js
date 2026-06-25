const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const upload = require('../middleware/upload');
const {
    razonesSocialesDisponibles,
    empresasDisponibles,
    upload: uploadFile,
    historial,
    resumenHistorial,
    dashboardSummary,
    getArchivoDownloadUrl,
    deleteArchivo,
    solicitarEliminacionArchivo,
    listarSolicitudesEliminacion,
    resolverSolicitudEliminacion,
} = require('../controllers/fileController');

router.post('/upload', authMiddleware, upload.single('archivo'), uploadFile);
router.get('/razones-sociales-disponibles', authMiddleware, razonesSocialesDisponibles);
router.get('/empresas-disponibles', authMiddleware, empresasDisponibles);
router.get('/historial', authMiddleware, historial);
router.get('/historial/resumen', authMiddleware, resumenHistorial);
router.get('/dashboard-summary', authMiddleware, dashboardSummary);
router.get('/:id/download-url', authMiddleware, getArchivoDownloadUrl);
router.post('/:id/delete-request', authMiddleware, solicitarEliminacionArchivo);
router.get('/delete-requests', authMiddleware, listarSolicitudesEliminacion);
router.patch('/delete-requests/:requestId', authMiddleware, resolverSolicitudEliminacion);
router.delete('/:id', authMiddleware, deleteArchivo);

module.exports = router;
