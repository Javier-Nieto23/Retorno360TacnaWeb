import { useEffect, useState, useCallback } from 'react';
import { fileService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import './Historial.css';

const MESES_NOMBRES = [
    '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

function formatBytes(bytes) {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso) {
    return new Date(iso).toLocaleString('es-PE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

export default function Historial() {
    const { user } = useAuth();
    const [resumen, setResumen] = useState([]);
    const [archivos, setArchivos] = useState([]);
    const [filtroAnio, setFiltroAnio] = useState('');
    const [filtroMes, setFiltroMes] = useState('');
    const [loading, setLoading] = useState(false);
    const [deleting, setDeleting] = useState(null);
    const [error, setError] = useState('');

    const cargarResumen = useCallback(async () => {
        try {
            const params = user?.razon_social_id
                ? { razon_social_id: user.razon_social_id }
                : undefined;
            const { data } = await fileService.resumenHistorial(params);
            setResumen(data.resumen);
        } catch { /* silencioso */ }
    }, [user?.razon_social_id]);

    const cargarArchivos = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const params = {};
            if (filtroAnio) params.anio = filtroAnio;
            if (filtroMes) params.mes = filtroMes;
            if (user?.razon_social_id) params.razon_social_id = user.razon_social_id;
            const { data } = await fileService.historial(params);
            setArchivos(data.archivos);
        } catch (err) {
            setError(err.response?.data?.error || 'Error al cargar el historial.');
        } finally {
            setLoading(false);
        }
    }, [filtroAnio, filtroMes, user?.razon_social_id]);

    useEffect(() => { cargarResumen(); }, [cargarResumen]);
    useEffect(() => { cargarArchivos(); }, [cargarArchivos]);

    const aniosDisponibles = [...new Set(resumen.map((r) => r.anio))].sort((a, b) => b - a);
    const mesesDisponibles = filtroAnio
        ? resumen.filter((r) => String(r.anio) === String(filtroAnio)).map((r) => r.mes).sort((a, b) => a - b)
        : [];

    const handleEliminar = async (id, nombre) => {
        if (!confirm(`¿Eliminar "${nombre}"? Esta acción no se puede deshacer.`)) return;
        setDeleting(id);
        try {
            await fileService.eliminar(id);
            setArchivos((prev) => prev.filter((a) => a.id !== id));
            cargarResumen();
        } catch (err) {
            alert(err.response?.data?.error || 'Error al eliminar el archivo.');
        } finally {
            setDeleting(null);
        }
    };

    const handleAnioChange = (e) => {
        setFiltroAnio(e.target.value);
        setFiltroMes('');
    };

    return (
        <div className="historial-page">
            <div className="historial-header">
                <h1>Historial de archivos</h1>
                <p className="historial-subtitle">Todos los archivos Excel organizados por período</p>
                <p className="historial-subtitle">
                    Razón social ID: {user?.razon_social_id || '—'} · Carpeta base: {user?.r2_folder || '—'}
                </p>
            </div>

            {/* Filtros */}
            <div className="filters-bar">
                <div className="filter-group">
                    <label>Año</label>
                    <select value={filtroAnio} onChange={handleAnioChange}>
                        <option value="">Todos los años</option>
                        {aniosDisponibles.map((a) => (
                            <option key={a} value={a}>{a}</option>
                        ))}
                    </select>
                </div>
                <div className="filter-group">
                    <label>Mes</label>
                    <select value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} disabled={!filtroAnio}>
                        <option value="">Todos los meses</option>
                        {mesesDisponibles.map((m) => (
                            <option key={m} value={m}>{MESES_NOMBRES[m]}</option>
                        ))}
                    </select>
                </div>
                {(filtroAnio || filtroMes) && (
                    <button className="btn-clear-filter" onClick={() => { setFiltroAnio(''); setFiltroMes(''); }}>
                        Limpiar filtros
                    </button>
                )}
            </div>

            {/* Tabla de archivos */}
            <div className="historial-table-wrapper">
                {error && <div className="historial-error">{error}</div>}

                {loading ? (
                    <div className="historial-loading">Cargando archivos...</div>
                ) : archivos.length === 0 ? (
                    <div className="historial-empty">
                        <span>📭</span>
                        <p>No hay archivos para este período.</p>
                    </div>
                ) : (
                    <table className="historial-table">
                        <thead>
                            <tr>
                                <th>Archivo</th>
                                <th>Período</th>
                                <th>Tamaño</th>
                                <th>Subido por</th>
                                <th>Carpeta RS</th>
                                <th>Fecha de subida</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {archivos.map((a) => (
                                <tr key={a.id}>
                                    <td className="col-filename">
                                        <span className="file-icon-sm">📄</span>
                                        <span className="filename-text" title={a.nombre_archivo}>{a.nombre_archivo}</span>
                                    </td>
                                    <td className="col-period">
                                        <span className="period-pill">{MESES_NOMBRES[a.mes]} {a.anio}</span>
                                    </td>
                                    <td className="col-size">{formatBytes(a.tamano)}</td>
                                    <td className="col-user">{a.usuario_alias || '—'}</td>
                                    <td className="col-user">{a.razon_social_folder || user?.r2_folder || '—'}</td>
                                    <td className="col-date">{formatDate(a.uploaded_at)}</td>
                                    <td className="col-actions">
                                        {a.storage_url && (
                                            <a
                                                href={a.storage_url.startsWith('/uploads') ? `http://localhost:3001${a.storage_url}` : a.storage_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="btn-action btn-download"
                                                title="Descargar"
                                            >
                                                ⬇
                                            </a>
                                        )}
                                        <button
                                            className="btn-action btn-delete"
                                            onClick={() => handleEliminar(a.id, a.nombre_archivo)}
                                            disabled={deleting === a.id}
                                            title="Eliminar"
                                        >
                                            {deleting === a.id ? '...' : '🗑'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <p className="historial-count">
                {!loading && `${archivos.length} archivo${archivos.length !== 1 ? 's' : ''} encontrado${archivos.length !== 1 ? 's' : ''}`}
            </p>
        </div>
    );
}
