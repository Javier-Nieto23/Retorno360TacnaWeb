// src/services/dashboardService.js
import api from './api';

function normalizeClusterDashboardPayload(payload) {
    if (payload?.success && Array.isArray(payload?.data)) {
        return payload;
    }

    const monthlyRows = Array.isArray(payload?.por_mes) ? payload.por_mes : null;
    if (!monthlyRows) {
        return { success: false, data: [] };
    }

    // Compatibilidad: adapta el formato de /cluster/dashboard (admin dashboard)
    // al shape consumido por DashboardCalidad.
    const adaptedRows = monthlyRows.map((row, index) => ({
        id: `${row?.anio || 'na'}-${row?.mes || 'na'}-${index}`,
        Cliente: 'Consolidado',
        Mes: Number(row?.mes) || null,
        Año: Number(row?.anio) || null,
        EHS: 100,
        Importaciones: Number(row?.total_archivos) || 0,
        Exportaciones: 0,
        Incidencias: 0,
        PagoTiempo: 100,
        NCAbiertas: 0,
        AgingDias: 0,
        AhorroIGI: 0,
        AhorroIVA: 0,
    }));

    return {
        success: true,
        data: adaptedRows,
        meta: {
            source: 'cluster-dashboard-adapter',
            totales: payload?.totales || null,
        },
    };
}

export const fetchDashboardMetrics = async () => {
    try {
        const response = await api.get('/cluster/dashboard');
        return normalizeClusterDashboardPayload(response.data);
    } catch (error) {
        console.error('Error al obtener métricas del dashboard:', error);
        return { success: false, data: [] };
    }
};

export const fetchInventoryMetrics = async () => {
    try {
        // Se cambió /admin/inventarios por /cluster/inventarios para validar requireCluster
        const response = await api.get('/cluster/inventarios');
        return response.data;
    } catch (error) {
        console.error('Error al obtener métricas de inventarios:', error);
        return { success: false, data: [] };
    }
};

export const fetchCumplimientoMetrics = async () => {
    try {
        const response = await api.get('/cluster/cumplimiento');
        return response.data;
    } catch (error) {
        console.error('Error al obtener métricas de cumplimiento:', error);
        return { success: false, data: [] };
    }
};

