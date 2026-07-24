const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const upload = require('../middleware/upload');
const uploadImage = require('../middleware/uploadImage');
const {
    razonesSocialesDisponibles,
    empresasDisponibles,
    upload: uploadFile,
    listarNumerosParte,
    crearNumeroParte,
    historial,
    resumenHistorial,
    dashboardSummary,
    crearObservacionArchivo,
    listarObservaciones,
    obtenerDetalleObservacion,
    responderObservacionCliente,
    responderObservacionAdmin,
    cerrarObservacionAdmin,
    getArchivoDownloadUrl,
    deleteArchivo,
    solicitarEliminacionArchivo,
    listarSolicitudesEliminacion,
    iniciarObservacionDesdeSolicitud,
    resolverSolicitudEliminacion,
} = require('../controllers/fileController');

router.post('/upload', authMiddleware, (req, res, next) => {
    upload.single('archivo')(req, res, (err) => {
        if (!err) {
            return next();
        }

        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'El archivo excede el tamaño máximo permitido de 50 MB.' });
        }

        return res.status(400).json({ error: err.message || 'No se pudo procesar el archivo seleccionado.' });
    });
}, uploadFile);
router.get('/razones-sociales-disponibles', authMiddleware, razonesSocialesDisponibles);
router.get('/empresas-disponibles', authMiddleware, empresasDisponibles);
router.get('/numeros-parte', authMiddleware, listarNumerosParte);
router.post('/numeros-parte', authMiddleware, uploadImage.single('imagen'), crearNumeroParte);
router.get('/historial', authMiddleware, historial);
router.get('/historial/resumen', authMiddleware, resumenHistorial);
router.get('/dashboard-summary', authMiddleware, dashboardSummary);
router.get('/observaciones', authMiddleware, listarObservaciones);
router.get('/observaciones/:id', authMiddleware, obtenerDetalleObservacion);
router.post('/observaciones/:id/responder', authMiddleware, responderObservacionCliente);
router.post('/observaciones/:id/responder-admin', authMiddleware, responderObservacionAdmin);
router.patch('/observaciones/:id/cerrar', authMiddleware, cerrarObservacionAdmin);
router.post('/:id/observaciones', authMiddleware, crearObservacionArchivo);
router.get('/:id/download-url', authMiddleware, getArchivoDownloadUrl);
router.post('/:id/delete-request', authMiddleware, solicitarEliminacionArchivo);
router.get('/delete-requests', authMiddleware, listarSolicitudesEliminacion);
router.post('/delete-requests/:requestId/start-observation', authMiddleware, iniciarObservacionDesdeSolicitud);
router.patch('/delete-requests/:requestId', authMiddleware, resolverSolicitudEliminacion);
router.delete('/:id', authMiddleware, deleteArchivo);

module.exports = router;
