const sql = require('mssql');
const { sqlConfig, testAwsSqlConnection } = require('../config/sqlserver');

const exportPedimentosQuery = `
SELECT pim.pi_id_pr,
       pim.pi_no_pedimento,
       pim.pi_fecha,
       COUNT(fi.fi_no_factura) AS num_facturas
FROM dbo.pedimento_imp pim
LEFT JOIN dbo.factura_imp fi
       ON fi.fi_id_pr = pim.pi_id_pr
GROUP BY pim.pi_id_pr, pim.pi_no_pedimento, pim.pi_fecha
ORDER BY num_facturas DESC, pim.pi_fecha DESC;

`;

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

async function exportPedimentos(req, res) {
    const pool = new sql.ConnectionPool(sqlConfig);

    try {
        await pool.connect();
        const result = await pool.request().query(exportPedimentosQuery);

        return res.status(200).json({
            connected: true,
            status: 'ok',
            message: 'Consulta de pedimentos de exportación ejecutada correctamente.',
            total: result.recordset.length,
            rows: result.recordset,
        });
    } catch (error) {
        return res.status(503).json({
            connected: false,
            status: 'error',
            message: 'No se pudo ejecutar la consulta de pedimentos de exportación.',
            error: error.message,
        });
    } finally {
        try {
            await pool.close();
        } catch (closeError) {
            // Ignorar cierre de pool.
        }
    }
}

module.exports = {
    testConnection,
    statusConnection,
    exportPedimentos,
};
