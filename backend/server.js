require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const pool = require('./src/config/database');
const { checkCloudflareConnection } = require('./src/config/storage');

const authRoutes = require('./src/routes/auth');
const fileRoutes = require('./src/routes/files');

const razonsocialRoutes = require('./src/routes/razonsocial');

const app = express();
const PORT = process.env.PORT || 3001;

async function logDatabaseConnectionStatus() {
    try {
        await pool.query('SELECT 1');
        console.log(
            `Conexion a PostgreSQL OK (${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'retorno360db'})`
        );
    } catch (error) {
        console.error('No se pudo conectar a PostgreSQL local. Verifica variables DB_* en .env y que el servicio este activo.');
        console.error(`Detalle: ${error.message}`);
    }
}

async function logCloudflareConnectionStatus() {
    if (process.env.STORAGE_MODE === 'r2') {
        try {
            const isConnected = await checkCloudflareConnection();
            if (isConnected) {
                console.log(
                    `✓ Conexion a Cloudflare R2 OK (Bucket: ${process.env.R2_BUCKET_NAME})`
                );
            } else {
                console.error(
                    `✗ No se pudo conectar a Cloudflare R2. Verifica variables R2_* en .env`
                );
            }
        } catch (error) {
            console.error(`✗ Error al verificar Cloudflare R2: ${error.message}`);
        }
    } else {
        console.log(`Modo de almacenamiento LOCAL (R2 no está habilitado)`);
    }
}

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

app.use('/api/razonsocial', razonsocialRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', mode: process.env.STORAGE_MODE || 'local', timestamp: new Date() });
});

const server = app.listen(PORT, async () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log(`Modo de almacenamiento: ${process.env.STORAGE_MODE || 'local'}`);
    await logDatabaseConnectionStatus();
    await logCloudflareConnectionStatus();
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`El puerto ${PORT} ya está en uso. Cierra la otra instancia del backend antes de iniciar una nueva.`);
        process.exit(1);
    }
    console.error('Error al iniciar servidor:', err);
    process.exit(1);
});
