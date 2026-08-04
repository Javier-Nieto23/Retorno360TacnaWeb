// src/services/dashboardService.js
import api from './api';

export const fetchDashboardMetrics = async () => {
    try {
        const response = await api.get('/admin/dashboard');
        return response.data;
    } catch (error) {
        console.error('Error al obtener métricas del dashboard:', error);
        return { success: false, data: [] };
    }
};

export const fetchInventoryMetrics = async () => {
    try {
        const response = await api.get('/admin/inventarios');
        return response.data;
    } catch (error) {
        console.error('Error al obtener métricas de inventarios:', error);
        return { success: false, data: [] };
    }
};