const sql = require('mssql');
const { sqlConfig, testAwsSqlConnection } = require('../config/sqlserver');

const exportPedimentosQuery = `
SELECT
    factura_Exp.fe_no_factura AS Factura,
    factura_Exp.fe_fecha AS FechaFactura,
    pe_fecha_ent AS FechaEntrada,
    pe_fecha_pag AS FechaPago,
    clientes_1.cl_nombre AS Cliente,
    clientes.cl_nombre AS Destinatario,
    apoderadosAduanales.ap_noRegistro AS Patente,
    pe_aduana AS [Aduana/Seccion],
    RIGHT(YEAR(pe_fecha_pag), 2) + ' ' + LEFT(pe_aduana,2) + ' ' + ap_noRegistro + ' ' + RIGHT(pe_no_pedimento,7) AS FolioPedimento,
    factura_Exp.fe_no_pedmto AS Pedimento,
    factura_Exp.fe_id_re AS Regimen,
    factura_Exp.fe_tipo_exp AS TipoExp,
    factura_Exp.fe_numEntry AS Entry,
    ISNULL(PE_TC, factura_Exp.fe_tc) AS TC,
    factura_Exp.fe_id_cp AS CvePed,
    factura_Exp.fe_obs1 AS ObservacionesFact,
    Transportistas.tr_nombre AS Transportista,
    Transportistas_Choferes.tch_nombre AS Chofer,
    factura_Exp.fe_placas AS Trailer,
    factura_Exp.fe_noEcon AS Econ,
    factura_Exp.fe_placas2 AS Tractor,
    factura_Exp.fe_scac AS SCAC,
    pe_id_in AS Incoterm,
    factura_ExpDetalle.fed_num_packing AS NoPacking,
    PackingsExp.pe_fecha AS FechaPL,
    factura_Exp.fe_date_change AS UltimoCambio,
    factura_Exp.fe_user_change AS Usuario,
    packingsexp.pe_user_create AS UsuarioPL,
    [HorariosEmbarques].Descripcion AS Horario,
    PackingsExpDet.ped_csc AS SecInterna,
    PackingsExpDet.ped_sec_ds AS SecDS,
    PackingsExpDet.ped_tipo_mo AS TipoMcia,
    PackingsExpDet.ped_no_parte AS NoParte,
    PackingsExpDet.ped_ParteCli AS NoParte_Cliente,
    PackingsExpDet.ped_descripcion AS Descripcion_Español,
    PackingsExpDet.ped_descIng AS Descripcion_Ingles,
    PackingsExpDet.ped_fr_mex + ISNULL(ped_NICO,'') AS FraccionMX,
    REPLACE(PackingsExpDet.ped_fr_mex, '.', '') + ISNULL(ped_NICO,'') AS Fraccion,
    PackingsExpDet.ped_tot_pesoBruto AS TotPesoBrutoLB,
    PackingsExpDet.ped_tot_pesoNeto AS TotPesoNetoLB,
    PackingsExpDet.ped_tot_pesoBruto * 0.4536 AS TotPesoBrutoKG,
    PackingsExpDet.ped_tot_pesoNeto * 0.4536 AS TotPesoNetoKG,
    PackingsExpDet.ped_cant AS Cantidad,
    umc.um_abrev AS UOM,
    CAST(PackingsExpDet.ped_cant_umcom AS NUMERIC (18,3)) AS CantidadComercial,
    umc_1.um_abrev AS UMC,
    CAST(PackingsExpDet.ped_cant_umtar AS NUMERIC (18,3)) AS Cant_Tar,
    PackingsExpDet.ped_umt AS UMT,
    PackingsExpDet.ped_costo_unit AS CostoUnitarioUSD,
    PackingsExpDet.ped_costo_unit * ISNULL(PE_TC, factura_Exp.fe_tc) AS CostoUnitarioMXP
FROM factura_Exp
LEFT JOIN factura_ExpDetalle ON factura_ExpDetalle.fed_id_fe = factura_Exp.fe_id
LEFT JOIN PackingsExp ON PackingsExp.pe_id = factura_Exp.fe_id_pe
LEFT JOIN PackingsExpDet ON PackingsExpDet.ped_id_pe = PackingsExp.pe_id
LEFT JOIN clientes AS clientes_1 ON clientes_1.cl_id = factura_Exp.fe_id_client
LEFT JOIN clientes ON clientes.cl_id = factura_Exp.fe_id_destinatario
LEFT JOIN apoderadosAduanales ON apoderadosAduanales.ap_id = factura_Exp.fe_id_apod
LEFT JOIN Transportistas ON Transportistas.tr_id = factura_Exp.fe_id_transportista
LEFT JOIN Transportistas_Choferes ON Transportistas_Choferes.tch_id = factura_Exp.fe_id_chofer
LEFT JOIN umc ON umc.um_id = PackingsExpDet.ped_um_id
LEFT JOIN umc AS umc_1 ON umc_1.um_id = PackingsExpDet.ped_umc_id
LEFT JOIN [HorariosEmbarques] ON [HorariosEmbarques].Id = factura_Exp.fe_id_horario
WHERE factura_Exp.fe_status = 1
ORDER BY FechaPago DESC, Factura DESC;`;

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
