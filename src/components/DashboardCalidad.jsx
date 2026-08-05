// src/views/DashboardCalidad.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isCluster, isClusterUser } from '../utils/roles';
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
    CategoryScale,
    LinearScale,
    BarElement,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
);

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export default function DashboardCalidad() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [rawData, setRawData] = useState([]);
    const [inventoryData, setInventoryData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('dashboard');

    // Validar permisos antes de realizar cualquier carga de datos
    const userIsCluster = useMemo(() => isClusterUser(user), [user]);

    useEffect(() => {
        if (!userIsCluster) {
            // Si no es Cluster, bloqueamos acceso y redirigimos
            navigate('/dashboard', { replace: true });
            return;
        }

        loadAllData();
    }, [userIsCluster, navigate]);

    const loadAllData = async () => {
        setLoading(true);
        try {
            const [dashRes, invRes] = await Promise.all([
                fetchDashboardMetrics(),
                fetchInventoryMetrics()
            ]);

            if (dashRes?.success) {
                setRawData(dashRes.data || []);
            }
            if (invRes?.success) {
                setInventoryData(invRes.data || []);
            }
            setError(null);
        } catch (err) {
            setError('Error al conectar con la API.');
        } finally {
            setLoading(false);
        }
    };

    // KPIs Dashboard Operaciones
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

    // KPIs Inventarios
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

    // Render de seguridad si no tiene permisos o si la redirección se está procesando
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
            {/* SUB-PESTAÑAS */}
            <div className="subtabs-header">
                <nav className="nav-tabs">
                    <button
                        className={`nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
                        onClick={() => setActiveTab('dashboard')}
                    >
                        Dashboard
                    </button>
                    <button
                        className={`nav-btn ${activeTab === 'graficas' ? 'active' : ''}`}
                        onClick={() => setActiveTab('graficas')}
                    >
                        Gráficas
                    </button>
                    <button
                        className={`nav-btn ${activeTab === 'inventarios' ? 'active' : ''}`}
                        onClick={() => setActiveTab('inventarios')}
                    >
                        Inventarios
                    </button>
                </nav>
            </div>

            {/* RIBBON KPI */}
            <div className="metrics-ribbon-container">
                {activeTab !== 'inventarios' ? (
                    <div className="metrics-ribbon">
                        <div className="kpi-card green">
                            <div className="kpi-value">{kpisOps.ehs}%</div>
                            <div className="kpi-label">EHS Promedio</div>
                        </div>
                        <div className="kpi-card yellow">
                            <div className="kpi-value">{kpisOps.nc}</div>
                            <div className="kpi-label">NC Abiertas</div>
                        </div>
                        <div className="kpi-card blue">
                            <div className="kpi-value">{kpisOps.pago}%</div>
                            <div className="kpi-label">Pago a Tiempo</div>
                        </div>
                        <div className="kpi-card purple">
                            <div className="kpi-value">{kpisOps.aging}d</div>
                            <div className="kpi-label">Aging Promedio</div>
                        </div>
                        <div className="kpi-card green">
                            <div className="kpi-value">${kpisOps.ahorro}M</div>
                            <div className="kpi-label">Ahorro T-MEC</div>
                        </div>
                    </div>
                ) : (
                    <div className="metrics-ribbon">
                        <div className="kpi-card blue">
                            <div className="kpi-value">{kpisInv.totalNp}</div>
                            <div className="kpi-label">Total Números de Parte</div>
                        </div>
                        <div className="kpi-card green">
                            <div className="kpi-value">{kpisInv.pctRetorno}%</div>
                            <div className="kpi-label">% Retorno Cubierto</div>
                        </div>
                        <div className="kpi-card purple">
                            <div className="kpi-value">{kpisInv.pctLimpia}%</div>
                            <div className="kpi-label">% Base de Datos Limpia</div>
                        </div>
                    </div>
                )}
            </div>

            {/* CONTENIDO PRINCIPAL */}
            <main className="main-content">
                {loading ? (
                    <div className="loading-text">Cargando información desde la base de datos...</div>
                ) : error ? (
                    <div className="error-banner">{error}</div>
                ) : (
                    <>
                        {/* PESTAÑA 1: DASHBOARD */}
                        {activeTab === 'dashboard' && (
                            <div className="data-card">
                                <div className="card-header">
                                    <span>RESUMEN CONSOLIDADO DE OPERACIONES</span>
                                    <span className="badge-count">{rawData.length} Registros</span>
                                </div>
                                <div className="table-responsive">
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>Cliente</th>
                                                <th>Período</th>
                                                <th>EHS</th>
                                                <th>Importaciones</th>
                                                <th>Exportaciones</th>
                                                <th>Incidencias</th>
                                                <th>Pago a Tiempo</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rawData.map((row, idx) => {
                                                const ehsVal = Number(row.EHS) || 0;
                                                const pagoVal = Number(row.PagoTiempo) || 0;
                                                return (
                                                    <tr key={idx}>
                                                        <td style={{ fontWeight: 600 }}>{row.Cliente || 'N/A'}</td>
                                                        <td>{row.Mes ? MONTHS[row.Mes - 1] : ''} {row.Año || ''}</td>
                                                        <td>
                                                            <span className={`status-badge ${ehsVal >= 90 ? 'success' : 'warning'}`}>
                                                                {ehsVal.toFixed(1)}%
                                                            </span>
                                                        </td>
                                                        <td>{row.Importaciones || 0}</td>
                                                        <td>{row.Exportaciones || 0}</td>
                                                        <td style={{ color: 'var(--red-status)', fontWeight: 700 }}>
                                                            {row.Incidencias || 0}
                                                        </td>
                                                        <td>{pagoVal.toFixed(0)}%</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* PESTAÑA 2: GRÁFICAS */}
                        {activeTab === 'graficas' && (
                            <div className="charts-grid">
                                <div className="chart-box">
                                    <h3 className="chart-title">Operaciones Comercio Exterior</h3>
                                    <div className="chart-wrapper">
                                        <Bar
                                            data={{
                                                labels: rawData.map(r => `${r.Mes ? MONTHS[r.Mes - 1] : ''} ${r.Año || ''}`),
                                                datasets: [
                                                    { label: 'Importaciones', data: rawData.map(r => r.Importaciones || 0), backgroundColor: '#1b365d' },
                                                    { label: 'Exportaciones', data: rawData.map(r => r.Exportaciones || 0), backgroundColor: '#2563eb' }
                                                ]
                                            }}
                                            options={{ responsive: true, maintainAspectRatio: false }}
                                        />
                                    </div>
                                </div>

                                <div className="chart-box">
                                    <h3 className="chart-title">Tendencia EHS (%)</h3>
                                    <div className="chart-wrapper">
                                        <Line
                                            data={{
                                                labels: rawData.map(r => `${r.Mes ? MONTHS[r.Mes - 1] : ''} ${r.Año || ''}`),
                                                datasets: [{
                                                    label: 'EHS %',
                                                    data: rawData.map(r => r.EHS || 0),
                                                    borderColor: '#2563eb',
                                                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                                                    fill: true
                                                }]
                                            }}
                                            options={{ responsive: true, maintainAspectRatio: false }}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* PESTAÑA 3: INVENTARIOS (SISTEMA SEER) */}
                        {activeTab === 'inventarios' && (
                            <div className="data-card">
                                <div className="card-header">
                                    <span>CONTROL DE INVENTARIOS Y NÚMEROS DE PARTE (SISTEMA SEER)</span>
                                    <span className="badge-count">{inventoryData.length} Registros</span>
                                </div>
                                <div className="table-responsive">
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>Razón Social</th>
                                                <th>Planta</th>
                                                <th>Mes / Año</th>
                                                <th>Total N/P</th>
                                                <th>Altas N/P</th>
                                                <th>Vigente BOM</th>
                                                <th>% Base Limpia</th>
                                                <th>% Retorno Cubierto</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {inventoryData.map((row) => (
                                                <tr key={row.id}>
                                                    <td style={{ fontWeight: 600 }}>{row.razon_social || 'N/A'}</td>
                                                    <td>{row.planta || 'N/A'}</td>
                                                    <td>{row.mes} {row.anio}</td>
                                                    <td>{(Number(row.total_np) || 0).toLocaleString()}</td>
                                                    <td>{(Number(row.altas_np) || 0).toLocaleString()}</td>
                                                    <td>{(Number(row.vigente_bom) || 0).toLocaleString()}</td>
                                                    <td>
                                                        <span className="status-badge success">
                                                            {(Number(row.pct_base_limpia) || 0).toFixed(1)}%
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span className="status-badge success">
                                                            {(Number(row.pct_retorno_cubierto) || 0).toFixed(1)}%
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}