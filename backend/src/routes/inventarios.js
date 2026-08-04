// backend/src/routes/inventarios.js
import { Router } from 'express';
import { getInventariosMetrics } from '../controllers/inventarios.js';

const router = Router();

// Esta ruta responderá a GET /inventarios (o /admin/inventarios según server.js)
router.get('/inventarios', getInventariosMetrics);

export default router;