// src/views/DashboardCalidad.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isClusterUser, getLandingPath } from '../utils/roles';
import {
    fetchDashboardMetrics,
    fetchInventoryMetrics,
    fetchCumplimientoMetrics
} from '../services/dashboardService';
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
    const location = useLocation();

    const [rawData, setRawData] = useState([]);
    const [inventoryData, setInventoryData] = useState([]);
    const [cumplimientoData, setCumplimientoData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Identificar pestaña activa basándose ÚNICAMENTE en la URL del Navbar
    const activeTab = useMemo(() => {
        const path = location.pathname;
        if (path.includes('/graficas')) return 'graficas';
        if (path.includes('/inventarios')) return 'inventarios';
        if (path.includes('/cumplimiento')) return 'cumplimiento';
        return 'dashboard';
    }, [location.pathname]);

    // Estados para filtro por etiquetas
    const [selectedCompanies, setSelectedCompanies] = useState([]);
    const [companyInput, setCompanyInput] = useState('');

    const userIsCluster = useMemo(() => isClusterUser(user), [user]);

    useEffect(() => {
        if (!userIsCluster) {
            const targetPath = getLandingPath(user);
            navigate(targetPath, { replace: true });
            return;
        }

        loadAllData();
    }, [userIsCluster, user, navigate]);

    const loadAllData = async () => {
        setLoading(true);
        try {
            const [dashRes, invRes, cumpRes] = await Promise.all([
                fetchDashboardMetrics(),
                fetchInventoryMetrics(),
                fetchCumplimientoMetrics()
            ]);

            if (dashRes?.success) setRawData(dashRes.data || []);
            if (invRes?.success) setInventoryData(invRes.data || []);
            if (cumpRes?.success) setCumplimientoData(cumpRes.data || []);

            setError(null);
        } catch (err) {
            setError('Acceso denegado o error al conectar con la API.');
        } finally {
            setLoading(false);
        }
    };

    const handleAddCompany = (companyName) => {
        const trimmed = companyName.trim();
        if (trimmed && !selectedCompanies.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
            setSelectedCompanies([...selectedCompanies, trimmed]);
        }
        setCompanyInput('');
    };

    const handleKeyDownCompany = (e) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            handleAddCompany(companyInput);
        }
    };

    const handleRemoveCompany = (companyToRemove) => {
        setSelectedCompanies(selectedCompanies.filter(c => c !== companyToRemove));
    };

    const availableCompanies = useMemo(() => {
        const setCompanies = new Set(cumplimientoData.map(r => r.razon_social).filter(Boolean));
        return Array.from(setCompanies);
    }, [cumplimientoData]);

    const filteredCumplimiento = useMemo(() => {
        if (selectedCompanies.length === 0) return cumplimientoData;
        return cumplimientoData.filter(row =>
            selectedCompanies.some(company =>
                (row.razon_social || '').toLowerCase().includes(company.toLowerCase())
            )
        );
    }, [cumplimientoData, selectedCompanies]);

    const cumplimientoTotals = useMemo(() => {
        return filteredCumplimiento.reduce((acc, row) => {
            const pIgi = Number(row.pago_igi) || 0;
            const aIgi = Number(row.ahorro_igi) || 0;
            const cIgi = Number(row.igi_calculado ?? 0) || 0;
            const pIva = Number(row.pago_iva) || 0;
            const aIva = Number(row.ahorro_iva) || 0;
            const ops = Number(row.operaciones) || 0;

            acc.operaciones += ops;
            acc.pagoIgi += pIgi;
            acc.ahorroIgi += aIgi;
            acc.calculadoIgi += cIgi;
            acc.pagoIva += pIva;
            acc.ahorroIva += aIva;
            return acc;
        }, { operaciones: 0, pagoIgi: 0, ahorroIgi: 0, calculadoIgi: 0, pagoIva: 0, ahorroIva: 0 });
    }, [filteredCumplimiento]);

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

    const formatCurrency = (val) => {
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val || 0);
    };

    if (!userIsCluster) {
        return (
            <div className="dashboard-container" style={{ padding: '2rem', textAlign: 'center' }}>
                <h2>Acceso denegado</h2>
                <p>Solo los usuarios con rol Cluster pueden acceder a esta sección.</p>
            </div>
        );
    }

    return (
        <div className="dashboard-container">
            {/* RIBBON KPI */}
            <div className="metrics-ribbon-container">
                {activeTab === 'cumplimiento' ? (
                    <div className="metrics-ribbon">
                        <div className="kpi-card blue">
                            <div className="kpi-value">{cumplimientoTotals.operaciones.toLocaleString()}</div>
                            <div className="kpi-label">Operaciones Totales</div>
                        </div>
                        <div className="kpi-card yellow">
                            <div className="kpi-value">{formatCurrency(cumplimientoTotals.pagoIgi)}</div>
                            <div className="kpi-label">IGI Pagado Total</div>
                        </div>
                        <div className="kpi-card purple">
                            <div className="kpi-value">{formatCurrency(cumplimientoTotals.calculadoIgi)}</div>
                            <div className="kpi-label">IGI Calculado Total</div>
                        </div>
                        <div className="kpi-card green">
                            <div className="kpi-value">{formatCurrency(cumplimientoTotals.ahorroIgi + cumplimientoTotals.ahorroIva)}</div>
                            <div className="kpi-label">Ahorro Total T-MEC/IMMEX</div>
                        </div>
                    </div>
                ) : activeTab === 'inventarios' ? (
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
                ) : (
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
                        {/* PESTAÑA DASHBOARD */}
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

                        {/* PESTAÑA GRÁFICAS */}
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

                        {/* PESTAÑA INVENTARIOS */}
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




                        {/* PESTAÑA CUMPLIMIENTO */}
                        {activeTab === 'cumplimiento' && (
                            <div className="data-card">
                                <div className="card-header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '12px' }}>
                                    <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>Buscar </span>
                                        <span className="badge-count">{filteredCumplimiento.length} Registros</span>
                                    </div>

                                    <div className="tag-filter-container">
                                        <div className="tag-chips-wrapper">
                                            {selectedCompanies.map((comp, i) => (
                                                <span key={i} className="chip">
                                                    {comp}
                                                    <button type="button" onClick={() => handleRemoveCompany(comp)}>×</button>
                                                </span>
                                            ))}
                                            <input
                                                type="text"
                                                className="tag-input"
                                                placeholder={selectedCompanies.length === 0 ? "Filtrar por Razón Social..." : "Agregar otra empresa..."}
                                                value={companyInput}
                                                onChange={(e) => setCompanyInput(e.target.value)}
                                                onKeyDown={handleKeyDownCompany}
                                                list="companies-list"
                                            />
                                        </div>
                                        {selectedCompanies.length > 0 && (
                                            <button
                                                className="btn-clear-tags"
                                                onClick={() => setSelectedCompanies([])}
                                            >
                                                Limpiar Filtros
                                            </button>
                                        )}
                                        <datalist id="companies-list">
                                            {availableCompanies.map((c, idx) => (
                                                <option key={idx} value={c} />
                                            ))}
                                        </datalist>
                                    </div>
                                </div>

                                <div className="table-responsive">
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>Razón Social</th>
                                                <th>Planta</th>
                                                <th>Período</th>
                                                <th>Operaciones</th>
                                                <th>IGI Pagado</th>
                                                <th>IGI Calculado</th>
                                                <th>Ahorro IGI</th>
                                                <th>Pago IVA</th>
                                                <th>Ahorro IVA</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredCumplimiento.map((row) => {
                                                const pIgi = Number(row.pago_igi) || 0;
                                                const aIgi = Number(row.ahorro_igi) || 0;
                                                const cIgi = Number(row.igi_calculado ?? 0) || 0;
                                                const pIva = Number(row.pago_iva) || 0;
                                                const aIva = Number(row.ahorro_iva) || 0;

                                                return (
                                                    <tr key={row.id}>
                                                        <td style={{ fontWeight: 600 }}>{row.razon_social || 'N/A'}</td>
                                                        <td>{row.planta || 'N/A'}</td>
                                                        <td>{row.mes ? MONTHS[row.mes - 1] : ''} {row.anio || ''}</td>
                                                        <td>{(Number(row.operaciones) || 0).toLocaleString()}</td>
                                                        <td style={{ color: '#d97706', fontWeight: 600 }}>{formatCurrency(pIgi)}</td>
                                                        <td style={{ color: '#2563eb', fontWeight: 600 }}>{formatCurrency(cIgi)}</td>
                                                        <td style={{ color: '#059669', fontWeight: 700 }}>{formatCurrency(aIgi)}</td>
                                                        <td>{formatCurrency(pIva)}</td>
                                                        <td style={{ color: '#059669', fontWeight: 700 }}>{formatCurrency(aIva)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        {filteredCumplimiento.length > 0 && (
                                            <tfoot>
                                                <tr style={{ background: '#f8fafc', fontWeight: 700, borderTop: '2px solid #e2e8f0' }}>
                                                    <td colSpan="3">TOTALES CONSOLIDADOS</td>
                                                    <td>{cumplimientoTotals.operaciones.toLocaleString()}</td>
                                                    <td style={{ color: '#d97706' }}>{formatCurrency(cumplimientoTotals.pagoIgi)}</td>
                                                    <td style={{ color: '#2563eb' }}>{formatCurrency(cumplimientoTotals.calculadoIgi)}</td>
                                                    <td style={{ color: '#059669' }}>{formatCurrency(cumplimientoTotals.ahorroIgi)}</td>
                                                    <td>{formatCurrency(cumplimientoTotals.pagoIva)}</td>
                                                    <td style={{ color: '#059669' }}>{formatCurrency(cumplimientoTotals.ahorroIva)}</td>
                                                </tr>
                                            </tfoot>
                                        )}
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