import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
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
    const roleName = String(user?.rol_nombre || '').toLowerCase();
    const isCliente = roleName === 'cliente' || roleName === 'clientes';
    const [resumen, setResumen] = useState([]);
    const [loadingResumen, setLoadingResumen] = useState(true);
    const [resumenError, setResumenError] = useState('');
    const [observaciones, setObservaciones] = useState([]);
    const [loadingObservaciones, setLoadingObservaciones] = useState(false);
    const [detalleObservacion, setDetalleObservacion] = useState(null);
    const [detalleOpen, setDetalleOpen] = useState(false);
    const [loadingDetalle, setLoadingDetalle] = useState(false);
    const [respuestaCliente, setRespuestaCliente] = useState('');
    const [processingAction, setProcessingAction] = useState(false);
    const [nuevasRespuestasPorObs, setNuevasRespuestasPorObs] = useState({});
    const [ultimoMensajeVistoPorObs, setUltimoMensajeVistoPorObs] = useState({});
    const [indicadorNuevoEnChatAbierto, setIndicadorNuevoEnChatAbierto] = useState(false);
    const ultimoMensajeRef = useRef(null);

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
        setResumenError('');
        try {
            const { data } = await fileService.resumenHistorial();
            setResumen(data.resumen || []);
        } catch (err) {
            setResumen([]);
            setResumenError(err.response?.data?.error || 'No se pudo cargar la información del dashboard.');
        } finally {
            setLoadingResumen(false);
        }
    };

    useEffect(() => {
        cargarResumen();
    }, []);

    const cargarObservaciones = async ({ silent = false } = {}) => {
        if (!isCliente) {
            setObservaciones([]);
            return;
        }

        if (!silent) {
            setLoadingObservaciones(true);
        }
        try {
            const { data } = await fileService.listarObservaciones({ estado: 'en_revision' });
            const rows = data?.observaciones || [];
            setObservaciones(rows);

            setNuevasRespuestasPorObs((prev) => {
                const next = { ...prev };

                rows.forEach((obs) => {
                    const roleName = String(obs.ultimo_mensaje_rol || '').toLowerCase();
                    const isIncomingForClient = roleName === 'admin' || roleName === 'inventarios';
                    const ultimoMensajeAt = obs.ultimo_mensaje_at;
                    const vistoAt = ultimoMensajeVistoPorObs[obs.id];

                    if (!isIncomingForClient || !ultimoMensajeAt) {
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
            setObservaciones([]);
        } finally {
            if (!silent) {
                setLoadingObservaciones(false);
            }
        }
    };

    useEffect(() => {
        cargarObservaciones();
    }, [isCliente]);

    const refrescarDetalleObservacion = async (observacionId, { markSeen = false, showLoading = false } = {}) => {
        if (!observacionId) return;

        if (showLoading) setLoadingDetalle(true);

        try {
            const { data } = await fileService.obtenerDetalleObservacion(observacionId);
            const mensajes = data?.mensajes || [];

            setDetalleObservacion({
                observacion: data?.observacion || null,
                mensajes,
                permisos: data?.permisos || { can_respond: true, can_close: false },
            });

            const mensajesEntrantes = mensajes.filter((msg) => {
                const role = String(msg.rol_nombre || '').toLowerCase();
                return role === 'admin' || role === 'inventarios';
            });
            const ultimoEntrante = mensajesEntrantes[mensajesEntrantes.length - 1];
            const ultimoEntranteAt = ultimoEntrante?.created_at || null;

            if (markSeen) {
                if (ultimoEntranteAt) {
                    setUltimoMensajeVistoPorObs((prev) => ({
                        ...prev,
                        [observacionId]: ultimoEntranteAt,
                    }));
                }
                setNuevasRespuestasPorObs((prev) => ({ ...prev, [observacionId]: false }));
                setIndicadorNuevoEnChatAbierto(false);
                return;
            }

            if (ultimoEntranteAt) {
                const vistoAt = ultimoMensajeVistoPorObs[observacionId];
                if (detalleOpen) {
                    setUltimoMensajeVistoPorObs((prev) => ({
                        ...prev,
                        [observacionId]: ultimoEntranteAt,
                    }));
                    setNuevasRespuestasPorObs((prev) => ({ ...prev, [observacionId]: false }));
                    setIndicadorNuevoEnChatAbierto(false);
                    return;
                }

                if (!vistoAt || new Date(ultimoEntranteAt) > new Date(vistoAt)) {
                    setNuevasRespuestasPorObs((prev) => ({ ...prev, [observacionId]: true }));
                }
            }
        } catch {
            // silencioso para polling
        } finally {
            if (showLoading) setLoadingDetalle(false);
        }
    };

    useEffect(() => {
        if (!isCliente) return undefined;

        const intervalId = window.setInterval(() => {
            cargarObservaciones({ silent: true });

            const observacionIdAbierta = detalleObservacion?.observacion?.id;
            if (detalleOpen && observacionIdAbierta) {
                refrescarDetalleObservacion(observacionIdAbierta);
            }
        }, 5000);

        return () => window.clearInterval(intervalId);
    }, [isCliente, detalleOpen, detalleObservacion?.observacion?.id]);

    useEffect(() => {
        if (!detalleOpen) return undefined;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [detalleOpen]);

    useEffect(() => {
        if (!detalleOpen) return;
        ultimoMensajeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [detalleOpen, detalleObservacion?.mensajes?.length]);

    const abrirDetalleObservacion = async (observacionId) => {
        setLoadingDetalle(true);
        setDetalleOpen(true);
        setRespuestaCliente('');
        setIndicadorNuevoEnChatAbierto(false);
        try {
            await refrescarDetalleObservacion(observacionId, { markSeen: true, showLoading: true });
        } catch (err) {
            alert(err.response?.data?.error || 'No se pudo cargar el detalle de la observación.');
            setDetalleOpen(false);
            setDetalleObservacion(null);
        }
    };

    const cerrarDetalleObservacion = () => {
        setDetalleOpen(false);
        setDetalleObservacion(null);
        setRespuestaCliente('');
        setProcessingAction(false);
        setIndicadorNuevoEnChatAbierto(false);
    };

    const handleVerArchivoObservado = async () => {
        const archivoId = detalleObservacion?.observacion?.archivo_id;
        if (!archivoId) return;

        setProcessingAction(true);
        try {
            const { data } = await fileService.obtenerUrlDescarga(archivoId);
            const downloadUrl = String(data?.download_url || '').trim();
            if (!downloadUrl) {
                alert('No se pudo obtener la URL de descarga.');
                return;
            }
            window.open(downloadUrl, '_blank', 'noopener,noreferrer');
        } catch (err) {
            alert(err.response?.data?.error || 'No se pudo abrir el archivo.');
        } finally {
            setProcessingAction(false);
        }
    };

    const handleEnviarRespuestaObservacion = async () => {
        const observacionId = detalleObservacion?.observacion?.id;
        const canRespond = Boolean(detalleObservacion?.permisos?.can_respond);
        if (!observacionId) return;
        if (!canRespond) {
            alert('Este chat está en modo lectura para tu usuario.');
            return;
        }

        const mensaje = respuestaCliente.trim();
        if (!mensaje) {
            alert('Debes escribir una respuesta para continuar.');
            return;
        }

        setProcessingAction(true);
        try {
            await fileService.responderObservacion(observacionId, mensaje);
            await refrescarDetalleObservacion(observacionId, { markSeen: true });
            await cargarObservaciones({ silent: true });
            setRespuestaCliente('');
        } catch (err) {
            alert(err.response?.data?.error || 'No se pudo enviar la respuesta.');
        } finally {
            setProcessingAction(false);
        }
    };


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

            {resumenError && <div className="dashboard-error">{resumenError}</div>}
            {isCliente && (
                <section className="obs-alert-card">
                    <div className="obs-alert-head">
                        <div>
                            <h2 className="section-title">Observaciones reportadas</h2>
                            <p className="obs-alert-subtitle">Revisa observaciones del administrador y responde desde aquí.</p>
                        </div>
                        <span className="obs-alert-count">
                            {loadingObservaciones ? '...' : `${observaciones.length} pendientes`}
                        </span>
                    </div>

                    {loadingObservaciones ? (
                        <div className="loading-text">Cargando observaciones...</div>
                    ) : observaciones.length === 0 ? (
                        <div className="empty-state">
                            <span>✅</span>
                            <p>No tienes observaciones registradas.</p>
                        </div>
                    ) : (
                        <div className="obs-alert-list">
                            {observaciones.slice(0, 5).map((obs) => (
                                <article key={obs.id} className="obs-alert-item">
                                    <div>
                                        <p className="obs-alert-title">{obs.nombre_archivo || 'Archivo sin nombre'}</p>
                                        <p className="obs-alert-meta">
                                            Estado: {obs.estado || 'abierto'} · Empresa: {obs.empresa_nombre || '—'}
                                        </p>
                                        {nuevasRespuestasPorObs[obs.id] && (
                                            <p className="obs-alert-new">Nueva respuesta recibida</p>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        className="obs-btn-primary"
                                        onClick={() => abrirDetalleObservacion(obs.id)}
                                    >
                                        Ver detalles
                                    </button>
                                </article>
                            ))}
                        </div>
                    )}
                </section>
            )}

            {isCliente && (
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
            )}

            {detalleOpen && isCliente && (
                <div className="dashboard-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="obs-detail-title">
                    <div className="dashboard-modal dashboard-modal-chat">
                        {loadingDetalle ? (
                            <div className="loading-text">Cargando detalle...</div>
                        ) : !detalleObservacion?.observacion ? (
                            <div className="dashboard-error">No se encontró el detalle de la observación.</div>
                        ) : (
                            <div className="obs-chat-layout">
                                <div className="obs-chat-header">
                                    <h3 id="obs-detail-title">Detalle de observación</h3>
                                    <p><strong>Archivo:</strong> {detalleObservacion.observacion.nombre_archivo}</p>
                                    <p><strong>Estado:</strong> {detalleObservacion.observacion.estado}</p>
                                    <p><strong>Empresa:</strong> {detalleObservacion.observacion.empresa_nombre || '—'}</p>
                                    <p><strong>Descripción:</strong> {detalleObservacion.observacion.descripcion}</p>
                                    <div className="obs-detail-actions">
                                        <button
                                            type="button"
                                            className="obs-btn-secondary"
                                            onClick={handleVerArchivoObservado}
                                            disabled={processingAction}
                                        >
                                            Ver archivo
                                        </button>
                                    </div>
                                </div>

                                <h4 className="obs-messages-title">Mensajes</h4>
                                {indicadorNuevoEnChatAbierto && (
                                    <p className="obs-alert-new obs-alert-new-chat">Recibiste una nueva respuesta.</p>
                                )}
                                {detalleObservacion.mensajes.length === 0 ? (
                                    <p className="obs-message-empty">Aún no hay mensajes en esta observación.</p>
                                ) : (
                                    <div className="obs-messages-list">
                                        {detalleObservacion.mensajes.map((msg) => {
                                            const isOwnMessage = Number(msg.iduser) === Number(user?.id);
                                            return (
                                                <div key={msg.id} className={`obs-message-item ${isOwnMessage ? 'own' : ''}`}>
                                                    <p className="obs-message-head">
                                                        {msg.usuario_alias || 'Usuario'} · {new Date(msg.created_at).toLocaleString('es-PE')}
                                                    </p>
                                                    <p className="obs-message-body">{msg.mensaje}</p>
                                                </div>
                                            );
                                        })}
                                        <div ref={ultimoMensajeRef} aria-hidden="true" />
                                    </div>
                                )}

                                <div className="obs-chat-composer">
                                    <label htmlFor="obs-respuesta">Responder observación</label>
                                    {!detalleObservacion?.permisos?.can_respond && (
                                        <p className="obs-message-empty obs-message-readonly">
                                            Este chat está en modo lectura para tu usuario.
                                        </p>
                                    )}
                                    <textarea
                                        id="obs-respuesta"
                                        value={respuestaCliente}
                                        onChange={(e) => setRespuestaCliente(e.target.value)}
                                        rows={3}
                                        maxLength={1000}
                                        placeholder="Escribe la respuesta del cliente para que pase a en revisión."
                                        disabled={processingAction || !detalleObservacion?.permisos?.can_respond}
                                    />
                                    <div className="obs-detail-actions">
                                        <button
                                            type="button"
                                            className="obs-btn-primary"
                                            onClick={handleEnviarRespuestaObservacion}
                                            disabled={processingAction || !respuestaCliente.trim() || !detalleObservacion?.permisos?.can_respond}
                                        >
                                            Enviar respuesta y pasar a revisión
                                        </button>
                                        <button
                                            type="button"
                                            className="obs-btn-secondary"
                                            onClick={cerrarDetalleObservacion}
                                            disabled={processingAction}
                                        >
                                            Cerrar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
