import { useEffect, useMemo, useRef, useState } from 'react';
import { adminService, fileService } from '../services/api';
import FileUpload from './FileUpload';
import UploadCalendar from './UploadCalendar';
import './AdminDashboard.css';

const MONTH_NAMES = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
];

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

export default function AdminDashboard() {
    const [loading, setLoading] = useState(true);
    const [loadingDeleteRequests, setLoadingDeleteRequests] = useState(false);
    const [resolvingRequestId, setResolvingRequestId] = useState(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [deleteRequests, setDeleteRequests] = useState([]);
    const [observacionesRevision, setObservacionesRevision] = useState([]);
    const [loadingObservacionesRevision, setLoadingObservacionesRevision] = useState(false);
    const [nuevasRespuestasPorObsAdmin, setNuevasRespuestasPorObsAdmin] = useState({});
    const [ultimoMensajeVistoPorObsAdmin, setUltimoMensajeVistoPorObsAdmin] = useState({});
    const [indicadorNuevoEnChatAdmin, setIndicadorNuevoEnChatAdmin] = useState(false);
    const [detalleObservacionModal, setDetalleObservacionModal] = useState({
        open: false,
        loading: false,
        observacion: null,
        mensajes: [],
        respuesta: '',
        permisos: { can_respond: false, can_close: false },
    });
    const [observacionActionLoading, setObservacionActionLoading] = useState(false);
    const [motivoModal, setMotivoModal] = useState({
        open: false,
        requestId: null,
        archivo: '',
        solicitadoPor: '',
        motivo: '',
        fecha: '',
    });
    const [startingObservationFromRequest, setStartingObservationFromRequest] = useState(false);
    const ultimoMensajeAdminRef = useRef(null);

    const [dashboard, setDashboard] = useState({
        totales: {
            total_archivos: 0,
            total_razones_sociales: 0,
            total_empresas: 0,
            total_usuarios_con_subidas: 0,
        },
        por_empresa: [],
        por_mes: [],
        anio_reporte: new Date().getFullYear(),
    });

    const [catalogo, setCatalogo] = useState({
        roles: [],
        razones_sociales: [],
        empresas: [],
    });

    const [tableFilters, setTableFilters] = useState({
        razon_social_id: '',
        empresa_id: '',
    });

    const [appliedFilters, setAppliedFilters] = useState({
        razon_social_id: '',
        empresa_id: '',
    });

    const [filteringDashboard, setFilteringDashboard] = useState(false);
    const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);

    async function cargarDatos() {
        setLoading(true);
        setLoadingDeleteRequests(true);
        setLoadingObservacionesRevision(true);
        setError('');
        try {
            const [dashboardRes, catalogoRes, solicitudesRes, observacionesRes] = await Promise.allSettled([
                adminService.dashboard(appliedFilters),
                adminService.catalogo(),
                fileService.listarSolicitudesEliminacion({ estado: 'pendiente' }),
                fileService.listarObservaciones({ estado: 'en_revision' }),
            ]);

            if (dashboardRes.status === 'rejected' && catalogoRes.status === 'rejected') {
                throw dashboardRes.reason;
            }

            if (dashboardRes.status === 'fulfilled') setDashboard(dashboardRes.value.data);
            if (catalogoRes.status === 'fulfilled') {
                setCatalogo(catalogoRes.value.data);
            }
            if (solicitudesRes.status === 'fulfilled') {
                setDeleteRequests(solicitudesRes.value.data.solicitudes || []);
            }
            if (observacionesRes.status === 'fulfilled') {
                const rows = observacionesRes.value.data.observaciones || [];
                setObservacionesRevision(rows);
                setNuevasRespuestasPorObsAdmin((prev) => {
                    const next = { ...prev };

                    rows.forEach((obs) => {
                        const roleName = String(obs.ultimo_mensaje_rol || '').toLowerCase();
                        const isIncomingForAdmin = roleName === 'cliente' || roleName === 'clientes';
                        const ultimoMensajeAt = obs.ultimo_mensaje_at;
                        const vistoAt = ultimoMensajeVistoPorObsAdmin[obs.id];

                        if (!isIncomingForAdmin || !ultimoMensajeAt) {
                            next[obs.id] = false;
                            return;
                        }

                        if (!vistoAt || new Date(ultimoMensajeAt) > new Date(vistoAt)) {
                            next[obs.id] = true;
                            return;
                        }

                        next[obs.id] = false;
                    });

                    return next;
                });
            }
            setCalendarRefreshKey((prev) => prev + 1);
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo cargar el dashboard de administración.');
        } finally {
            setLoading(false);
            setLoadingDeleteRequests(false);
            setLoadingObservacionesRevision(false);
        }
    }

    useEffect(() => {
        cargarDatos();
    }, []);

    async function cargarObservacionesEnRevision({ silent = false } = {}) {
        if (!silent) setLoadingObservacionesRevision(true);
        try {
            const { data } = await fileService.listarObservaciones({ estado: 'en_revision' });
            const rows = data?.observaciones || [];
            setObservacionesRevision(rows);

            setNuevasRespuestasPorObsAdmin((prev) => {
                const next = { ...prev };

                rows.forEach((obs) => {
                    const roleName = String(obs.ultimo_mensaje_rol || '').toLowerCase();
                    const isIncomingForAdmin = roleName === 'cliente' || roleName === 'clientes';
                    const ultimoMensajeAt = obs.ultimo_mensaje_at;
                    const vistoAt = ultimoMensajeVistoPorObsAdmin[obs.id];

                    if (!isIncomingForAdmin || !ultimoMensajeAt) {
                        next[obs.id] = false;
                        return;
                    }

                    if (!vistoAt || new Date(ultimoMensajeAt) > new Date(vistoAt)) {
                        next[obs.id] = true;
                        return;
                    }

                    next[obs.id] = false;
                });

                return next;
            });
        } catch {
            // silencioso para refresco en vivo
        } finally {
            if (!silent) setLoadingObservacionesRevision(false);
        }
    }

    async function refrescarDetalleObservacionAdmin(observacionId) {
        if (!observacionId) return;

        try {
            const { data } = await fileService.obtenerDetalleObservacion(observacionId);
            const mensajes = data?.mensajes || [];
            setDetalleObservacionModal((prev) => ({
                ...prev,
                observacion: data?.observacion || prev.observacion,
                mensajes,
                permisos: data?.permisos || prev.permisos,
            }));

            const mensajesCliente = mensajes.filter((msg) => {
                const role = String(msg.rol_nombre || '').toLowerCase();
                return role === 'cliente' || role === 'clientes';
            });
            const ultimoCliente = mensajesCliente[mensajesCliente.length - 1];
            const ultimoClienteAt = ultimoCliente?.created_at || null;

            if (ultimoClienteAt) {
                const vistoAt = ultimoMensajeVistoPorObsAdmin[observacionId];
                if (detalleObservacionModal.open) {
                    setUltimoMensajeVistoPorObsAdmin((prev) => ({
                        ...prev,
                        [observacionId]: ultimoClienteAt,
                    }));
                    setNuevasRespuestasPorObsAdmin((prev) => ({ ...prev, [observacionId]: false }));
                    setIndicadorNuevoEnChatAdmin(false);
                    return;
                }

                if (!vistoAt || new Date(ultimoClienteAt) > new Date(vistoAt)) {
                    setNuevasRespuestasPorObsAdmin((prev) => ({ ...prev, [observacionId]: true }));
                }
            }
        } catch {
            // silencioso para refresco en vivo
        }
    }

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            cargarObservacionesEnRevision({ silent: true });

            const observacionAbiertaId = detalleObservacionModal?.observacion?.id;
            if (detalleObservacionModal.open && observacionAbiertaId) {
                refrescarDetalleObservacionAdmin(observacionAbiertaId);
            }
        }, 5000);

        return () => window.clearInterval(intervalId);
    }, [detalleObservacionModal.open, detalleObservacionModal?.observacion?.id]);

    useEffect(() => {
        if (!detalleObservacionModal.open) return undefined;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [detalleObservacionModal.open]);

    useEffect(() => {
        if (!detalleObservacionModal.open) return;
        ultimoMensajeAdminRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [detalleObservacionModal.open, detalleObservacionModal.mensajes.length]);

    const empresasFiltro = useMemo(() => {
        if (!tableFilters.razon_social_id) return catalogo.empresas;
        return catalogo.empresas.filter((e) => String(e.razon_social_id) === String(tableFilters.razon_social_id));
    }, [catalogo.empresas, tableFilters.razon_social_id]);

    const monthlyChart = useMemo(() => {
        const monthsByIndex = new Map();

        dashboard.por_mes.forEach((item) => {
            monthsByIndex.set(Number(item.mes), {
                mes: Number(item.mes),
                mes_nombre: MONTH_NAMES[Number(item.mes) - 1] || item.mes_nombre,
                total_archivos: Number(item.total_archivos) || 0,
            });
        });

        return Array.from({ length: 12 }, (_, index) => {
            const mes = index + 1;
            return (
                monthsByIndex.get(mes) || {
                    mes,
                    mes_nombre: MONTH_NAMES[index],
                    total_archivos: 0,
                }
            );
        });
    }, [dashboard.por_mes]);

    const maxMonthlyValue = useMemo(
        () => Math.max(1, ...monthlyChart.map((item) => Number(item.total_archivos) || 0)),
        [monthlyChart]
    );

    const handleDashboardFilterChange = (e) => {
        const { name, value } = e.target;

        setTableFilters((prev) => {
            if (name === 'razon_social_id') {
                return {
                    razon_social_id: value,
                    empresa_id: '',
                };
            }

            return {
                ...prev,
                [name]: value,
            };
        });
    };

    const handleApplyDashboardFilters = async () => {
        setFilteringDashboard(true);
        setError('');

        try {
            const { data } = await adminService.dashboard(tableFilters);
            setAppliedFilters(tableFilters);
            setDashboard(data);
            setCalendarRefreshKey((prev) => prev + 1);
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo aplicar el filtro del dashboard.');
        } finally {
            setFilteringDashboard(false);
        }
    };

    const handleResolverSolicitud = async (requestId, decision) => {
        setSuccess('');
        setError('');
        setResolvingRequestId(requestId);
        try {
            await fileService.resolverSolicitudEliminacion(requestId, decision);
            setDeleteRequests((prev) => prev.filter((item) => item.id !== requestId));
            setSuccess(
                decision === 'aprobar'
                    ? 'Solicitud aprobada y archivo eliminado.'
                    : 'Solicitud rechazada correctamente.'
            );
            await cargarDatos();
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo resolver la solicitud.');
        } finally {
            setResolvingRequestId(null);
        }
    };

    const abrirMotivoModal = (item) => {
        setMotivoModal({
            open: true,
            requestId: item.id,
            archivo: item.nombre_archivo || 'Archivo no disponible',
            solicitadoPor: item.solicitado_por_alias || 'Usuario desconocido',
            motivo: item.motivo || 'No se registró un motivo para esta solicitud.',
            fecha: item.solicitado_at || '',
        });
    };

    const cerrarMotivoModal = () => {
        setMotivoModal({
            open: false,
            requestId: null,
            archivo: '',
            solicitadoPor: '',
            motivo: '',
            fecha: '',
        });
    };

    const handleIniciarObservacionDesdeSolicitud = async () => {
        const requestId = Number(motivoModal.requestId);
        if (Number.isNaN(requestId) || !requestId) return;

        setStartingObservationFromRequest(true);
        setError('');
        setSuccess('');
        try {
            await fileService.iniciarObservacionDesdeSolicitud(requestId);
            cerrarMotivoModal();
            await cargarDatos();
            setSuccess('La solicitud pasó a caso de observación y quedó en proceso.');
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo iniciar la observación desde la solicitud.');
        } finally {
            setStartingObservationFromRequest(false);
        }
    };

    const abrirDetalleObservacionModal = async (observacionId) => {
        setDetalleObservacionModal({
            open: true,
            loading: true,
            observacion: null,
            mensajes: [],
            respuesta: '',
            permisos: { can_respond: false, can_close: false },
        });

        try {
            const { data } = await fileService.obtenerDetalleObservacion(observacionId);
            const mensajes = data?.mensajes || [];
            const mensajesCliente = mensajes.filter((msg) => {
                const role = String(msg.rol_nombre || '').toLowerCase();
                return role === 'cliente' || role === 'clientes';
            });
            const ultimoCliente = mensajesCliente[mensajesCliente.length - 1];
            const ultimoClienteAt = ultimoCliente?.created_at || null;

            if (ultimoClienteAt) {
                setUltimoMensajeVistoPorObsAdmin((prev) => ({
                    ...prev,
                    [observacionId]: ultimoClienteAt,
                }));
            }
            setNuevasRespuestasPorObsAdmin((prev) => ({ ...prev, [observacionId]: false }));
            setIndicadorNuevoEnChatAdmin(false);

            setDetalleObservacionModal((prev) => ({
                ...prev,
                loading: false,
                observacion: data?.observacion || null,
                mensajes,
                permisos: data?.permisos || { can_respond: false, can_close: false },
            }));
        } catch (err) {
            setDetalleObservacionModal((prev) => ({ ...prev, loading: false }));
            setError(err.response?.data?.error || 'No se pudo cargar el detalle de la observación.');
        }
    };

    const cerrarDetalleObservacionModal = () => {
        setDetalleObservacionModal({
            open: false,
            loading: false,
            observacion: null,
            mensajes: [],
            respuesta: '',
            permisos: { can_respond: false, can_close: false },
        });
        setObservacionActionLoading(false);
        setIndicadorNuevoEnChatAdmin(false);
    };

    const handleRespuestaAdminObservacion = async () => {
        const observacionId = detalleObservacionModal.observacion?.id;
        const respuesta = String(detalleObservacionModal.respuesta || '').trim();
        const canRespond = Boolean(detalleObservacionModal.permisos?.can_respond);

        if (!observacionId) return;
        if (!canRespond) {
            setError('Este chat está en modo lectura para tu usuario.');
            return;
        }
        if (!respuesta) {
            setError('Debes ingresar una respuesta antes de enviar.');
            return;
        }

        setObservacionActionLoading(true);
        setError('');
        setSuccess('');
        try {
            await fileService.responderObservacionAdmin(observacionId, respuesta);
            const { data } = await fileService.obtenerDetalleObservacion(observacionId);
            setDetalleObservacionModal((prev) => ({
                ...prev,
                observacion: data?.observacion || null,
                mensajes: data?.mensajes || [],
                respuesta: '',
            }));
            await cargarDatos();
            setSuccess('Respuesta enviada al cliente correctamente.');
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo enviar la respuesta de administración.');
        } finally {
            setObservacionActionLoading(false);
        }
    };

    const handleCerrarObservacion = async (observacionId) => {
        const canClose = Boolean(detalleObservacionModal.permisos?.can_close);
        if (!observacionId) return;
        if (!canClose) {
            setError('Este chat está en modo lectura para tu usuario.');
            return;
        }
        setObservacionActionLoading(true);
        setError('');
        setSuccess('');
        try {
            await fileService.cerrarObservacion(observacionId);
            await cargarDatos();
            setSuccess('Observación cerrada correctamente.');
            if (detalleObservacionModal.observacion?.id === observacionId) {
                cerrarDetalleObservacionModal();
            }
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo cerrar la observación.');
        } finally {
            setObservacionActionLoading(false);
        }
    };

    const handleEliminarArchivoObservado = async () => {
        const archivoId = Number(detalleObservacionModal.observacion?.archivo_id);
        const observacionId = Number(detalleObservacionModal.observacion?.id);
        const canClose = Boolean(detalleObservacionModal.permisos?.can_close);

        if (Number.isNaN(archivoId) || !archivoId) return;
        if (!canClose) {
            setError('Este chat está en modo lectura para tu usuario.');
            return;
        }

        setObservacionActionLoading(true);
        setError('');
        setSuccess('');
        try {
            await fileService.eliminar(archivoId);

            if (!Number.isNaN(observacionId) && observacionId) {
                await fileService.cerrarObservacion(observacionId);
            }

            await cargarDatos();
            cerrarDetalleObservacionModal();
            setSuccess('Archivo eliminado y observación cerrada correctamente.');
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo eliminar el archivo observado.');
        } finally {
            setObservacionActionLoading(false);
        }
    };

    return (
        <div className="admin-page">
            <div className="admin-header">
                <div>
                    <h1>Panel de administración</h1>
                    <p>Visión global de archivos por razón social y empresa, y gestión de usuarios.</p>
                </div>
            </div>

            {error && <div className="admin-alert admin-alert-error">{error}</div>}
            {success && <div className="admin-alert admin-alert-success">{success}</div>}

            {loading ? (
                <div className="admin-loading">Cargando dashboard...</div>
            ) : (
                <>
                    <div className="admin-stats">
                        <div className="admin-stat-card">
                            <span className="admin-stat-icon">📁</span>
                            <div>
                                <p className="admin-stat-value">{dashboard.totales.total_archivos}</p>
                                <p className="admin-stat-label">Archivos subidos</p>
                            </div>
                        </div>
                        <div className="admin-stat-card">
                            <span className="admin-stat-icon">🏢</span>
                            <div>
                                <p className="admin-stat-value">{dashboard.totales.total_razones_sociales}</p>
                                <p className="admin-stat-label">Razones sociales</p>
                            </div>
                        </div>
                        <div className="admin-stat-card">
                            <span className="admin-stat-icon">🏭</span>
                            <div>
                                <p className="admin-stat-value">{dashboard.totales.total_empresas}</p>
                                <p className="admin-stat-label">Empresas con archivos</p>
                            </div>
                        </div>
                        <div className="admin-stat-card">
                            <span className="admin-stat-icon">👥</span>
                            <div>
                                <p className="admin-stat-value">{dashboard.totales.total_usuarios_con_subidas}</p>
                                <p className="admin-stat-label">Usuarios con subidas</p>
                            </div>
                        </div>
                    </div>

                    <section className="admin-card admin-chart-card">
                        <div className="admin-chart-header">
                            <div>
                                <h2>Archivos subidos por mes</h2>
                                <p>Distribución de archivos cargados durante {dashboard.anio_reporte}.</p>
                            </div>
                            <span className="admin-chart-legend">Año {dashboard.anio_reporte}</span>
                        </div>

                        <div className="admin-filters">
                            <div className="admin-form-row">
                                <label htmlFor="chart_filter_razon_social_id">Razón social</label>
                                <select
                                    id="chart_filter_razon_social_id"
                                    name="razon_social_id"
                                    value={tableFilters.razon_social_id}
                                    onChange={handleDashboardFilterChange}
                                >
                                    <option value="">Todas las razones sociales</option>
                                    {catalogo.razones_sociales.map((rs) => (
                                        <option key={rs.id} value={rs.id}>{rs.nombre}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="admin-form-row">
                                <label htmlFor="chart_filter_empresa_id">Empresa</label>
                                <select
                                    id="chart_filter_empresa_id"
                                    name="empresa_id"
                                    value={tableFilters.empresa_id}
                                    onChange={handleDashboardFilterChange}
                                    disabled={!empresasFiltro.length}
                                >
                                    <option value="">Todas las empresas</option>
                                    {empresasFiltro.map((e) => (
                                        <option key={e.id} value={e.id}>{e.nombre}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="admin-filter-actions">
                                <button type="button" className="admin-btn admin-btn-filter" onClick={handleApplyDashboardFilters} disabled={filteringDashboard}>
                                    {filteringDashboard ? 'Aplicando...' : 'Aplicar filtro'}
                                </button>
                            </div>
                        </div>

                        {monthlyChart.every((item) => Number(item.total_archivos) === 0) ? (
                            <p className="admin-empty">Todavía no hay archivos cargados para mostrar la gráfica.</p>
                        ) : (
                            <div className="admin-bar-chart" role="img" aria-label={`Gráfico de archivos subidos por mes del año ${dashboard.anio_reporte}`}>
                                {monthlyChart.map((item) => {
                                    const height = `${Math.max(8, (Number(item.total_archivos) / maxMonthlyValue) * 100)}%`;
                                    const barClass = Number(item.total_archivos) >= 2 ? 'multi-files' : Number(item.total_archivos) > 0 ? 'has-files' : 'no-files';

                                    return (
                                        <div key={item.mes} className={`admin-bar-column ${barClass}`}>
                                            <div className="admin-bar-track">
                                                <div className="admin-bar-fill" style={{ height }} />
                                            </div>
                                            <span className="admin-bar-value">{item.total_archivos}</span>
                                            <span className="admin-bar-label">{item.mes_nombre}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </section>

                    <section className="admin-card admin-files-card">
                        <h2>Archivos por razón social y empresa</h2>
                        {dashboard.por_empresa.length === 0 ? (
                            <p className="admin-empty">No hay archivos que coincidan con el filtro seleccionado.</p>
                        ) : (
                            <div className="admin-table-wrap">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>Razón social</th>
                                            <th>Empresa</th>
                                            <th>Total archivos</th>
                                            <th>Última subida</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {dashboard.por_empresa.map((row) => (
                                            <tr key={`${row.razon_social_id}-${row.empresa_id}`}>
                                                <td>{row.razon_social}</td>
                                                <td>{row.empresa}</td>
                                                <td>{row.total_archivos}</td>
                                                <td>{formatDateTime(row.ultima_subida)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>

                    <section className="admin-card admin-requests-card">
                        <div className="admin-requests-header">
                            <h2>Solicitudes de eliminación pendientes</h2>
                            <span className="admin-requests-count">{deleteRequests.length}</span>
                        </div>

                        {loadingDeleteRequests ? (
                            <p className="admin-empty">Cargando solicitudes...</p>
                        ) : deleteRequests.length === 0 ? (
                            <p className="admin-empty">No hay solicitudes pendientes.</p>
                        ) : (
                            <div className="admin-table-wrap">
                                <table className="admin-table admin-requests-table">
                                    <thead>
                                        <tr>
                                            <th>Archivo</th>
                                            <th>Razón social</th>
                                            <th>Empresa</th>
                                            <th>Solicitado por</th>
                                            <th>Período</th>
                                            <th>Fecha solicitud</th>
                                            <th>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {deleteRequests.map((item) => (
                                            <tr key={item.id}>
                                                <td>{item.nombre_archivo || 'Archivo no disponible'}</td>
                                                <td>{item.razon_social_nombre || '—'}</td>
                                                <td>{item.empresa_nombre || '—'}</td>
                                                <td>{item.solicitado_por_alias || '—'}</td>
                                                <td>{`${MONTH_NAMES[Number(item.mes) - 1] || '—'} ${item.anio || ''}`.trim()}</td>
                                                <td>{formatDateTime(item.solicitado_at)}</td>
                                                <td>
                                                    <div className="admin-requests-actions">
                                                        <button
                                                            type="button"
                                                            className="admin-btn admin-btn-reason"
                                                            onClick={() => abrirMotivoModal(item)}
                                                            disabled={resolvingRequestId === item.id}
                                                        >
                                                            Ver motivo
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="admin-btn admin-btn-approve"
                                                            onClick={() => handleResolverSolicitud(item.id, 'aprobar')}
                                                            disabled={resolvingRequestId === item.id}
                                                        >
                                                            Aprobar
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="admin-btn admin-btn-reject"
                                                            onClick={() => handleResolverSolicitud(item.id, 'rechazar')}
                                                            disabled={resolvingRequestId === item.id}
                                                        >
                                                            Rechazar
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>

                    <section className="admin-card admin-observaciones-card">
                        <div className="admin-requests-header">
                            <h2>Observaciones en revisión (respuestas de clientes)</h2>
                            <span className="admin-requests-count">{observacionesRevision.length}</span>
                        </div>

                        {loadingObservacionesRevision ? (
                            <p className="admin-empty">Cargando observaciones...</p>
                        ) : observacionesRevision.length === 0 ? (
                            <p className="admin-empty">No hay observaciones en revisión por ahora.</p>
                        ) : (
                            <div className="admin-table-wrap">
                                <table className="admin-table admin-observaciones-table">
                                    <thead>
                                        <tr>
                                            <th>Archivo</th>
                                            <th>Empresa</th>
                                            <th>Estado</th>
                                            <th>Reportado por</th>
                                            <th>Fecha observación</th>
                                            <th>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {observacionesRevision.map((item) => (
                                            <tr key={item.id}>
                                                <td>{item.nombre_archivo || 'Archivo no disponible'}</td>
                                                <td>{item.empresa_nombre || '—'}</td>
                                                <td>
                                                    <span>{item.estado || '—'}</span>
                                                    {nuevasRespuestasPorObsAdmin[item.id] && (
                                                        <span className="admin-live-badge">Nueva respuesta cliente</span>
                                                    )}
                                                </td>
                                                <td>{item.reportado_por_alias || '—'}</td>
                                                <td>{formatDateTime(item.created_at)}</td>
                                                <td>
                                                    <div className="admin-requests-actions">
                                                        <button
                                                            type="button"
                                                            className="admin-btn admin-btn-reason"
                                                            onClick={() => abrirDetalleObservacionModal(item.id)}
                                                            disabled={observacionActionLoading}
                                                        >
                                                            Ver respuestas
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="admin-btn admin-btn-close"
                                                            onClick={() => handleCerrarObservacion(item.id)}
                                                            disabled={observacionActionLoading}
                                                        >
                                                            Cerrar observación
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>

                    <div className="admin-grid">
                        <section className="admin-card admin-upload-card">
                            <h2>Subir archivo</h2>
                            <FileUpload onUploadSuccess={() => {
                                cargarDatos();
                                setCalendarRefreshKey((prev) => prev + 1);
                            }} />
                        </section>

                        <UploadCalendar
                            title="Calendario de subidas"
                            subtitle="Se marcan los días con archivos Excel cargados según el filtro aplicado."
                            filterParams={appliedFilters}
                            refreshKey={calendarRefreshKey}
                        />
                    </div>

                    {motivoModal.open && (
                        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="admin-reason-title">
                            <div className="admin-modal">
                                <h3 id="admin-reason-title">Motivo de solicitud de eliminación</h3>
                                <p><strong>Archivo:</strong> {motivoModal.archivo}</p>
                                <p><strong>Solicitado por:</strong> {motivoModal.solicitadoPor}</p>
                                <p><strong>Fecha:</strong> {formatDateTime(motivoModal.fecha)}</p>
                                <div className="admin-modal-reason-box">{motivoModal.motivo}</div>
                                <div className="admin-modal-actions">
                                    <div className="admin-requests-actions">
                                        <button
                                            type="button"
                                            className="admin-btn admin-btn-observation"
                                            onClick={handleIniciarObservacionDesdeSolicitud}
                                            disabled={startingObservationFromRequest}
                                        >
                                            {startingObservationFromRequest ? 'Iniciando...' : 'Iniciar observación'}
                                        </button>
                                        <button type="button" className="admin-btn" onClick={cerrarMotivoModal} disabled={startingObservationFromRequest}>
                                            Cerrar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {detalleObservacionModal.open && (
                        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="admin-observacion-title">
                            <div className="admin-modal admin-modal-wide admin-modal-chat">
                                {detalleObservacionModal.loading ? (
                                    <p className="admin-empty">Cargando detalle de observación...</p>
                                ) : !detalleObservacionModal.observacion ? (
                                    <p className="admin-empty">No se encontró la observación seleccionada.</p>
                                ) : (
                                    <div className="admin-chat-layout">
                                        <div className="admin-chat-header">
                                            <h3 id="admin-observacion-title">Seguimiento de observación</h3>
                                            <p><strong>Archivo:</strong> {detalleObservacionModal.observacion.nombre_archivo}</p>
                                            <p><strong>Empresa:</strong> {detalleObservacionModal.observacion.empresa_nombre || '—'}</p>
                                            <p><strong>Estado:</strong> {detalleObservacionModal.observacion.estado || '—'}</p>
                                            <p><strong>Observación inicial:</strong> {detalleObservacionModal.observacion.descripcion || '—'}</p>
                                        </div>

                                        {indicadorNuevoEnChatAdmin && (
                                            <p className="admin-live-badge admin-live-badge-chat">Recibiste una nueva respuesta del cliente.</p>
                                        )}

                                        <div className="admin-modal-messages">
                                            {detalleObservacionModal.mensajes.length === 0 ? (
                                                <p className="admin-empty">No hay respuestas registradas todavía.</p>
                                            ) : (
                                                detalleObservacionModal.mensajes.map((msg) => {
                                                    const roleName = String(msg.rol_nombre || '').toLowerCase();
                                                    const isAdminSide = roleName === 'admin' || roleName === 'inventarios';

                                                    return (
                                                        <div
                                                            key={msg.id}
                                                            className={`admin-modal-message-item ${isAdminSide ? 'admin-side' : 'client-side'}`}
                                                        >
                                                            <p className="admin-modal-message-meta">
                                                                {msg.usuario_alias || 'Usuario'} · {formatDateTime(msg.created_at)}
                                                            </p>
                                                            <p className="admin-modal-message-body">{msg.mensaje}</p>
                                                        </div>
                                                    );
                                                })
                                            )}
                                            <div ref={ultimoMensajeAdminRef} aria-hidden="true" />
                                        </div>

                                        <div className="admin-chat-composer">
                                            <div className="admin-form-row">
                                                <label htmlFor="admin_observacion_respuesta">Responder al cliente</label>
                                                {!detalleObservacionModal.permisos?.can_respond && (
                                                    <p className="admin-readonly-note">Este chat está en modo lectura para tu usuario.</p>
                                                )}
                                                <textarea
                                                    id="admin_observacion_respuesta"
                                                    value={detalleObservacionModal.respuesta}
                                                    onChange={(e) => setDetalleObservacionModal((prev) => ({ ...prev, respuesta: e.target.value }))}
                                                    maxLength={1000}
                                                    rows={3}
                                                    placeholder="Escribe una respuesta o indicación para el cliente."
                                                    disabled={observacionActionLoading || !detalleObservacionModal.permisos?.can_respond}
                                                />
                                            </div>

                                            <div className="admin-modal-actions admin-modal-actions-split">
                                                <div>
                                                    <div className="admin-requests-actions">
                                                        <button
                                                            type="button"
                                                            className="admin-btn admin-btn-delete-file"
                                                            onClick={handleEliminarArchivoObservado}
                                                            disabled={observacionActionLoading || !detalleObservacionModal.permisos?.can_close}
                                                        >
                                                            Eliminar archivo
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="admin-btn admin-btn-close"
                                                            onClick={() => handleCerrarObservacion(detalleObservacionModal.observacion?.id)}
                                                            disabled={observacionActionLoading || !detalleObservacionModal.permisos?.can_close}
                                                        >
                                                            Dar por cerrado
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="admin-requests-actions">
                                                    <button
                                                        type="button"
                                                        className="admin-btn admin-btn-reason"
                                                        onClick={cerrarDetalleObservacionModal}
                                                        disabled={observacionActionLoading}
                                                    >
                                                        Cerrar ventana
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="admin-btn admin-btn-approve"
                                                        onClick={handleRespuestaAdminObservacion}
                                                        disabled={observacionActionLoading || !String(detalleObservacionModal.respuesta || '').trim() || !detalleObservacionModal.permisos?.can_respond}
                                                    >
                                                        Enviar respuesta
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
