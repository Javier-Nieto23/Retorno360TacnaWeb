import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import FileUpload from './FileUpload';
import { fileService } from '../services/api';
import './Dashboard.css';

const MESES_NOMBRES = [
    '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export default function Dashboard() {
    const { user } = useAuth();
    const [resumen, setResumen] = useState([]);
    const [loadingResumen, setLoadingResumen] = useState(true);

    const cargarResumen = async () => {
        setLoadingResumen(true);
        try {
            const { data } = await fileService.resumenHistorial();
            setResumen(data.resumen);
        } catch {
            // silencioso
        } finally {
            setLoadingResumen(false);
        }
    };

    useEffect(() => { cargarResumen(); }, []);

    const totalArchivos = resumen.reduce((sum, r) => sum + parseInt(r.total_archivos), 0);
    const aniosUnicos = [...new Set(resumen.map((r) => r.anio))].length;

    return (
        <div className="dashboard">
            <div className="dashboard-header">
                <div>
                    <h1 className="dashboard-welcome">Bienvenido, {user?.alias}</h1>
                    <p className="dashboard-rs">{user?.razon_social_nombre}</p>
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

            {/* Upload + resumen reciente */}
            <div className="dashboard-body">
                <div className="upload-section">
                    <FileUpload onUploadSuccess={cargarResumen} />
                </div>

                <div className="recent-section">
                    <h2 className="section-title">Períodos registrados</h2>
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
