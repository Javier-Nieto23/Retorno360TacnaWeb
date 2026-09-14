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

    const handlePreview = (doc) => {
        setPreview({
            open: true,
            documento: doc,
            observacion: String(doc.observaciones || '').trim(),
        });
    };

    const cerrarPreview = () => {
        setPreview({ open: false, documento: null, observacion: '' });
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

    const getPreviewType = (url = '') => {
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
                    <h1>Dashboard EXP / Control de documentación</h1>
                </div>
                <div className="inventarios-date">
                    <span>{MES_NAMES[Number(filters.mes_evaluacion || new Date().getMonth() + 1) - 1]} {filters.anio_evaluacion || new Date().getFullYear()}</span>
                </div>
            </header>

            <section className="inventarios-stats">
                <article className="inventarios-stat-card">
                    <span className="inventarios-stat-icon">📁</span>
                    <div>
                        <p className="inventarios-stat-value">{summary.total_documentos || 0}</p>
                        <p className="inventarios-stat-label">Total</p>
                    </div>
                </article>
                <article className="inventarios-stat-card">
                    <span className="inventarios-stat-icon">📦</span>
                    <div>
                        <p className="inventarios-stat-value">{summary.entregados || 0}</p>
                        <p className="inventarios-stat-label">Entregados</p>
                    </div>
                </article>
                <article className="inventarios-stat-card warning">
                    <span className="inventarios-stat-icon">⚠️</span>
                    <div>
                        <p className="inventarios-stat-value">{summary.atencion || 0}</p>
                        <p className="inventarios-stat-label">En atención</p>
                    </div>
                </article>
                <article className="inventarios-stat-card">
                    <span className="inventarios-stat-icon">✅</span>
                    <div>
                        <p className="inventarios-stat-value">{summary.terminados || 0}</p>
                        <p className="inventarios-stat-label">Terminados</p>
                    </div>
                </article>
            </section>

            <section className="inventarios-chart-card" style={{ marginTop: '24px' }}>
                <div className="inventarios-chart-header">
                    <div>
                        <h2>Filtrar documentos</h2>
                        <p>Revisión por razón social, empresa y período</p>
                    </div>
                </div>

                <div className="inventarios-filters" style={{ marginTop: '16px' }}>
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
                        <h2>Documentos en seguimiento</h2>
                        <p>Se revelan en atención según la antigüedad desde la fecha de carga</p>
                    </div>
                </div>

                {error && <p className="inventarios-error">{error}</p>}
                {success && <p className="inventarios-success">{success}</p>}

                <div className="inventarios-requests-table-wrap">
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
                                    <th>Días</th>
                                    <th>Observación</th>
                                    <th>Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {documentos.length > 0 ? documentos.map((doc) => {
                                    const diasAtencion = doc.estado === 'atencion' ? getDaysSince(doc.created_at) : 0;
                                    return (
                                        <tr key={doc.id}>
                                            <td>{doc.nombre_archivo}</td>
                                            <td>{doc.razon_social_nombre || doc.razon_social_carpeta}</td>
                                            <td>{doc.empresa_nombre || doc.empresa_carpeta}</td>
                                            <td>{doc.tipo_archivo}</td>
                                            <td>{doc.estado}</td>
                                            <td>{diasAtencion}</td>
                                            <td>{doc.observaciones || '—'}</td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                    <button className="inventarios-btn inventarios-btn-secondary" onClick={() => handlePreview(doc)}>Ver</button>
                                                    <button className="inventarios-btn inventarios-btn-primary" onClick={() => handleEstado(doc.id, 'terminado')}>Cerrar</button>
                                                    <button className="inventarios-btn inventarios-btn-filter" onClick={() => handleEstado(doc.id, 'atencion')}>Atención</button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan="8" style={{ textAlign: 'center', padding: '20px' }}>No hay documentos cargados para este filtro.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </section>

            {preview.open && preview.documento && (
                <div className="historial-preview-backdrop" onClick={cerrarPreview}>
                    <div className="historial-preview-modal" onClick={(event) => event.stopPropagation()}>
                        <div className="historial-preview-header">
                            <div>
                                <h3>{preview.documento.nombre_archivo}</h3>
                                <p>{preview.documento.razon_social_nombre || 'Razón social'} · {preview.documento.empresa_nombre || 'Empresa'}</p>
                            </div>
                            <button type="button" className="preview-close" onClick={cerrarPreview}>✕</button>
                        </div>

                        <div className="historial-preview-body">
                            {preview.documento.storage_url && getPreviewType(preview.documento.storage_url) === 'pdf' ? (
                                <object data={preview.documento.storage_url} type="application/pdf" className="historial-preview-frame">
                                    <embed src={preview.documento.storage_url} type="application/pdf" className="historial-preview-frame" />
                                </object>
                            ) : preview.documento.storage_url && getPreviewType(preview.documento.storage_url) === 'image' ? (
                                <img src={preview.documento.storage_url} alt={preview.documento.nombre_archivo} className="historial-preview-image" />
                            ) : (
                                <div className="historial-preview-placeholder">
                                    <p>Vista previa no disponible para este tipo de archivo.</p>
                                    <a href={preview.documento.storage_url} target="_blank" rel="noreferrer">Abrir archivo original</a>
                                </div>
                            )}
                        </div>

                        <div className="historial-preview-actions">
                            <label>Observaciones</label>
                            <textarea
                                value={preview.observacion}
                                rows={5}
                                placeholder="Escribe una observación nueva o modifica la actual..."
                                onChange={(e) => setPreview((prev) => ({ ...prev, observacion: e.target.value }))}
                            />

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                                <button type="button" className="historial-btn-secondary" onClick={() => handlePreviewAction('atencion')}>
                                    Enviar a atención
                                </button>
                                <button type="button" className="historial-btn-primary" onClick={() => handlePreviewAction('terminado')}>
                                    Dar por cerrado
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
