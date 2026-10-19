const { sqlConfig, testAwsSqlConnection } = require('../config/sqlserver');

async function testConnection(req, res) {
    const requestMetadata = {
        server: sqlConfig.server,
        port: sqlConfig.port,
        database: sqlConfig.database,
        user: sqlConfig.user,
        timestamp: new Date().toISOString(),
    };

    try {
        const connectionResult = await testAwsSqlConnection();
        return res.status(200).json({
            connected: true,
            status: 'ok',
            message: 'conexion a base de datos completa',
            ...requestMetadata,
            version: connectionResult.version,
        });
    } catch (error) {
        return res.status(503).json({
            connected: false,
            status: 'error',
            message: 'No se pudo establecer la conexión a la base de datos.',
            error: error.message,
            ...requestMetadata,
        });
    }
}

async function statusConnection(req, res) {
    const summary = {
        connected: false,
        status: 'pending',
        message: 'Conexión SQL Server lista para iniciar.',
        server: sqlConfig.server,
        port: sqlConfig.port,
        database: sqlConfig.database,
        user: sqlConfig.user,
    };

    return res.status(200).json(summary);
}

module.exports = {
    testConnection,
    statusConnection,
};
