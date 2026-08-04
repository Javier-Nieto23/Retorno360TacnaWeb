// src/services/dashboardService.js
const API_URL = import.meta.env.VITE_API_URL || 'https://tu-backend-railway.up.retorno360tacnaweb-production.up.railway.app.app/api';


export const fetchDashboardMetrics = async () => {
    try {
        const response = await fetch(`${API_URL}/dashboard/metrics`);
        if (!response.ok) {
            throw new Error(`Error en la petición API: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('dashboardService Error:', error);
        throw error;
    }
};