const { Pool } = require('pg');

function buildPoolConfig() {
    const useRemoteSsl = Boolean(process.env.DATABASE_URL) && (process.env.NODE_ENV === 'production' || String(process.env.PGSSLMODE || '').toLowerCase() === 'require');

    if (process.env.DATABASE_URL) {
        return {
            connectionString: process.env.DATABASE_URL,
            ssl: useRemoteSsl ? { rejectUnauthorized: false } : false,
        };
    }

    return {
        host: process.env.DB_HOST || process.env.PGHOST || 'localhost',
        port: parseInt(process.env.DB_PORT || process.env.PGPORT || '5432', 10),
        database: process.env.DB_NAME || process.env.PGDATABASE || 'retorno360db',
        user: process.env.DB_USER || process.env.PGUSER || 'postgres',
        password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
        ssl: false,
    };
}

const pool = new Pool(buildPoolConfig());

pool.on('error', (err) => {
    console.error('Error inesperado en el pool de PostgreSQL:', err);
});

module.exports = pool;
