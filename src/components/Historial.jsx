import { useEffect, useMemo, useState } from 'react';
import { fileService, rgceService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import './Historial.css';

function formatDateTime(value) {
    if (!value) return '—';
    return new Date(value).toLocaleString('es-PE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatPeriodLabel(anio, mes) {
    if (!anio && !mes) return '—';
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${monthNames[Number(mes) - 1] || '—'} ${anio || ''}`.trim();
}

export default function Historial() {
    const { user } = useAuth();
    const [archivos, setArchivos] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [filtroTextoRazonSocial, setFiltroTextoRazonSocial] = useState('');
    const [filtroTextoEmpresa, setFiltroTextoEmpresa] = useState('');
    const [preview, setPreview] = useState({ open: false, documento: null, observacion: '' });
    const [empresaSeleccionadaPorRazon, setEmpresaSeleccionadaPorRazon] = useState({});
    const isAdminHistory = Boolean(user && (String(user.rol_nombre || '').toLowerCase() === 'admin' || user.is_admin));

    const cargarArchivos = async () => {
        setLoading(true);
        setError('');

        try {
            const { data } = isAdminHistory
                ? await fileService.historial()
                : await rgceService.documentos();

            setArchivos(isAdminHistory ? (data?.archivos || []) : (data?.documentos || []));
        } catch (err) {
            setError(err.response?.data?.error || (isAdminHistory ? 'Error al cargar el historial del administrador.' : 'Error al cargar el historial RGCE.'));
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

    const historialAdmin = useMemo(() => {
        const normalized = Array.isArray(archivosFiltrados) ? archivosFiltrados : [];
        return {
            inventarios: normalized.filter((archivo) => {
                const bucketContext = String(archivo?.bucket_context || 'inventory').toLowerCase();
                return bucketContext === 'inventory' || bucketContext === 'inventario';
            }),
            auditoria: normalized.filter((archivo) => {
                const bucketContext = String(archivo?.bucket_context || '').toLowerCase();
                return bucketContext === 'audit' || bucketContext === 'auditoria';
            }),
        };
    }, [archivosFiltrados]);

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

    const abrirPreview = async (documento) => {
        try {
            if (isAdminHistory) {
                const { data } = await fileService.obtenerUrlDescarga(documento.id);
                const resolvedUrl = data?.download_url || documento.storage_url || '';
                setPreview({
                    open: true,
                    documento: { ...documento, storage_url: resolvedUrl },
                    observacion: documento.observaciones || '',
                });
                return;
            }

            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/rgce/${documento.id}/preview`, {
                headers: {
                    'x-user-id': String(user?.id || ''),
                    'x-session-token': String(localStorage.getItem('session_token') || ''),
                },
            });
            const data = await response.json();
            if (!response.ok || !data?.success) throw new Error(data?.message || 'No se pudo cargar la vista previa.');

            setPreview({
                open: true,
                documento: { ...documento, storage_url: data.downloadUrl || data.storageUrl || documento.storage_url || '' },
                observacion: documento.observaciones || '',
            });
        } catch (err) {
            setError(err.message || 'No se pudo cargar la vista previa.');
        }
    };

    const cerrarPreview = () => {
        setPreview({ open: false, documento: null, observacion: '' });
    };

    const handleDescargar = async (archivo) => {
        try {
            if (isAdminHistory) {
                const { data } = await fileService.obtenerUrlDescarga(archivo.id);
                window.open(data?.download_url || archivo.storage_url || '', '_blank', 'noopener,noreferrer');
                return;
            }

            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/rgce/${archivo.id}/download-url`, {
                headers: {
                    'x-user-id': String(user?.id || ''),
                    'x-session-token': String(localStorage.getItem('session_token') || ''),
                },
            });
            const data = await response.json();
            if (!response.ok || !data?.success) throw new Error(data?.message || 'No se pudo generar la URL de descarga.');
            window.open(data.download_url || archivo.storage_url, '_blank', 'noopener,noreferrer');
        } catch (err) {
            setError(err.message || 'No se pudo descargar el archivo.');
        }
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

        if (isAdminHistory) {
            cerrarPreview();
            return;
        }

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
        if (lower.includes('pdf') || lower.includes('image')) return lower.includes('pdf') ? 'pdf' : 'image';
        return 'unsupported';
    };


    return (
        <div className="historial-page">
            <div className="historial-header">
                {isAdminHistory ? (
                    <>
                        <h1>Historial de archivos</h1>
                        <p className="historial-subtitle">Separado por inventarios y documentos de auditoría para administradores.</p>
                    </>
                ) : (
                    <>
                        <h1>Historial RGCE</h1>
                        <p className="historial-subtitle">Archivos cargados en el bucket RGCE, organizados por razón social y empresa.</p>
                    </>
                )}
            </div>

            {isAdminHistory ? (
                <>
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

                    <div className="admin-historial-layout">
                        <div className="admin-historial-card inventory">
                            <div className="admin-historial-card-header">
                                <div>
                                    <span className="admin-historial-kicker">Inventario</span>
                                    <h2>Inventarios</h2>
                                </div>
                                <span className="admin-historial-pill">{historialAdmin.inventarios.length} archivos</span>
                            </div>
                            <div className="admin-historial-row">
                                <span className="admin-historial-tag">Stock</span>
                                <span className="admin-historial-muted">Última carga: {formatDateTime(historialAdmin.inventarios[0]?.uploaded_at || '')}</span>
                            </div>
                            {historialAdmin.inventarios.length === 0 ? (
                                <p className="admin-historial-empty">No hay archivos de inventario para este filtro.</p>
                            ) : (
                                <div className="admin-historial-table-wrap">
                                    <table className="admin-historial-table">
                                        <thead>
                                            <tr>
                                                <th>Archivo</th>
                                                <th>Empresa</th>
                                                <th>Razón social</th>
                                                <th>Período</th>
                                                <th>Fecha</th>
                                                <th>Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {historialAdmin.inventarios.map((archivo) => (
                                                <tr key={archivo.id}>
                                                    <td>{archivo.nombre_archivo || 'Archivo sin nombre'}</td>
                                                    <td>{archivo.empresa_nombre || '—'}</td>
                                                    <td>{archivo.razon_social_nombre || '—'}</td>
                                                    <td>{formatPeriodLabel(archivo.anio, archivo.mes)}</td>
                                                    <td>{formatDateTime(archivo.uploaded_at)}</td>
                                                    <td>
                                                        <div className="historial-doc-actions">
                                                            <button type="button" onClick={() => handleDescargar(archivo)}>Descargar</button>
                                                            <button type="button" className="secondary" onClick={() => abrirPreview(archivo)}>Vista previa</button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        <div className="admin-historial-card audit">
                            <div className="admin-historial-card-header">
                                <div>
                                    <span className="admin-historial-kicker">Auditoría</span>
                                    <h2>Documentos de auditoría</h2>
                                </div>
                                <span className="admin-historial-pill alt">{historialAdmin.auditoria.length} archivos</span>
                            </div>
                            <div className="admin-historial-row">
                                <span className="admin-historial-tag alt">Documentos</span>
                                <span className="admin-historial-muted">Última revisión: {formatDateTime(historialAdmin.auditoria[0]?.uploaded_at || '')}</span>
                            </div>
                            {historialAdmin.auditoria.length === 0 ? (
                                <p className="admin-historial-empty">No hay documentos de auditoría para este filtro.</p>
                            ) : (
                                <div className="admin-historial-table-wrap">
                                    <table className="admin-historial-table">
                                        <thead>
                                            <tr>
                                                <th>Archivo</th>
                                                <th>Empresa</th>
                                                <th>Razón social</th>
                                                <th>Período</th>
                                                <th>Fecha</th>
                                                <th>Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {historialAdmin.auditoria.map((archivo) => (
                                                <tr key={archivo.id}>
                                                    <td>{archivo.nombre_archivo || 'Archivo sin nombre'}</td>
                                                    <td>{archivo.empresa_nombre || '—'}</td>
                                                    <td>{archivo.razon_social_nombre || '—'}</td>
                                                    <td>{formatPeriodLabel(archivo.anio, archivo.mes)}</td>
                                                    <td>{formatDateTime(archivo.uploaded_at)}</td>
                                                    <td>
                                                        <div className="historial-doc-actions">
                                                            <button type="button" onClick={() => handleDescargar(archivo)}>Descargar</button>
                                                            <button type="button" className="secondary" onClick={() => abrirPreview(archivo)}>Vista previa</button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            ) : (
                <>
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
                </>
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
                                <object
                                    data={preview.documento.storage_url}
                                    type="application/pdf"
                                    className="historial-preview-frame"
                                >
                                    <embed
                                        src={preview.documento.storage_url}
                                        type="application/pdf"
                                        className="historial-preview-frame"
                                    />
                                    <div className="historial-preview-placeholder">
                                        <p>Tu navegador no pudo mostrar la vista previa del PDF.</p>
                                        <a href={preview.documento.storage_url} target="_blank" rel="noreferrer">Abrir archivo original</a>
                                    </div>
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

                        {!isAdminHistory ? (
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
                        ) : (
                            <div className="historial-preview-actions">
                                <div className="historial-doc-actions" style={{ justifyContent: 'flex-end' }}>
                                    <button type="button" onClick={() => handleDescargar(preview.documento)}>Descargar</button>
                                    <button type="button" className="secondary" onClick={cerrarPreview}>Cerrar</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
