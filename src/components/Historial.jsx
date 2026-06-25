import { useEffect, useState, useCallback } from 'react';
import { adminService, fileService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { detectRazonSocialId } from '../utils/razonSocial';
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
    const roleName = String(user?.rol_nombre || '').toLowerCase();
    const isAdmin = roleName === 'admin' || user?.is_admin;
    const isInventarios = roleName === 'inventarios';
    const isCliente = roleName === 'cliente' || roleName === 'clientes';
    const canDeleteDirectly = isAdmin || isInventarios;
    const canFilterByCatalog = isAdmin || isInventarios;

    const [resumen, setResumen] = useState([]);
    const [archivos, setArchivos] = useState([]);
    const [catalogo, setCatalogo] = useState({ razones_sociales: [], empresas: [] });
    const [filtroAnio, setFiltroAnio] = useState('');
    const [filtroMes, setFiltroMes] = useState('');
    const [filtroRazonSocial, setFiltroRazonSocial] = useState('');
    const [filtroEmpresa, setFiltroEmpresa] = useState('');
    const [loading, setLoading] = useState(false);
    const [deleting, setDeleting] = useState(null);
    const [downloading, setDownloading] = useState(null);
    const [requestingDelete, setRequestingDelete] = useState(null);
    const [deleteRequestModal, setDeleteRequestModal] = useState({
        open: false,
        id: null,
        nombre: '',
        razonSocialId: '—',
        motivo: '',
    });
    const [deleteConfirmModal, setDeleteConfirmModal] = useState({
        open: false,
        id: null,
        nombre: '',
    });
    const [deleteRequestFeedbackModal, setDeleteRequestFeedbackModal] = useState({
        open: false,
        success: true,
        title: '',
        message: '',
        nombre: '',
    });
    const [error, setError] = useState('');

    const cargarCatalogoFiltros = useCallback(async () => {
        try {
            if (isAdmin) {
                const { data } = await adminService.catalogo();
                setCatalogo({
                    razones_sociales: data.razones_sociales || [],
                    empresas: data.empresas || [],
                });
                return;
            }

            if (isInventarios) {
                const razonesRes = await fileService.razonesSocialesDisponibles();
                const razones = razonesRes.data?.razones_sociales || [];
                const empresasRes = await fileService.empresasDisponibles(
                    filtroRazonSocial ? { razon_social_id: filtroRazonSocial } : undefined
                );
                const empresas = empresasRes.data?.empresas || [];

                setCatalogo({
                    razones_sociales: razones,
                    empresas,
                });
            }
        } catch {
            // silencioso
        }
    }, [filtroRazonSocial, isAdmin, isInventarios]);

    const cargarResumen = useCallback(async () => {
        try {
            const params = {};

            if (canFilterByCatalog) {
                if (filtroRazonSocial) params.razon_social_id = filtroRazonSocial;
                if (filtroEmpresa) params.empresa_id = filtroEmpresa;
            } else if (user?.razon_social_id) {
                params.razon_social_id = user.razon_social_id;
            }

            const { data } = await fileService.resumenHistorial(params);
            setResumen(data.resumen);
        } catch { /* silencioso */ }
    }, [canFilterByCatalog, filtroEmpresa, filtroRazonSocial, user?.razon_social_id]);

    const cargarArchivos = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const params = {};
            if (filtroAnio) params.anio = filtroAnio;
            if (filtroMes) params.mes = filtroMes;

            if (canFilterByCatalog) {
                if (filtroRazonSocial) params.razon_social_id = filtroRazonSocial;
                if (filtroEmpresa) params.empresa_id = filtroEmpresa;
            } else if (user?.razon_social_id) {
                params.razon_social_id = user.razon_social_id;
            }

            const { data } = await fileService.historial(params);
            setArchivos(data.archivos);
        } catch (err) {
            setError(err.response?.data?.error || 'Error al cargar el historial.');
        } finally {
            setLoading(false);
        }
    }, [canFilterByCatalog, filtroAnio, filtroEmpresa, filtroMes, filtroRazonSocial, user?.razon_social_id]);

    useEffect(() => { cargarCatalogoFiltros(); }, [cargarCatalogoFiltros]);
    useEffect(() => { cargarResumen(); }, [cargarResumen]);
    useEffect(() => { cargarArchivos(); }, [cargarArchivos]);

    useEffect(() => {
        if (!canFilterByCatalog) return;

        if (!filtroRazonSocial) {
            setFiltroEmpresa('');
        }
    }, [canFilterByCatalog, filtroRazonSocial]);

    const aniosDisponibles = [...new Set(resumen.map((r) => r.anio))].sort((a, b) => b - a);
    const mesesDisponibles = filtroAnio
        ? resumen.filter((r) => String(r.anio) === String(filtroAnio)).map((r) => r.mes).sort((a, b) => a - b)
        : [];

    const empresasDisponibles = canFilterByCatalog
        ? (isAdmin
            ? (filtroRazonSocial
                ? catalogo.empresas.filter((e) => String(e.razon_social_id) === String(filtroRazonSocial))
                : catalogo.empresas)
            : catalogo.empresas)
        : [];

    const getRazonSocialNombre = (archivo) => {
        if (archivo?.razon_social_nombre) {
            return archivo.razon_social_nombre;
        }

        const razonSocialId = detectRazonSocialId(archivo, filtroRazonSocial, user);
        if (razonSocialId === '—') {
            return '—';
        }

        const razonSocial = (catalogo.razones_sociales || []).find(
            (item) => String(item.id) === String(razonSocialId)
        );

        return razonSocial?.nombre || '—';
    };

    const motivoValidoSolicitud = deleteRequestModal.motivo.trim().length > 0;
    const razonSocialIdDetectado = detectRazonSocialId(filtroRazonSocial, user);

    const cerrarModalSolicitud = () => {
        setDeleteRequestModal({ open: false, id: null, nombre: '', razonSocialId: '—', motivo: '' });
    };

    const abrirModalSolicitud = (archivo) => {
        setDeleteRequestModal({
            open: true,
            id: archivo.id,
            nombre: archivo.nombre_archivo,
            razonSocialId: detectRazonSocialId(archivo, filtroRazonSocial, user),
            motivo: '',
        });
    };

    const cerrarModalEliminar = () => {
        setDeleteConfirmModal({ open: false, id: null, nombre: '' });
    };

    const abrirModalEliminar = (archivo) => {
        setDeleteConfirmModal({
            open: true,
            id: archivo.id,
            nombre: archivo.nombre_archivo,
        });
    };

    const cerrarModalSolicitudExitosa = () => {
        setDeleteRequestFeedbackModal({
            open: false,
            success: true,
            title: '',
            message: '',
            nombre: '',
        });
    };

    const handleEliminar = async (archivo) => {
        if (canDeleteDirectly) {
            alert('Para este rol usa el botón de eliminación directa (🗑).');
            return;
        }

        abrirModalSolicitud(archivo);
    };

    const handleEliminarDirecto = async (archivo) => {
        abrirModalEliminar(archivo);
    };

    const handleConfirmarEliminacionDirecta = async () => {
        const id = deleteConfirmModal.id;
        if (!id) return;

        setDeleting(id);
        try {
            await fileService.eliminar(id);
            setArchivos((prev) => prev.filter((a) => a.id !== id));
            cargarResumen();
            cerrarModalEliminar();
        } catch (err) {
            alert(err.response?.data?.error || 'Error al eliminar el archivo.');
        } finally {
            setDeleting(null);
        }
    };

    const handleDescargar = async (archivo) => {
        setDownloading(archivo.id);
        try {
            const { data } = await fileService.obtenerUrlDescarga(archivo.id);
            const downloadUrl = String(data?.download_url || '').trim();

            if (!downloadUrl) {
                alert('No se pudo obtener la URL de descarga.');
                return;
            }

            window.open(downloadUrl, '_blank', 'noopener,noreferrer');
        } catch (err) {
            alert(err.response?.data?.error || 'No se pudo descargar el archivo.');
        } finally {
            setDownloading(null);
        }
    };

    const handleConfirmarSolicitudEliminacion = async () => {
        if (!deleteRequestModal.id) return;

        const motivoLimpio = deleteRequestModal.motivo.trim();
        if (!motivoLimpio) {
            if (isCliente) {
                setDeleteRequestFeedbackModal({
                    open: true,
                    success: false,
                    title: 'No se pudo enviar la solicitud',
                    message: 'Debes indicar el motivo de la solicitud de eliminación.',
                    nombre: deleteRequestModal.nombre || '',
                });
            } else {
                alert('Debes indicar el motivo de la solicitud de eliminación.');
            }
            return;
        }

        const id = deleteRequestModal.id;
        setRequestingDelete(id);
        try {
            await fileService.solicitarEliminacion(id, motivoLimpio);
            setArchivos((prev) => prev.map((a) => (
                a.id === id
                    ? { ...a, delete_request_status: 'pendiente', delete_requested_at: new Date().toISOString() }
                    : a
            )));
            cerrarModalSolicitud();
            if (isCliente) {
                setDeleteRequestFeedbackModal({
                    open: true,
                    success: true,
                    title: 'Solicitud enviada',
                    message: 'Un administrador debe aprobar o rechazar la eliminación.',
                    nombre: deleteRequestModal.nombre || 'archivo seleccionado',
                });
            } else {
                alert('Solicitud enviada. Un administrador debe aprobar o rechazar la eliminación.');
            }
        } catch (err) {
            const message = err.response?.data?.error || 'No se pudo enviar la solicitud de eliminación.';
            if (isCliente) {
                setDeleteRequestFeedbackModal({
                    open: true,
                    success: false,
                    title: 'No se pudo enviar la solicitud',
                    message,
                    nombre: deleteRequestModal.nombre || '',
                });
            } else {
                alert(message);
            }
        } finally {
            setRequestingDelete(null);
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
                    {isAdmin
                        ? `Vista global de administrador por razón social y empresa · ID detectado: ${razonSocialIdDetectado}`
                        : isInventarios
                            ? `Vista de inventarios filtrable por razón social y empresa · ID detectado: ${razonSocialIdDetectado}`
                            : `Razón social ID: ${user?.razon_social_id || '—'} · Carpeta base: ${user?.r2_folder || '—'}`}
                </p>
            </div>

            {/* Filtros */}
            <div className="filters-bar">
                {canFilterByCatalog && (
                    <>
                        <div className="filter-group">
                            <label>Razón social</label>
                            <select value={filtroRazonSocial} onChange={(e) => setFiltroRazonSocial(e.target.value)}>
                                <option value="">Todas las razones sociales</option>
                                {catalogo.razones_sociales.map((rs) => (
                                    <option key={rs.id} value={rs.id}>{rs.nombre}</option>
                                ))}
                            </select>
                        </div>
                        <div className="filter-group">
                            <label>Empresa</label>
                            <select
                                value={filtroEmpresa}
                                onChange={(e) => setFiltroEmpresa(e.target.value)}
                            >
                                <option value="">Todas las empresas</option>
                                {empresasDisponibles.map((emp) => (
                                    <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                                ))}
                            </select>
                        </div>
                    </>
                )}
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
                {(filtroAnio || filtroMes || filtroRazonSocial || filtroEmpresa) && (
                    <button className="btn-clear-filter" onClick={() => { setFiltroAnio(''); setFiltroMes(''); setFiltroRazonSocial(''); setFiltroEmpresa(''); }}>
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
                                <th>Razón social</th>
                                <th>Empresa</th>
                                <th>Período</th>
                                <th>Tamaño</th>
                                <th>Subido por</th>
                                <th>Carpeta RS</th>
                                <th>Fecha de subida</th>
                                <th>Estado eliminación</th>
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
                                    <td className="col-user">{getRazonSocialNombre(a)}</td>
                                    <td className="col-user">{a.empresa_nombre || '—'}</td>
                                    <td className="col-period">
                                        <span className="period-pill">{MESES_NOMBRES[a.mes]} {a.anio}</span>
                                    </td>
                                    <td className="col-size">{formatBytes(a.tamano)}</td>
                                    <td className="col-user">{a.usuario_alias || '—'}</td>
                                    <td className="col-user">{a.razon_social_folder || user?.r2_folder || '—'}</td>
                                    <td className="col-date">{formatDate(a.uploaded_at)}</td>
                                    <td className="col-user">
                                        {a.delete_request_status === 'pendiente' && 'Pendiente de aprobación'}
                                        {a.delete_request_status === 'rechazado' && 'Rechazada por admin'}
                                        {a.delete_request_status === 'aprobado' && 'Aprobada'}
                                        {!a.delete_request_status && 'Sin solicitud'}
                                    </td>
                                    <td className="col-actions">
                                        {a.storage_url && (
                                            <button
                                                className="btn-action btn-download"
                                                onClick={() => handleDescargar(a)}
                                                disabled={downloading === a.id}
                                                title="Descargar"
                                            >
                                                {downloading === a.id ? '...' : (
                                                    <img
                                                        src="/download_78516.png"
                                                        alt="Descargar"
                                                        className="btn-download-icon"
                                                    />
                                                )}
                                            </button>
                                        )}
                                        <button
                                            className="btn-action btn-delete"
                                            onClick={() => handleEliminar(a)}
                                            disabled={canDeleteDirectly || deleting === a.id || requestingDelete === a.id || a.delete_request_status === 'pendiente'}
                                            title={canDeleteDirectly ? 'Solicitud no disponible para este rol' : 'Solicitar eliminación'}
                                        >
                                            {deleting === a.id || requestingDelete === a.id
                                                ? '...'
                                                : (
                                                    <img
                                                        src="/file_78434.png"
                                                        alt="Solicitar eliminación"
                                                        className="btn-delete-icon"
                                                    />
                                                )}
                                        </button>

                                        {canDeleteDirectly && (
                                            <button
                                                className="btn-action btn-delete-direct"
                                                onClick={() => handleEliminarDirecto(a)}
                                                disabled={deleting === a.id}
                                                title="Eliminar directamente"
                                            >
                                                {deleting === a.id ? '...' : (
                                                    <img
                                                        src="/cubo-de-la-basura.png"
                                                        alt="Eliminar directamente"
                                                        className="btn-delete-icon"
                                                    />
                                                )}
                                            </button>
                                        )}
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

            {deleteRequestModal.open && !canDeleteDirectly && (
                <div className="historial-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-request-title">
                    <div className="historial-modal">
                        <h3 id="delete-request-title">Solicitar eliminación de archivo</h3>
                        <p>
                            Archivo: <strong>{deleteRequestModal.nombre}</strong>
                        </p>
                        <p>
                            ID Razón Social: <strong>{deleteRequestModal.razonSocialId}</strong>
                        </p>
                        <label htmlFor="delete-request-motivo">Motivo de la solicitud</label>
                        <textarea
                            id="delete-request-motivo"
                            value={deleteRequestModal.motivo}
                            onChange={(e) => setDeleteRequestModal((prev) => ({ ...prev, motivo: e.target.value }))}
                            placeholder="Ejemplo: El archivo fue cargado con información incorrecta."
                            rows={4}
                            required
                            maxLength={500}
                            disabled={requestingDelete === deleteRequestModal.id}
                        />
                        <div className="historial-modal-actions">
                            <button
                                type="button"
                                className="historial-btn-secondary"
                                onClick={cerrarModalSolicitud}
                                disabled={requestingDelete === deleteRequestModal.id}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="historial-btn-primary"
                                onClick={handleConfirmarSolicitudEliminacion}
                                disabled={requestingDelete === deleteRequestModal.id || !motivoValidoSolicitud}
                            >
                                {requestingDelete === deleteRequestModal.id ? 'Solicitando...' : 'Solicitar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deleteConfirmModal.open && canDeleteDirectly && (
                <div className="historial-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title">
                    <div className="historial-modal">
                        <h3 id="delete-confirm-title">Confirmar eliminación</h3>
                        <p>
                            Estás por eliminar el archivo <strong>{deleteConfirmModal.nombre}</strong>.
                        </p>
                        <p>Esta acción no se puede deshacer.</p>
                        <div className="historial-modal-actions">
                            <button
                                type="button"
                                className="historial-btn-secondary"
                                onClick={cerrarModalEliminar}
                                disabled={deleting === deleteConfirmModal.id}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="historial-btn-primary"
                                onClick={handleConfirmarEliminacionDirecta}
                                disabled={deleting === deleteConfirmModal.id}
                            >
                                {deleting === deleteConfirmModal.id ? 'Eliminando...' : 'Eliminar archivo'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deleteRequestFeedbackModal.open && isCliente && (
                <div className="historial-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-success-title">
                    <div className="historial-modal historial-modal-success">
                        <div
                            className={`historial-feedback-icon ${deleteRequestFeedbackModal.success ? 'success' : 'error'}`}
                            aria-hidden="true"
                        >
                            {deleteRequestFeedbackModal.success ? '⏳' : '⚠'}
                        </div>
                        <h3 id="delete-success-title">{deleteRequestFeedbackModal.title}</h3>
                        {!!deleteRequestFeedbackModal.nombre && (
                            <p>
                                Archivo: <strong>{deleteRequestFeedbackModal.nombre}</strong>
                            </p>
                        )}
                        <p>{deleteRequestFeedbackModal.message}</p>
                        <div className="historial-modal-actions">
                            <button
                                type="button"
                                className="historial-btn-primary"
                                onClick={cerrarModalSolicitudExitosa}
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
