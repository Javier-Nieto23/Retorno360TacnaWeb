require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

function buildPoolConfig() {
    if (process.env.DATABASE_URL) {
        return {
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' || process.env.PGSSLMODE === 'require'
                ? { rejectUnauthorized: false }
                : false,
        };
    }

    return {
        host: process.env.DB_HOST || process.env.PGHOST || 'localhost',
        port: parseInt(process.env.DB_PORT || process.env.PGPORT || '5432', 10),
        database: process.env.DB_NAME || process.env.PGDATABASE || 'retorno360db',
        user: process.env.DB_USER || process.env.PGUSER || 'postgres',
        password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
    };
}

const pool = new Pool(buildPoolConfig());

async function initDatabase({ closePool = false } = {}) {
    const schemaPath = path.join(__dirname, 'schema.sql');
    console.log(`Leyendo esquema desde ${schemaPath}`);

    const schema = fs.readFileSync(schemaPath, 'utf8');
    try {
        await pool.query(schema);
        console.log('Base de datos inicializada correctamente.');
    } catch (error) {
        console.error('Error al inicializar la base de datos:', error.message);
        if (closePool) {
            await pool.end();
        }
        process.exit(1);
    } finally {
        if (closePool) {
            await pool.end();
        }
    }
}

if (require.main === module) {
    initDatabase({ closePool: true });
}

module.exports = { pool, initDatabase };
