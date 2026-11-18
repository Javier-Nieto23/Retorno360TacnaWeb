const { Pool } = require('pg');

function buildPoolConfig() {
    const connectionString = String(process.env.DATABASE_URL || '').trim();

    if (!connectionString) {
        throw new Error('DATABASE_URL no está definida. El backend solo opera contra la base de datos de Railway: define DATABASE_URL (y PGSSLMODE=require) en backend/.env.');
    }

    const useRemoteSsl = process.env.NODE_ENV === 'production' || String(process.env.PGSSLMODE || '').toLowerCase() === 'require';

    return {
        connectionString,
        ssl: useRemoteSsl ? { rejectUnauthorized: false } : false,
    };
}

const pool = new Pool(buildPoolConfig());

pool.on('error', (err) => {
    console.error('Error inesperado en el pool de PostgreSQL:', err);
});

module.exports = pool;
