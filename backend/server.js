require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./src/routes/auth');
const fileRoutes = require('./src/routes/files');

const empresaRoutes = require('./src/routes/empresa');
const razonsocialRoutes = require('./src/routes/razonsocial');

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Directorio de uploads locales (solo para modo LOCAL)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);

app.use('/api/empresa', empresaRoutes);
app.use('/api/razonsocial', razonsocialRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', mode: process.env.STORAGE_MODE || 'local', timestamp: new Date() });
});

const server = app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log(`Modo de almacenamiento: ${process.env.STORAGE_MODE || 'local'}`);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`El puerto ${PORT} ya está en uso. Cierra la otra instancia del backend antes de iniciar una nueva.`);
        process.exit(1);
    }
    console.error('Error al iniciar servidor:', err);
    process.exit(1);
});
