import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import FileUpload from './FileUpload';
import { fileService } from '../services/api';
import { detectRazonSocialId } from '../utils/razonSocial';
import './InventariosDashboard.css';

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

function formatPeriodLabel(anio, mes) {
    return `${MONTH_NAMES[Number(mes) - 1] || '—'} ${anio || ''}`.trim();
}

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

export default function InventariosDashboard() {
    const { user } = useAuth();
    const [razonesSociales, setRazonesSociales] = useState([]);
    const [empresasDisponibles, setEmpresasDisponibles] = useState([]);
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
    const [resumen, setResumen] = useState([]);
    const [loadingResumen, setLoadingResumen] = useState(false);
    const [loadingDashboard, setLoadingDashboard] = useState(true);
    const [loadingDeleteRequests, setLoadingDeleteRequests] = useState(true);
    const [deleteRequests, setDeleteRequests] = useState([]);
    const [resolvingRequestId, setResolvingRequestId] = useState(null);
    const [filteringDashboard, setFilteringDashboard] = useState(false);
    const [panelError, setPanelError] = useState('');
    const [solicitudesError, setSolicitudesError] = useState('');
    const [tableFilters, setTableFilters] = useState({
        razon_social_id: '',
        empresa_id: '',
    });
    const [appliedFilters, setAppliedFilters] = useState({
        razon_social_id: '',
        empresa_id: '',
    });
    const [motivoModal, setMotivoModal] = useState({
        open: false,
        archivo: '',
        solicitadoPor: '',
        motivo: '',
        fecha: '',
    });
    const razonSocialIdDetectado = detectRazonSocialId(appliedFilters.razon_social_id, user);

    useEffect(() => {
        if (!user) return;

        let active = true;

        async function cargarRazonesSociales() {
            try {
                const { data } = await fileService.razonesSocialesDisponibles();
                if (active) {
                    setRazonesSociales(data.razones_sociales || []);
                }
            } catch {
                if (active) {
                    setRazonesSociales([]);
                }
            }
        }

        cargarRazonesSociales();

        return () => {
            active = false;
        };
    }, [user]);

    useEffect(() => {
        if (!user) return;

        let active = true;

        async function cargarEmpresas() {
            try {
                const params = tableFilters.razon_social_id ? { razon_social_id: tableFilters.razon_social_id } : undefined;
                const { data } = await fileService.empresasDisponibles(params);
                if (active) {
                    setEmpresasDisponibles(data.empresas || []);
                }
            } catch {
                if (active) {
                    setEmpresasDisponibles([]);
                }
            }
        }

        cargarEmpresas();

        return () => {
            active = false;
        };
    }, [user, tableFilters.razon_social_id]);

    const cargarPanelPrincipal = async (params = appliedFilters) => {
        setPanelError('');
        setLoadingDashboard(true);
        setLoadingResumen(true);

        const [dashboardResult, resumenResult] = await Promise.allSettled([
            fileService.dashboardSummary(params),
            fileService.resumenHistorial(params),
        ]);

        if (dashboardResult.status === 'fulfilled') {
            setDashboard(dashboardResult.value.data || {
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
        } else {
            setDashboard({
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
            setPanelError('No se pudo cargar el panel principal.');
        }

        if (resumenResult.status === 'fulfilled') {
            setResumen(resumenResult.value.data.resumen || []);
        } else {
            setResumen([]);
            setPanelError('No se pudo cargar el panel principal.');
        }

        setLoadingDashboard(false);
        setLoadingResumen(false);
    };

    const cargarSolicitudesPendientes = async () => {
        setSolicitudesError('');
        setLoadingDeleteRequests(true);

        try {
            const { data } = await fileService.listarSolicitudesEliminacion({ estado: 'pendiente' });
            setDeleteRequests(data.solicitudes || []);
        } catch {
            setDeleteRequests([]);
            setSolicitudesError('No se pudieron cargar las solicitudes pendientes.');
        } finally {
            setLoadingDeleteRequests(false);
        }
    };

    useEffect(() => {
        if (!user) return;
        const initialFilters = { razon_social_id: '', empresa_id: '' };
        setTableFilters(initialFilters);
        setAppliedFilters(initialFilters);
        cargarPanelPrincipal(initialFilters);
        cargarSolicitudesPendientes();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const chartData = useMemo(() => {
        const monthMap = new Map(
            (dashboard.por_mes || []).map((item) => [Number(item.mes), Number(item.total_archivos) || 0])
        );

        const months = Array.from({ length: 12 }, (_, index) => {
            const mes = index + 1;
            const total = monthMap.get(mes) || 0;
            return {
                mes,
                nombre: MONTH_NAMES[index],
                total,
                tieneArchivos: total > 0,
            };
        });

        return {
            selectedYear: Number(dashboard.anio_reporte) || new Date().getFullYear(),
            months,
            missingMonths: months.filter((item) => !item.tieneArchivos),
        };
    }, [dashboard.anio_reporte, dashboard.por_mes]);

    const totalArchivos = Number(dashboard.totales?.total_archivos) || 0;
    const yearsCount = [...new Set(resumen.map((row) => Number(row.anio)).filter(Boolean))].length;
    const periodsCount = resumen.length;
    const maxMonthlyValue = Math.max(1, ...chartData.months.map((item) => item.total));

    const empresaSeleccionada = empresasDisponibles.find((e) => String(e.id) === String(appliedFilters.empresa_id));

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
        try {
            const nextFilters = { ...tableFilters };
            setAppliedFilters(nextFilters);
            await cargarPanelPrincipal(nextFilters);
        } finally {
            setFilteringDashboard(false);
        }
    };

    const abrirMotivoModal = (item) => {
        setMotivoModal({
            open: true,
            archivo: item.nombre_archivo || 'Archivo no disponible',
            solicitadoPor: item.solicitado_por_alias || 'Usuario desconocido',
            motivo: item.motivo || 'No se registró un motivo para esta solicitud.',
            fecha: item.solicitado_at || '',
        });
    };

    const cerrarMotivoModal = () => {
        setMotivoModal({
            open: false,
            archivo: '',
            solicitadoPor: '',
            motivo: '',
            fecha: '',
        });
    };

    const handleResolverSolicitud = async (requestId, decision) => {
        setResolvingRequestId(requestId);
        try {
            await fileService.resolverSolicitudEliminacion(requestId, decision);
            await cargarSolicitudesPendientes();
            cargarPanelPrincipal(appliedFilters);
        } catch {
            // silencioso
        } finally {
            setResolvingRequestId(null);
        }
    };

    return (
        <div className="inventarios-page">
            <header className="inventarios-header">
                <div>
                    <p className="inventarios-eyebrow">Rol inventarios</p>
                    <h1>Panel de inventarios</h1>
                    <p>
                        Bienvenido{user?.alias ? `, ${user.alias}` : ''}. Desde aquí puedes subir archivos y revisar qué meses no tienen carga.
                    </p>
                </div>
                <div className="inventarios-date">
                    {new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
            </header>

            <section className="inventarios-stats">
                <article className="inventarios-stat-card">
                    <span className="inventarios-stat-icon">📁</span>
                    <div>
                        <p className="inventarios-stat-value">{totalArchivos}</p>
                        <p className="inventarios-stat-label">Archivos registrados</p>
                    </div>
                </article>
                <article className="inventarios-stat-card">
                    <span className="inventarios-stat-icon">📅</span>
                    <div>
                        <p className="inventarios-stat-value">{yearsCount}</p>
                        <p className="inventarios-stat-label">Años con carga</p>
                    </div>
                </article>
                <article className="inventarios-stat-card">
                    <span className="inventarios-stat-icon">🗂️</span>
                    <div>
                        <p className="inventarios-stat-value">{periodsCount}</p>
                        <p className="inventarios-stat-label">Períodos con archivos</p>
                    </div>
                </article>
                <article className="inventarios-stat-card warning">
                    <span className="inventarios-stat-icon">⚠️</span>
                    <div>
                        <p className="inventarios-stat-value">{chartData.missingMonths.length}</p>
                        <p className="inventarios-stat-label">Meses sin archivos</p>
                    </div>
                </article>
            </section>

            <section className="inventarios-chart-card">
                <div className="inventarios-chart-header">
                    <div>
                        <h2>Meses sin archivos cargados</h2>
                        <p>Se muestran los meses del año {chartData.selectedYear}. Los meses en rojo aún no tienen archivos.</p>
                    </div>
                    <span className="inventarios-chart-badge">{chartData.missingMonths.length} vacíos</span>
                </div>

                <div className="inventarios-filters">
                    <div className="inventarios-filter-group">
                        <label>Razón social</label>
                        <select
                            name="razon_social_id"
                            value={tableFilters.razon_social_id}
                            onChange={handleDashboardFilterChange}
                        >
                            <option value="">Todas las razones sociales</option>
                            {razonesSociales.map((rs) => (
                                <option key={rs.id} value={rs.id}>{rs.nombre}</option>
                            ))}
                        </select>
                    </div>
                    <div className="inventarios-filter-group">
                        <label>Empresa</label>
                        <select
                            name="empresa_id"
                            value={tableFilters.empresa_id}
                            onChange={handleDashboardFilterChange}
                            disabled={!empresasDisponibles.length}
                        >
                            <option value="">Todas las empresas</option>
                            {empresasDisponibles.map((empresa) => (
                                <option key={empresa.id} value={empresa.id}>{empresa.nombre}</option>
                            ))}
                        </select>
                    </div>
                    <div className="inventarios-filter-actions">
                        <button
                            type="button"
                            className="inventarios-btn inventarios-btn-filter"
                            onClick={handleApplyDashboardFilters}
                            disabled={filteringDashboard}
                        >
                            {filteringDashboard ? 'Aplicando...' : 'Aplicar filtro'}
                        </button>
                    </div>
                </div>

                {panelError && <p className="inventarios-error">{panelError}</p>}

                {loadingResumen ? (
                    <div className="inventarios-loading">Cargando gráfico...</div>
                ) : chartData.months.every((item) => !item.tieneArchivos) ? (
                    <div className="inventarios-empty">
                        <span>📊</span>
                        <p>Aún no hay archivos cargados para construir el gráfico.</p>
                    </div>
                ) : (
                    <div className="inventarios-chart" role="img" aria-label={`Gráfico de meses con y sin archivos del año ${chartData.selectedYear}`}>
                        {chartData.months.map((item) => {
                            const height = `${Math.max(8, (item.total / maxMonthlyValue) * 100)}%`;
                            const barClass = item.total >= 2 ? 'multi-files' : item.tieneArchivos ? 'has-files' : 'no-files';

                            return (
                                <div key={item.mes} className={`inventarios-chart-column ${barClass}`}>
                                    <div className="inventarios-chart-track">
                                        <div className="inventarios-chart-fill" style={{ height }} />
                                    </div>
                                    <span className="inventarios-chart-value">{item.total}</span>
                                    <span className="inventarios-chart-label">{item.nombre}</span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            <section className="inventarios-requests-card">
                <div className="inventarios-requests-header">
                    <div>
                        <h2>Archivos por razón social y empresa</h2>
                        <p>
                            {!appliedFilters.razon_social_id && !appliedFilters.empresa_id
                                ? 'Resumen global con el total de archivos y fecha de última subida.'
                                : appliedFilters.empresa_id
                                    ? `Mostrando registros de ${empresaSeleccionada?.nombre || 'la empresa seleccionada'}.`
                                    : 'Mostrando registros de todas las empresas de la razón social seleccionada.'}
                        </p>
                    </div>
                    <span className="inventarios-requests-badge">{(dashboard.por_empresa || []).length} registros</span>
                </div>

                {panelError && <p className="inventarios-error">{panelError}</p>}

                {loadingDashboard ? (
                    <div className="inventarios-loading">Cargando panel...</div>
                ) : (dashboard.por_empresa || []).length === 0 ? (
                    <div className="inventarios-empty compact">
                        <span>📄</span>
                        <p>No hay archivos registrados para mostrar el resumen.</p>
                    </div>
                ) : (
                    <div className="inventarios-requests-table-wrap">
                        <table className="inventarios-requests-table">
                            <thead>
                                <tr>
                                    <th>Razón social</th>
                                    <th>Empresa</th>
                                    <th>Total archivos</th>
                                    <th>Última subida</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(dashboard.por_empresa || []).map((item) => (
                                    <tr key={`${item.razon_social_id}-${item.empresa_id}`}>
                                        <td>{item.razon_social}</td>
                                        <td>{item.empresa || '—'}</td>
                                        <td>{item.total_archivos}</td>
                                        <td>{formatDateTime(item.ultima_subida)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section className="inventarios-requests-card">
                <div className="inventarios-requests-header">
                    <div>
                        <h2>Solicitudes de eliminación pendientes</h2>
                        <p>El rol inventarios puede revisar, aprobar o rechazar estas solicitudes.</p>
                    </div>
                    <span className="inventarios-requests-badge">{deleteRequests.length} pendientes</span>
                </div>

                {solicitudesError && <p className="inventarios-error">{solicitudesError}</p>}

                {loadingDeleteRequests ? (
                    <div className="inventarios-loading">Cargando solicitudes...</div>
                ) : deleteRequests.length === 0 ? (
                    <div className="inventarios-empty compact">
                        <img src="/cubo-de-la-basura.png" alt="Solicitudes" className="inventarios-empty-icon" />
                        <p>No hay solicitudes pendientes por atender.</p>
                    </div>
                ) : (
                    <div className="inventarios-requests-table-wrap">
                        <table className="inventarios-requests-table">
                            <thead>
                                <tr>
                                    <th>Archivo</th>
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
                                        <td>{item.solicitado_por_alias || '—'}</td>
                                        <td>{formatPeriodLabel(item.anio, item.mes)}</td>
                                        <td>{formatDateTime(item.solicitado_at)}</td>
                                        <td>
                                            <div className="inventarios-requests-actions">
                                                <button
                                                    type="button"
                                                    className="inventarios-btn inventarios-btn-secondary"
                                                    onClick={() => abrirMotivoModal(item)}
                                                    disabled={resolvingRequestId === item.id}
                                                >
                                                    Ver motivo
                                                </button>
                                                <button
                                                    type="button"
                                                    className="inventarios-btn inventarios-btn-approve"
                                                    onClick={() => handleResolverSolicitud(item.id, 'aprobar')}
                                                    disabled={resolvingRequestId === item.id}
                                                >
                                                    Aprobar
                                                </button>
                                                <button
                                                    type="button"
                                                    className="inventarios-btn inventarios-btn-reject"
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

            <div className="inventarios-body">
                <section className="inventarios-upload-card">
                    <h2>Subir archivo</h2>
                    <FileUpload onUploadSuccess={() => {
                        cargarPanelPrincipal(appliedFilters);
                    }} />
                </section>

                <section className="inventarios-periods-card">
                    <h2>Períodos registrados</h2>
                    <p className="inventarios-section-meta">Historial de la razón social ID: {razonSocialIdDetectado}</p>
                    {loadingResumen ? (
                        <div className="inventarios-loading">Cargando...</div>
                    ) : resumen.length === 0 ? (
                        <div className="inventarios-empty compact">
                            <span>📭</span>
                            <p>No hay archivos subidos aún.</p>
                        </div>
                    ) : (
                        <div className="inventarios-periods-list">
                            {resumen.map((item) => (
                                <div key={`${item.anio}-${item.mes}`} className="inventarios-period-item">
                                    <div>
                                        <p className="inventarios-period-month">{formatPeriodLabel(item.anio, item.mes)}</p>
                                        <p className="inventarios-period-note">{Number(item.total_archivos) || 0} archivo{Number(item.total_archivos) === 1 ? '' : 's'}</p>
                                    </div>
                                    <span className="inventarios-period-pill">Registrado</span>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>

            {motivoModal.open && (
                <div className="inventarios-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="inventarios-reason-title">
                    <div className="inventarios-modal">
                        <h3 id="inventarios-reason-title">Motivo de solicitud de eliminación</h3>
                        <p><strong>Archivo:</strong> {motivoModal.archivo}</p>
                        <p><strong>Solicitado por:</strong> {motivoModal.solicitadoPor}</p>
                        <p><strong>Fecha:</strong> {formatDateTime(motivoModal.fecha)}</p>
                        <div className="inventarios-modal-reason">{motivoModal.motivo}</div>
                        <div className="inventarios-modal-actions">
                            <button type="button" className="inventarios-btn inventarios-btn-secondary" onClick={cerrarMotivoModal}>
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
