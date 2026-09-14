import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';

const MES_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

function getDaysSince(dateValue) {
    if (!dateValue) return 0;
    const target = new Date(dateValue);
    const today = new Date();
    const diffMs = today.getTime() - target.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export default function ExpDashboard() {
    const { user } = useAuth();
    const [documentos, setDocumentos] = useState([]);
    const [summary, setSummary] = useState({ total_documentos: 0, entregados: 0, en_revision: 0, observados: 0, terminados: 0, atencion: 0 });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [filters, setFilters] = useState({ razon_social_id: '', empresa_id: '', mes_evaluacion: new Date().getMonth() + 1, anio_evaluacion: new Date().getFullYear() });
    const [catalogo, setCatalogo] = useState({ razones_sociales: [], empresas: [] });
    const [dashboardSearch, setDashboardSearch] = useState('');
    const [preview, setPreview] = useState({ open: false, documento: null, observacion: '' });

    const cargarCatalogo = async () => {
        try {
            const token = localStorage.getItem('session_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/rgce/catalogo`, {
                headers: { 'x-user-id': String(user?.id || ''), 'x-session-token': String(token || '') },
            });
            const data = await response.json();
            if (!data?.success) return;
            setCatalogo({ razones_sociales: data.razones_sociales || [], empresas: data.empresas || [] });
        } catch {
            setCatalogo({ razones_sociales: [], empresas: [] });
        }
    };

    const cargarDashboard = async () => {
        try {
            setLoading(true);
            setError('');
            const query = new URLSearchParams();
            if (filters.razon_social_id) query.append('razon_social_id', filters.razon_social_id);
            if (filters.empresa_id) query.append('empresa_id', filters.empresa_id);
            if (filters.mes_evaluacion) query.append('mes_evaluacion', filters.mes_evaluacion);
            if (filters.anio_evaluacion) query.append('anio_evaluacion', filters.anio_evaluacion);

            const token = localStorage.getItem('session_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/rgce/dashboard?${query.toString()}`, {
                headers: { 'x-user-id': String(user?.id || ''), 'x-session-token': String(token || '') },
            });
            const data = await response.json();
            if (!response.ok || !data?.success) throw new Error(data?.message || 'No se pudo cargar el dashboard EXP');
            setSummary(data.summary || { total_documentos: 0, entregados: 0, en_revision: 0, observados: 0, terminados: 0, atencion: 0 });
            setDocumentos(data.documentos || []);
        } catch (err) {
            setError(err.message || 'Error al cargar documentos EXP');
            setDocumentos([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user) {
            cargarCatalogo();
            cargarDashboard();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const empresasDisponibles = useMemo(() => {
        if (!filters.razon_social_id) return catalogo.empresas || [];
        return (catalogo.empresas || []).filter((empresa) => String(empresa.id_razon) === String(filters.razon_social_id));
    }, [catalogo.empresas, filters.razon_social_id]);

    const documentosFiltrados = useMemo(() => {
        const texto = dashboardSearch.trim().toLowerCase();
        if (!texto) return documentos;

        return (documentos || []).filter((doc) => {
            const razon = String(doc.razon_social_nombre || doc.razon_social_carpeta || '').toLowerCase();
            const empresa = String(doc.empresa_nombre || doc.empresa_carpeta || '').toLowerCase();
            return razon.includes(texto) || empresa.includes(texto);
        });
    }, [dashboardSearch, documentos]);

    const estadoChart = [
        { label: 'Entregados', value: documentosFiltrados.filter((d) => String(d.estado).toLowerCase() === 'entregado').length },
        { label: 'En atención', value: documentosFiltrados.filter((d) => String(d.estado).toLowerCase() === 'atencion').length },
        { label: 'Cerrados', value: documentosFiltrados.filter((d) => String(d.estado).toLowerCase() === 'terminado').length },
        { label: 'Observados', value: documentosFiltrados.filter((d) => String(d.estado).toLowerCase() === 'observado').length },
    ];

    const tipoChart = useMemo(() => {
        const counts = {};
        for (const doc of documentosFiltrados) {
            const tipo = doc.tipo_archivo || 'Sin tipo';
            counts[tipo] = (counts[tipo] || 0) + 1;
        }

        return Object.entries(counts)
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);
    }, [documentosFiltrados]);

    const razonChart = useMemo(() => {
        const counts = {};
        for (const doc of documentosFiltrados) {
            const razon = doc.razon_social_nombre || doc.razon_social_carpeta || 'Sin razón social';
            counts[razon] = (counts[razon] || 0) + 1;
        }

        return Object.entries(counts)
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);
    }, [documentosFiltrados]);

    const maxChartValue = (items) => Math.max(1, ...items.map((item) => item.value));

    const handleEstado = async (documentoId, estado) => {
        try {
            const token = localStorage.getItem('session_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/rgce/${documentoId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': String(user?.id || ''),
                    'x-session-token': String(token || ''),
                },
                body: JSON.stringify({ estado }),
            });
            const data = await response.json();
            if (!response.ok || !data?.success) throw new Error(data?.message || 'No se pudo actualizar el documento.');
            setSuccess(estado === 'terminado' ? 'Documento cerrado correctamente.' : 'Documento enviado a atención.');
            await cargarDashboard();
        } catch (err) {
            setError(err.message || 'No se pudo cambiar el estado del documento.');
        }
    };

    const handleDownload = (doc) => {
        if (!doc.storage_url) return;
        window.open(doc.storage_url, '_blank', 'noopener,noreferrer');
    };

    const handlePreview = async (doc) => {
        try {
            const token = localStorage.getItem('session_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/rgce/${doc.id}/preview`, {
                headers: {
                    'x-user-id': String(user?.id || ''),
                    'x-session-token': String(token || ''),
                },
            });
            const data = await response.json();
            if (!response.ok || !data?.success) throw new Error(data?.message || 'No se pudo cargar la vista previa.');

            setPreview({
                open: true,
                documento: { ...doc, storage_url: data.storageUrl || doc.storage_url },
                observacion: String(doc.observaciones || '').trim(),
                metadata: data,
            });
        } catch (err) {
            setError(err.message || 'No se pudo cargar la vista previa.');
        }
    };

    const cerrarPreview = () => {
        setPreview({ open: false, documento: null, observacion: '', metadata: null });
    };

    const handlePreviewAction = async (estado) => {
        if (!preview.documento) return;

        const observacion = preview.observacion.trim();

        try {
            const token = localStorage.getItem('session_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/rgce/${preview.documento.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': String(user?.id || ''),
                    'x-session-token': String(token || ''),
                },
                body: JSON.stringify({
                    estado,
                    observaciones: observacion || (estado === 'terminado' ? 'Documento cerrado por EXP.' : 'Documento enviado a atención por EXP.'),
                }),
            });
            const data = await response.json();
            if (!response.ok || !data?.success) throw new Error(data?.message || 'No se pudo actualizar el documento.');
            setSuccess(estado === 'terminado' ? 'Documento cerrado correctamente.' : 'Documento enviado a atención.');
            cerrarPreview();
            await cargarDashboard();
        } catch (err) {
            setError(err.message || 'No se pudo actualizar el documento.');
        }
    };

    const getPreviewType = (url = '', forcedType = '') => {
        if (forcedType) return forcedType;
        const lower = String(url).toLowerCase();
        if (lower.endsWith('.pdf')) return 'pdf';
        if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].some((ext) => lower.endsWith(ext))) return 'image';
        return 'unsupported';
    };

    return (
        <div className="inventarios-page">
            <header className="inventarios-header">
                <div>
                    <p className="inventarios-eyebrow">Rol EXP</p>
                    <h1>Dashboard EXP / Resumen documental</h1>
                </div>
                <div className="inventarios-date">
                    <span>{MES_NAMES[Number(filters.mes_evaluacion || new Date().getMonth() + 1) - 1]} {filters.anio_evaluacion || new Date().getFullYear()}</span>
                </div>
            </header>

            <section className="inventarios-stats">
                <article className="inventarios-stat-card">
                    <span className="inventarios-stat-icon">📁</span>
                    <div>
                        <p className="inventarios-stat-value">{documentosFiltrados.length}</p>
                        <p className="inventarios-stat-label">Total</p>
                    </div>
                </article>
                <article className="inventarios-stat-card">
                    <span className="inventarios-stat-icon">📦</span>
                    <div>
                        <p className="inventarios-stat-value">{documentosFiltrados.filter((d) => String(d.estado).toLowerCase() === 'entregado').length}</p>
                        <p className="inventarios-stat-label">Entregados</p>
                    </div>
                </article>
                <article className="inventarios-stat-card warning">
                    <span className="inventarios-stat-icon">⚠️</span>
                    <div>
                        <p className="inventarios-stat-value">{documentosFiltrados.filter((d) => String(d.estado).toLowerCase() === 'atencion').length}</p>
                        <p className="inventarios-stat-label">En atención</p>
                    </div>
                </article>
                <article className="inventarios-stat-card">
                    <span className="inventarios-stat-icon">✅</span>
                    <div>
                        <p className="inventarios-stat-value">{documentosFiltrados.filter((d) => String(d.estado).toLowerCase() === 'terminado').length}</p>
                        <p className="inventarios-stat-label">Cerrados</p>
                    </div>
                </article>
            </section>

            <section className="inventarios-chart-card" style={{ marginTop: '24px' }}>
                <div className="inventarios-chart-header">
                    <div>
                        <h2>Filtrar documentos</h2>
                        <p>Resumen general por razón social, empresa y período</p>
                    </div>
                </div>

                <div className="inventarios-filters" style={{ marginTop: '16px' }}>
                    <div className="inventarios-filter-group" style={{ flex: '1 1 250px' }}>
                        <label>Texto de búsqueda</label>
                        <input
                            type="text"
                            value={dashboardSearch}
                            onChange={(e) => setDashboardSearch(e.target.value)}
                            placeholder="Buscar razón social o empresa"
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
                        />
                    </div>

                    <div className="inventarios-filter-group">
                        <label>Razón social</label>
                        <select value={filters.razon_social_id} onChange={(e) => setFilters((prev) => ({ ...prev, razon_social_id: e.target.value, empresa_id: '' }))}>
                            <option value="">Todas</option>
                            {(catalogo.razones_sociales || []).map((rs) => (
                                <option key={rs.id} value={rs.id}>{rs.nombre}</option>
                            ))}
                        </select>
                    </div>

                    <div className="inventarios-filter-group">
                        <label>Empresa</label>
                        <select value={filters.empresa_id} onChange={(e) => setFilters((prev) => ({ ...prev, empresa_id: e.target.value }))}>
                            <option value="">Todas</option>
                            {empresasDisponibles.map((empresa) => (
                                <option key={empresa.id} value={empresa.id}>{empresa.nombre}</option>
                            ))}
                        </select>
                    </div>

                    <div className="inventarios-filter-group">
                        <label>Mes</label>
                        <select value={filters.mes_evaluacion} onChange={(e) => setFilters((prev) => ({ ...prev, mes_evaluacion: e.target.value }))}>
                            {MES_NAMES.map((mes, idx) => (
                                <option key={mes} value={idx + 1}>{mes}</option>
                            ))}
                        </select>
                    </div>

                    <div className="inventarios-filter-group">
                        <label>Año</label>
                        <select value={filters.anio_evaluacion} onChange={(e) => setFilters((prev) => ({ ...prev, anio_evaluacion: e.target.value }))}>
                            {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map((year) => (
                                <option key={year} value={year}>{year}</option>
                            ))}
                        </select>
                    </div>

                    <div className="inventarios-filter-actions">
                        <button className="inventarios-btn inventarios-btn-filter" onClick={cargarDashboard}>Aplicar</button>
                    </div>
                </div>
            </section>

            <section className="inventarios-requests-card" style={{ marginTop: '24px' }}>
                <div className="inventarios-requests-header">
                    <div>
                        <h2>Indicadores por tipo de documento</h2>
                        <p>Gráficos del volumen total, por estado y por razón social</p>
                    </div>
                </div>

                {error && <p className="inventarios-error">{error}</p>}
                {success && <p className="inventarios-success">{success}</p>}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '18px', marginTop: '20px' }}>
                    <div className="inventarios-chart-card" style={{ padding: '18px' }}>
                        <h3 style={{ marginBottom: '12px' }}>Estados</h3>
                        {estadoChart.map((item) => (
                            <div key={item.label} style={{ marginBottom: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '13px' }}>
                                    <span>{item.label}</span>
                                    <strong>{item.value}</strong>
                                </div>
                                <div style={{ height: '8px', background: '#edf1f7', borderRadius: '999px', overflow: 'hidden' }}>
                                    <div style={{ width: `${(item.value / maxChartValue(estadoChart)) * 100}%`, height: '100%', background: '#1d4ed8', borderRadius: '999px' }} />
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="inventarios-chart-card" style={{ padding: '18px' }}>
                        <h3 style={{ marginBottom: '12px' }}>Tipos de documento</h3>
                        {tipoChart.map((item) => (
                            <div key={item.label} style={{ marginBottom: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '13px' }}>
                                    <span>{item.label}</span>
                                    <strong>{item.value}</strong>
                                </div>
                                <div style={{ height: '8px', background: '#edf1f7', borderRadius: '999px', overflow: 'hidden' }}>
                                    <div style={{ width: `${(item.value / maxChartValue(tipoChart)) * 100}%`, height: '100%', background: '#10b981', borderRadius: '999px' }} />
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="inventarios-chart-card" style={{ padding: '18px' }}>
                        <h3 style={{ marginBottom: '12px' }}>Razones sociales</h3>
                        {razonChart.map((item) => (
                            <div key={item.label} style={{ marginBottom: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '13px' }}>
                                    <span>{item.label}</span>
                                    <strong>{item.value}</strong>
                                </div>
                                <div style={{ height: '8px', background: '#edf1f7', borderRadius: '999px', overflow: 'hidden' }}>
                                    <div style={{ width: `${(item.value / maxChartValue(razonChart)) * 100}%`, height: '100%', background: '#f59e0b', borderRadius: '999px' }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="inventarios-requests-table-wrap" style={{ marginTop: '24px' }}>
                    {loading ? (
                        <p>Cargando...</p>
                    ) : (
                        <table className="inventarios-requests-table">
                            <thead>
                                <tr>
                                    <th>Archivo</th>
                                    <th>Razón social</th>
                                    <th>Empresa</th>
                                    <th>Tipo</th>
                                    <th>Estado</th>
                                    <th>Observación</th>
                                </tr>
                            </thead>
                            <tbody>
                                {documentosFiltrados.length > 0 ? documentosFiltrados.map((doc) => (
                                    <tr key={doc.id}>
                                        <td>{doc.nombre_archivo}</td>
                                        <td>{doc.razon_social_nombre || doc.razon_social_carpeta}</td>
                                        <td>{doc.empresa_nombre || doc.empresa_carpeta}</td>
                                        <td>{doc.tipo_archivo}</td>
                                        <td>{doc.estado}</td>
                                        <td>{doc.observaciones || '—'}</td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan="6" style={{ textAlign: 'center', padding: '20px' }}>No hay documentos para este filtro.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </section>
        </div>
    );
}
