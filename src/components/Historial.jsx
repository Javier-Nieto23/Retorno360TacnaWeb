import { useEffect, useMemo, useState } from 'react';
import { fileService, rgceService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import './Historial.css';

export default function Historial() {
    const { user } = useAuth();
    const [archivos, setArchivos] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [filtroTextoRazonSocial, setFiltroTextoRazonSocial] = useState('');
    const [filtroTextoEmpresa, setFiltroTextoEmpresa] = useState('');
    const [preview, setPreview] = useState({ open: false, documento: null, observacion: '' });
    const [empresaSeleccionadaPorRazon, setEmpresaSeleccionadaPorRazon] = useState({});

    const cargarArchivos = async () => {
        setLoading(true);
        setError('');

        try {
            const { data } = await rgceService.documentos();
            setArchivos(data.documentos || []);
        } catch (err) {
            setError(err.response?.data?.error || 'Error al cargar el historial RGCE.');
            setArchivos([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user) cargarArchivos();
    }, [user]);

    const archivosFiltrados = useMemo(() => {
        const textoRazon = filtroTextoRazonSocial.trim().toLowerCase();
        const textoEmpresa = filtroTextoEmpresa.trim().toLowerCase();

        return (archivos || []).filter((archivo) => {
            const razonNombre = String(archivo.razon_social_nombre || archivo.razon_social_carpeta || '').toLowerCase();
            const empresaNombre = String(archivo.empresa_nombre || archivo.empresa_carpeta || '').toLowerCase();

            const coincideRazon = !textoRazon || razonNombre.includes(textoRazon);
            const coincideEmpresa = !textoEmpresa || empresaNombre.includes(textoEmpresa);
            return coincideRazon && coincideEmpresa;
        });
    }, [archivos, filtroTextoEmpresa, filtroTextoRazonSocial]);

    const grupos = useMemo(() => {
        const map = new Map();

        archivosFiltrados.forEach((archivo) => {
            const razonKey = String(archivo.razon_social_id || archivo.razon_social_nombre || 'sin-razon');
            const razonNombre = archivo.razon_social_nombre || archivo.razon_social_carpeta || 'Sin razón social';
            const empresaKey = String(archivo.empresa_id || archivo.empresa_nombre || 'sin-empresa');
            const empresaNombre = archivo.empresa_nombre || archivo.empresa_carpeta || 'Sin empresa';

            if (!map.has(razonKey)) {
                map.set(razonKey, {
                    id: razonKey,
                    nombre: razonNombre,
                    empresas: new Map(),
                });
            }

            const razonGrupo = map.get(razonKey);
            if (!razonGrupo.empresas.has(empresaKey)) {
                razonGrupo.empresas.set(empresaKey, {
                    id: empresaKey,
                    nombre: empresaNombre,
                    archivos: [],
                });
            }

            razonGrupo.empresas.get(empresaKey).archivos.push(archivo);
        });

        return Array.from(map.values())
            .map((razon) => ({
                ...razon,
                empresas: Array.from(razon.empresas.values()).sort((a, b) => a.nombre.localeCompare(b.nombre)),
            }))
            .sort((a, b) => a.nombre.localeCompare(b.nombre));
    }, [archivosFiltrados]);

    const abrirPreview = (documento) => {
        setPreview({
            open: true,
            documento,
            observacion: documento.observaciones || '',
        });
    };

    const cerrarPreview = () => {
        setPreview({ open: false, documento: null, observacion: '' });
    };

    const handleDescargar = async (archivo) => {
        if (!archivo.storage_url) return;
        window.open(archivo.storage_url, '_blank', 'noopener,noreferrer');
    };

    const handleEliminar = async (archivo) => {
        if (!window.confirm(`¿Deseas eliminar el archivo "${archivo.nombre_archivo}"?`)) return;

        try {
            await fileService.eliminar(archivo.id);
            setArchivos((prev) => prev.filter((item) => item.id !== archivo.id));
        } catch (err) {
            alert(err.response?.data?.error || 'No se pudo eliminar el archivo.');
        }
    };

    const handleMarcarRevisado = async () => {
        if (!preview.documento) return;

        const observacion = preview.observacion.trim();

        try {
            await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/rgce/${preview.documento.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': String(user?.id || ''),
                    'x-session-token': String(localStorage.getItem('session_token') || ''),
                },
                body: JSON.stringify({
                    estado: 'revisado',
                    observaciones: observacion || 'Archivo revisado desde historial RGCE.',
                }),
            });

            setArchivos((prev) => prev.map((item) => item.id === preview.documento.id
                ? { ...item, estado: 'revisado', observaciones: observacion || 'Archivo revisado desde historial RGCE.' }
                : item));
            cerrarPreview();
        } catch (err) {
            alert(err.response?.data?.error || 'No se pudo actualizar el estado del archivo.');
        }
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
                <h1>Historial RGCE</h1>
                <p className="historial-subtitle">Archivos cargados en el bucket RGCE, organizados por razón social y empresa.</p>
            </div>

            <div className="historial-filters">
                <div className="historial-filter-group">
                    <label>Razón social</label>
                    <input
                        type="text"
                        placeholder="Buscar razón social"
                        value={filtroTextoRazonSocial}
                        onChange={(e) => setFiltroTextoRazonSocial(e.target.value)}
                    />
                </div>
                <div className="historial-filter-group">
                    <label>Empresa</label>
                    <input
                        type="text"
                        placeholder="Buscar empresa"
                        value={filtroTextoEmpresa}
                        onChange={(e) => setFiltroTextoEmpresa(e.target.value)}
                    />
                </div>
            </div>

            {error && <div className="historial-error">{error}</div>}

            {loading ? (
                <div className="historial-empty">
                    <p>Cargando historial...</p>
                </div>
            ) : grupos.length === 0 ? (
                <div className="historial-empty">
                    <span>📭</span>
                    <p>No hay archivos para mostrar.</p>
                </div>
            ) : (
                <div className="historial-groups">
                    {grupos.map((razon) => {
                        const empresaSeleccionada = empresaSeleccionadaPorRazon[razon.id] || razon.empresas[0]?.id || '';
                        const documentosEmpresa = razon.empresas.find((empresa) => empresa.id === empresaSeleccionada)?.archivos || [];

                        return (
                            <div key={razon.id} className="historial-razon-group">
                                <div className="historial-razon-header">
                                    <h2>{razon.nombre}</h2>
                                    <span>{razon.empresas.reduce((total, empresa) => total + empresa.archivos.length, 0)} archivos</span>
                                </div>

                                <div className="historial-company-selector">
                                    <label>Empresa</label>
                                    <select
                                        value={empresaSeleccionada}
                                        onChange={(e) => setEmpresaSeleccionadaPorRazon((prev) => ({ ...prev, [razon.id]: e.target.value }))}
                                    >
                                        {razon.empresas.map((empresa) => (
                                            <option key={empresa.id} value={empresa.id}>{empresa.nombre}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="historial-doc-list">
                                    {documentosEmpresa.length === 0 ? (
                                        <div className="historial-empty small">
                                            <p>No hay archivos para esta empresa.</p>
                                        </div>
                                    ) : (
                                        documentosEmpresa.map((archivo) => (
                                            <div key={archivo.id} className="historial-doc-item">
                                                <div className="historial-doc-main">
                                                    <div className="historial-doc-icon">📄</div>
                                                    <div className="historial-doc-meta">
                                                        <strong>{archivo.nombre_archivo}</strong>
                                                        <span>Empresa: {archivo.empresa_nombre || '—'}</span>
                                                        <span>Subido por: {archivo.usuario_id || '—'}</span>
                                                        <span>Estado: {archivo.estado || 'entregado'}</span>
                                                    </div>
                                                </div>

                                                <div className="historial-doc-actions">
                                                    <button type="button" onClick={() => handleDescargar(archivo)}>
                                                        Descargar
                                                    </button>
                                                    <button type="button" className="secondary" onClick={() => abrirPreview(archivo)}>
                                                        Observar
                                                    </button>
                                                    <button type="button" className="danger" onClick={() => handleEliminar(archivo)}>
                                                        Eliminar
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

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
                                <iframe
                                    src={preview.documento.storage_url}
                                    title={preview.documento.nombre_archivo}
                                    className="historial-preview-frame"
                                />
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
                            <label>Observación</label>
                            <textarea
                                value={preview.observacion}
                                rows={4}
                                placeholder="Escribe una observación para este archivo..."
                                onChange={(e) => setPreview((prev) => ({ ...prev, observacion: e.target.value }))}
                            />
                            <button type="button" className="historial-btn-primary" onClick={handleMarcarRevisado}>
                                Marcar como revisado
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
