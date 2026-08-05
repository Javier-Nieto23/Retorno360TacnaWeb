// src/views/DashboardCalidad.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isClusterUser, getLandingPath } from '../utils/roles';   // 👈 getLandingPath agregado
import { fetchDashboardMetrics, fetchInventoryMetrics } from '../services/dashboardService';
import './DashboardCalidad.css';

import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';

ChartJS.register(
    CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend
);

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export default function DashboardCalidad() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();   // 👈 nuevo

    const [rawData, setRawData] = useState([]);
    const [inventoryData, setInventoryData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // La pestaña activa ahora viene de la URL, no de un useState local
    const activeTab = useMemo(() => {
        if (location.pathname.endsWith('/graficas')) return 'graficas';
        if (location.pathname.endsWith('/inventarios')) return 'inventarios';
        return 'dashboard';
    }, [location.pathname]);

    const userIsCluster = useMemo(() => isClusterUser(user), [user]);

    useEffect(() => {
        if (!userIsCluster) {
            navigate(getLandingPath(user), { replace: true });
            return;
        }
        loadAllData();
    }, [userIsCluster, user, navigate]);

    const loadAllData = async () => {
        setLoading(true);
        try {
            const [dashRes, invRes] = await Promise.all([
                fetchDashboardMetrics(),
                fetchInventoryMetrics()
            ]);
            if (dashRes?.success) setRawData(dashRes.data || []);
            if (invRes?.success) setInventoryData(invRes.data || []);
            setError(null);
        } catch (err) {
            setError('Error al conectar con la API.');
        } finally {
            setLoading(false);
        }
    };

    const kpisOps = useMemo(() => {
        if (!rawData || !rawData.length) {
            return { ehs: '0.0', nc: 0, pago: '0', aging: '0.0', ahorro: '0.0' };
        }
        const avg = (key) => rawData.reduce((acc, r) => acc + (Number(r[key]) || 0), 0) / rawData.length;
        const sum = (key) => rawData.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
        return {
            ehs: avg('EHS').toFixed(1),
            nc: sum('NCAbiertas'),
            pago: avg('PagoTiempo').toFixed(0),
            aging: avg('AgingDias').toFixed(1),
            ahorro: ((sum('AhorroIGI') + sum('AhorroIVA')) / 1000000).toFixed(1)
        };
    }, [rawData]);

    const kpisInv = useMemo(() => {
        if (!inventoryData || !inventoryData.length) {
            return { totalNp: 0, pctRetorno: '0.0', pctLimpia: '0.0' };
        }
        const sum = inventoryData.reduce((acc, r) => acc + (Number(r.total_np) || 0), 0);
        const avgRetorno = inventoryData.reduce((acc, r) => acc + (Number(r.pct_retorno_cubierto) || 0), 0) / inventoryData.length;
        const avgLimpia = inventoryData.reduce((acc, r) => acc + (Number(r.pct_base_limpia) || 0), 0) / inventoryData.length;
        return {
            totalNp: sum.toLocaleString(),
            pctRetorno: avgRetorno.toFixed(1),
            pctLimpia: avgLimpia.toFixed(1)
        };
    }, [inventoryData]);

    if (!userIsCluster) {
        return (
            <div className="dashboard-container" style={{ padding: '2rem', textAlign: 'center' }}>
                <h2>Acceso denegado</h2>
                <p>No tienes permisos suficientes para visualizar Analytics Tacna.</p>
            </div>
        );
    }

    return (
        <div className="dashboard-container">
            {/* Las sub-pestañas ya viven en el Navbar; aquí ya no van */}
            |
            <div className="metrics-ribbon-container">
                {/* ... el resto del JSX queda exactamente igual, usando `activeTab` como ya lo hacía ... */}
            </div>

            <main className="main-content">
                {/* ... igual que antes, sin tocar nada más ... */}
            </main>
        </div>
    );
}