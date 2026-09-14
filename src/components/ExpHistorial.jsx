import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';

function getDaysSince(dateValue) {
    if (!dateValue) return 0;
    const target = new Date(dateValue);
    const now = new Date();
    const diffMs = now.getTime() - target.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export default function ExpHistorial() {
    const { user } = useAuth();
    const [archivos, setArchivos] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [filtroTextoRazon, setFiltroTextoRazon] = useState('');
    const [filtroTextoEmpresa, setFiltroTextoEmpresa] = useState('');
    const [previewUrl, setPreviewUrl] = useState('');
    const [previewDoc, setPreviewDoc] = useState(null);
    const [previewObservacion, setPreviewObservacion] = useState('');

    const cargarArchivos = async () => {
        setLoading(true);
        setError('');
        try {
            const token = localStorage.getItem('session_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/rgce/documentos`, {
                headers: {
                    'x-user-id': String(user?.id || ''),
                    'x-session-token': String(token || ''),
                },
            });
            const data = await response.json();
            if (!response.ok || !data?.success) throw new Error(data?.message || 'Error al cargar historial EXP');
            setArchivos(data.documentos || []);
        } catch (err) {
            setError(err.message || 'Error al cargar historial EXP');
            setArchivos([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user) cargarArchivos();
    }, [user]);

    const archivosFiltrados = useMemo(() => {
        const razon = filtroTextoRazon.trim().toLowerCase();
        const empresa = filtroTextoEmpresa.trim().toLowerCase();

        return (archivos || []).filter((archivo) => {
            const nombreRazon = String(archivo.razon_social_nombre || archivo.razon_social_carpeta || '').toLowerCase();
            const nombreEmpresa = String(archivo.empresa_nombre || archivo.empresa_carpeta || '').toLowerCase();
            const coincideRazon = !razon || nombreRazon.includes(razon);
            const coincideEmpresa = !empresa || nombreEmpresa.includes(empresa);
            return coincideRazon && coincideEmpresa;
        });
    }, [archivos, filtroTextoEmpresa, filtroTextoRazon]);

    const handleClose = async (documento) => {
        try {
            const token = localStorage.getItem('session_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/rgce/${documento.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': String(user?.id || ''),
                    'x-session-token': String(token || ''),
                },
                body: JSON.stringify({ estado: 'terminado', observaciones: documento.observaciones || 'Documento cerrado por EXP.' }),
            });
            const data = await response.json();
            if (!response.ok || !data?.success) throw new Error(data?.message || 'No se pudo cerrar el documento.');
            await cargarArchivos();
        } catch (err) {
            setError(err.message || 'No se pudo cerrar el documento.');
        }
    };

    const abrirPreview = async (documento) => {
        try {
            const token = localStorage.getItem('session_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/rgce/${documento.id}/preview`, {
                headers: {
                    'x-user-id': String(user?.id || ''),
                    'x-session-token': String(token || ''),
                },
            });
            const data = await response.json();
            if (!response.ok || !data?.success) throw new Error(data?.message || 'No se pudo cargar la vista previa.');

            setPreviewUrl(data.storageUrl || documento.storage_url || '');
            setPreviewDoc({ ...documento, storage_url: data.storageUrl || documento.storage_url || '' });
            setPreviewObservacion(String(documento.observaciones || ''));
        } catch (err) {
            setError(err.message || 'No se pudo cargar la vista previa.');
        }
    };

    const cerrarPreview = () => {
        setPreviewUrl('');
        setPreviewDoc(null);
        setPreviewObservacion('');
    };

    const handlePreviewAction = async (estado) => {
        if (!previewDoc) return;

        try {
            const token = localStorage.getItem('session_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/rgce/${previewDoc.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': String(user?.id || ''),
                    'x-session-token': String(token || ''),
                },
                body: JSON.stringify({
                    estado,
                    observaciones: previewObservacion.trim() || (estado === 'terminado' ? 'Documento cerrado por EXP.' : 'Documento enviado a atención por EXP.'),
                }),
            });
            const data = await response.json();
            if (!response.ok || !data?.success) throw new Error(data?.message || 'No se pudo actualizar el documento.');
            cerrarPreview();
            await cargarArchivos();
        } catch (err) {
            setError(err.message || 'No se pudo actualizar el documento.');
        }
    };

    const handleDownload = (url) => {
        if (!url) return;
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    const getPreviewType = (url = '') => {
        const lower = String(url).toLowerCase();
        if (lower.endsWith('.pdf')) return 'pdf';
        if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].some((ext) => lower.endsWith(ext))) return 'image';
        return 'unsupported';
    };

    return (
        <div className="historial-page">
            <div className="historial-header">
                <h1>Historial EXP</h1>
                <p className="historial-subtitle">Archivos cargados por razón social y empresa con revisión y cierre documental.</p>
            </div>

            <div className="historial-filters">
                <div className="historial-filter-group">
                    <label>Razón social</label>
                    <input type="text" value={filtroTextoRazon} onChange={(e) => setFiltroTextoRazon(e.target.value)} placeholder="Buscar razón social" />
                </div>
                <div className="historial-filter-group">
                    <label>Empresa</label>
                    <input type="text" value={filtroTextoEmpresa} onChange={(e) => setFiltroTextoEmpresa(e.target.value)} placeholder="Buscar empresa" />
                </div>
            </div>

            {error && <div className="historial-error">{error}</div>}

            {loading ? (
                <div className="historial-empty"><p>Cargando historial...</p></div>
            ) : archivosFiltrados.length === 0 ? (
                <div className="historial-empty"><span>📭</span><p>No hay archivos para mostrar.</p></div>
            ) : (
                <div className="historial-groups">
                    {archivosFiltrados.map((archivo) => (
                        <div key={archivo.id} className="historial-razon-group">
                            <div className="historial-razon-header">
                                <h2>{archivo.razon_social_nombre || archivo.razon_social_carpeta || 'Sin razón social'}</h2>
                                <span>{archivo.estado === 'terminado' ? 'Terminado' : archivo.estado === 'atencion' ? 'En atención' : archivo.estado || 'Pendiente'}</span>
                            </div>

                            <div className="historial-company-selector">
                                <label>Empresa</label>
                                <div className="historial-doc-item" style={{ display: 'block' }}>
                                    <strong>{archivo.empresa_nombre || archivo.empresa_carpeta || 'Sin empresa'}</strong>
                                </div>
                            </div>

                            <div className="historial-doc-item">
                                <div className="historial-doc-main">
                                    <div className="historial-doc-icon">📄</div>
                                    <div className="historial-doc-meta">
                                        <strong>{archivo.nombre_archivo}</strong>
                                        <span>Subido por usuario: {archivo.usuario_id || '—'}</span>
                                        <span>Estado: {archivo.estado || 'entregado'}</span>
                                        <span>Días desde carga: {getDaysSince(archivo.created_at)}</span>
                                    </div>
                                </div>

                                <div className="historial-doc-actions">
                                    <button type="button" onClick={() => handleDownload(archivo.storage_url)}>Descargar</button>
                                    <button type="button" className="secondary" onClick={() => abrirPreview(archivo)}>Observar</button>
                                    <button type="button" className="secondary" onClick={() => handleClose(archivo)}>Cerrar</button>
                                </div>
                            </div>

                            <div className="historial-preview-actions" style={{ padding: '0 0 0.5rem' }}>
                                <label>Observaciones</label>
                                <textarea value={archivo.observaciones || 'Sin observaciones'} readOnly rows={3} />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {previewUrl && previewDoc && (
                <div className="historial-preview-backdrop" onClick={cerrarPreview}>
                    <div className="historial-preview-modal" onClick={(event) => event.stopPropagation()}>
                        <div className="historial-preview-header">
                            <div>
                                <h3>{previewDoc.nombre_archivo}</h3>
                                <p>{previewDoc.razon_social_nombre || 'Razón social'} · {previewDoc.empresa_nombre || 'Empresa'}</p>
                            </div>
                            <button type="button" className="preview-close" onClick={cerrarPreview}>✕</button>
                        </div>

                        <div className="historial-preview-body">
                            {getPreviewType(previewUrl) === 'pdf' ? (
                                <object data={previewUrl} type="application/pdf" className="historial-preview-frame">
                                    <embed src={previewUrl} type="application/pdf" className="historial-preview-frame" />
                                </object>
                            ) : getPreviewType(previewUrl) === 'image' ? (
                                <img src={previewUrl} alt={previewDoc.nombre_archivo} className="historial-preview-image" />
                            ) : (
                                <div className="historial-preview-placeholder">
                                    <p>Vista previa no disponible para este tipo de archivo.</p>
                                    <a href={previewUrl} target="_blank" rel="noreferrer">Abrir archivo original</a>
                                </div>
                            )}
                        </div>

                        <div className="historial-preview-actions">
                            <label>Observaciones</label>
                            <textarea
                                value={previewObservacion}
                                rows={4}
                                onChange={(e) => setPreviewObservacion(e.target.value)}
                                placeholder="Escribe nuevas observaciones o modifica la actual..."
                            />

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
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
