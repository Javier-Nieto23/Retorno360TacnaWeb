require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'retorno360db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
});

// Eliminado: inicialización automática de la base de datos desde archivo local.
// Si necesitas inicializar la base de datos, ejecuta el SQL manualmente desde un cliente PostgreSQL.
