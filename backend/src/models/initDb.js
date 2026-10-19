require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

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

async function seedDefaultAdminUser() {
    try {
        await pool.query(`
            INSERT INTO roles (id, nombrerol)
            VALUES (1, 'admin')
            ON CONFLICT (id) DO NOTHING;
        `);

        const existingUser = await pool.query(
            `SELECT id FROM usuarios WHERE LOWER(nombre_usuario) = LOWER($1)`,
            ['admin']
        );

        if (existingUser.rows.length > 0) {
            return;
        }

        const passwordHash = await bcrypt.hash('admin123', 12);
        await pool.query(
            `INSERT INTO usuarios (nombre_usuario, alias, password_hash, empresa_id, rol)
             VALUES ($1, $2, $3, $4, $5)`,
            ['admin', 'admin', passwordHash, null, 1]
        );

        console.log('Usuario administrador creado: admin / admin123');
    } catch (error) {
        console.error('Error al crear usuario administrador por defecto:', error.message);
        throw error;
    }
}

async function initDatabase({ closePool = false } = {}) {
    const schemaPath = path.join(__dirname, 'schema.sql');
    console.log(`Leyendo esquema desde ${schemaPath}`);

    const schema = fs.readFileSync(schemaPath, 'utf8');
    try {
        const existingTables = await pool.query(
            "SELECT to_regclass('public.usuarios') IS NOT NULL AS usuarios_exists"
        );

        if (!existingTables.rows[0]?.usuarios_exists) {
            await pool.query(schema);
            console.log('Base de datos inicializada correctamente.');
        } else {
            console.log('La base de datos ya está inicializada; se omite la ejecución del esquema.');
        }

        await seedDefaultAdminUser();
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
