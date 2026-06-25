import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import FileUpload from './FileUpload';
import { fileService } from '../services/api';
import { detectRazonSocialId } from '../utils/razonSocial';
import './Dashboard.css';

const MESES_NOMBRES = [
    '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export default function Dashboard() {
    const { user } = useAuth();
    const razonSocialIdDetectado = detectRazonSocialId(user);
    const [resumen, setResumen] = useState([]);
    const [loadingResumen, setLoadingResumen] = useState(true);

    const resumenGrafico = useMemo(() => {
        const years = [...new Set(resumen.map((item) => Number(item.anio)).filter(Boolean))].sort((a, b) => b - a);
        const anioSeleccionado = years[0] || new Date().getFullYear();
        const dataDelAnio = resumen.filter((item) => Number(item.anio) === anioSeleccionado);
        const mapaMeses = new Map(dataDelAnio.map((item) => [Number(item.mes), Number(item.total_archivos) || 0]));

        const meses = Array.from({ length: 12 }, (_, index) => {
            const mes = index + 1;
            const total = mapaMeses.get(mes) || 0;
            return {
                mes,
                nombre: MESES_NOMBRES[mes],
                total,
                tieneArchivos: total > 0,
            };
        });

        return {
            anioSeleccionado,
            meses,
            mesesSinArchivos: meses.filter((item) => !item.tieneArchivos),
        };
    }, [resumen]);

    const cargarResumen = async () => {
        setLoadingResumen(true);
        try {
            const { data } = await fileService.resumenHistorial();
            setResumen(data.resumen || []);
        } catch {
            // silencioso
            setResumen([]);
        } finally {
            setLoadingResumen(false);
        }
    };

    useEffect(() => { cargarResumen(); }, []);

    const totalArchivos = resumen.reduce((sum, r) => sum + (Number(r.total_archivos) || 0), 0);
    const aniosUnicos = [...new Set(resumen.map((r) => r.anio))].length;
    const maxMonthlyValue = Math.max(1, ...resumenGrafico.meses.map((item) => item.total));

    return (
        <div className="dashboard">
            <div className="dashboard-header">
                <div>
                    <h1 className="dashboard-welcome">Bienvenido, {user?.alias}</h1>
                    <p className="dashboard-rs">{user?.razon_social_nombre}</p>
                    <p className="dashboard-rs-id">ID Razón Social: {razonSocialIdDetectado}</p>
                </div>
                <div className="dashboard-date">
                    {new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
            </div>

            {/* Estadísticas rápidas */}
            <div className="stats-row">
                <div className="stat-card">
                    <span className="stat-icon">📁</span>
                    <div>
                        <p className="stat-value">{totalArchivos}</p>
                        <p className="stat-label">Archivos totales</p>
                    </div>
                </div>
                <div className="stat-card">
                    <span className="stat-icon">📅</span>
                    <div>
                        <p className="stat-value">{aniosUnicos}</p>
                        <p className="stat-label">Años registrados</p>
                    </div>
                </div>
                <div className="stat-card">
                    <span className="stat-icon">🗂️</span>
                    <div>
                        <p className="stat-value">{resumen.length}</p>
                        <p className="stat-label">Períodos con archivos</p>
                    </div>
                </div>
            </div>

            <section className="missing-months-card">
                <div className="missing-months-header">
                    <div>
                        <h2 className="section-title">Meses sin archivos cargados</h2>
                        <p className="missing-months-subtitle">
                            Distribución del año {resumenGrafico.anioSeleccionado}. Los meses en rojo no tienen archivos.
                        </p>
                    </div>
                    <span className="missing-months-legend">{resumenGrafico.mesesSinArchivos.length} sin carga</span>
                </div>

                {loadingResumen ? (
                    <div className="loading-text">Cargando gráfico...</div>
                ) : resumenGrafico.meses.every((item) => !item.tieneArchivos) ? (
                    <div className="empty-state">
                        <span>📊</span>
                        <p>Aún no hay archivos cargados para mostrar la gráfica.</p>
                    </div>
                ) : (
                    <div className="missing-months-chart" role="img" aria-label={`Gráfico de meses con y sin archivos del año ${resumenGrafico.anioSeleccionado}`}>
                        {resumenGrafico.meses.map((item) => {
                            const height = `${Math.max(8, (item.total / maxMonthlyValue) * 100)}%`;
                            const barClass = item.total >= 2 ? 'multi-files' : item.tieneArchivos ? 'has-files' : 'no-files';

                            return (
                                <div key={item.mes} className={`missing-months-column ${barClass}`}>
                                    <div className="missing-months-track">
                                        <div className="missing-months-fill" style={{ height }} />
                                    </div>
                                    <span className="missing-months-value">{item.tieneArchivos ? `${item.total}` : '0'}</span>
                                    <span className="missing-months-label">{item.nombre}</span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* Upload + resumen reciente */}
            <div className="dashboard-body">
                <div className="upload-section">
                    <FileUpload onUploadSuccess={cargarResumen} />
                </div>

                <div className="recent-section">
                    <h2 className="section-title">Períodos registrados</h2>
                    <p className="section-meta">Historial de la razón social ID: {razonSocialIdDetectado}</p>
                    {loadingResumen ? (
                        <div className="loading-text">Cargando...</div>
                    ) : resumen.length === 0 ? (
                        <div className="empty-state">
                            <span>📭</span>
                            <p>No hay archivos subidos aún.</p>
                        </div>
                    ) : (
                        <div className="period-list">
                            {resumen.map((r) => (
                                <div key={`${r.anio}-${r.mes}`} className="period-item">
                                    <div className="period-badge">
                                        <span className="period-month">{MESES_NOMBRES[r.mes]}</span>
                                        <span className="period-year">{r.anio}</span>
                                    </div>
                                    <span className="period-count">{r.total_archivos} archivo{r.total_archivos !== '1' ? 's' : ''}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
