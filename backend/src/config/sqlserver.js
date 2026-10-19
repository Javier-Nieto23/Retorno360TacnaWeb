const sql = require('mssql');

const sqlConfig = {
    user: process.env.AWS_SQL_USER || 'jnieto',
    password: process.env.AWS_SQL_PASSWORD || 'T@cna.2026',
    server: process.env.AWS_SQL_SERVER || 'bms.cjkk8qusia7f.us-east-2.rds.amazonaws.com',
    port: Number(process.env.AWS_SQL_PORT || 1435),
    database: process.env.AWS_SQL_DATABASE || 'BMS_KASA',
    options: {
        encrypt: true,
        trustServerCertificate: true,
        enableArithAbort: true,
    },
    pool: {
        max: 5,
        min: 0,
        idleTimeoutMillis: 30000,
    },
};

async function testAwsSqlConnection() {
    const pool = new sql.ConnectionPool(sqlConfig);

    try {
        await pool.connect();
        const result = await pool.request().query('SELECT @@VERSION AS version');
        const version = result.recordset?.[0]?.version || 'SQL Server disponible';

        return {
            connected: true,
            server: sqlConfig.server,
            port: sqlConfig.port,
            user: sqlConfig.user,
            database: sqlConfig.database,
            version,
        };
    } catch (error) {
        throw new Error(error.message || 'No se pudo conectar a la base de datos SQL Server.');
    } finally {
        try {
            await pool.close();
        } catch (closeError) {
            // Ignorar cierre de pool en pruebas fallidas.
        }
    }
}

module.exports = {
    sql,
    sqlConfig,
    testAwsSqlConnection,
};
