import { useEffect, useMemo, useState } from 'react';
import { adminService, fileService } from '../services/api';
import FileUpload from './FileUpload';
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
    const [creating, setCreating] = useState(false);
    const [loadingDeleteRequests, setLoadingDeleteRequests] = useState(false);
    const [resolvingRequestId, setResolvingRequestId] = useState(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [deleteRequests, setDeleteRequests] = useState([]);
    const [motivoModal, setMotivoModal] = useState({
        open: false,
        archivo: '',
        solicitadoPor: '',
        motivo: '',
        fecha: '',
    });

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

    const [form, setForm] = useState({
        nombre_usuario: '',
        alias: '',
        password: '',
        confirm_password: '',
        rol_id: '',
        razon_social_id: '',
        empresa_id: '',
    });

    async function cargarDatos() {
        setLoading(true);
        setLoadingDeleteRequests(true);
        setError('');
        try {
            const [dashboardRes, catalogoRes, solicitudesRes] = await Promise.allSettled([
                adminService.dashboard(appliedFilters),
                adminService.catalogo(),
                fileService.listarSolicitudesEliminacion({ estado: 'pendiente' }),
            ]);

            if (dashboardRes.status === 'rejected' && catalogoRes.status === 'rejected') {
                throw dashboardRes.reason;
            }

            if (dashboardRes.status === 'fulfilled') setDashboard(dashboardRes.value.data);
            if (catalogoRes.status === 'fulfilled') {
                const catalogoData = catalogoRes.value.data;
                setCatalogo(catalogoData);
                const defaultRole = catalogoData.roles.find((r) => String(r.nombrerol || '').toLowerCase() !== 'admin') || catalogoData.roles[0];
                setForm((prev) => ({
                    ...prev,
                    rol_id: prev.rol_id || (defaultRole ? String(defaultRole.id) : ''),
                }));
            }
            if (solicitudesRes.status === 'fulfilled') {
                setDeleteRequests(solicitudesRes.value.data.solicitudes || []);
            }
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo cargar el dashboard de administración.');
        } finally {
            setLoading(false);
            setLoadingDeleteRequests(false);
        }
    }

    useEffect(() => {
        cargarDatos();
    }, []);

    const empresasFiltradas = useMemo(() => {
        if (!form.razon_social_id) return [];
        return catalogo.empresas.filter((e) => String(e.razon_social_id) === String(form.razon_social_id));
    }, [catalogo.empresas, form.razon_social_id]);

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

    const handleChange = (e) => {
        const { name, value } = e.target;
        setSuccess('');
        setError('');

        if (name === 'razon_social_id') {
            setForm((prev) => ({ ...prev, razon_social_id: value, empresa_id: '' }));
            return;
        }

        setForm((prev) => ({ ...prev, [name]: value }));
    };

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
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo aplicar el filtro del dashboard.');
        } finally {
            setFilteringDashboard(false);
        }
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        setSuccess('');
        setError('');

        if (!form.nombre_usuario || !form.alias || !form.password || !form.confirm_password || !form.rol_id || !form.empresa_id) {
            setError('Completa todos los campos para crear el usuario.');
            return;
        }

        if (form.password !== form.confirm_password) {
            setError('La confirmación de contraseña no coincide.');
            return;
        }

        setCreating(true);
        try {
            await adminService.crearUsuario({
                nombre_usuario: form.nombre_usuario.trim(),
                alias: form.alias.trim(),
                password: form.password,
                confirm_password: form.confirm_password,
                rol_id: Number(form.rol_id),
                empresa_id: Number(form.empresa_id),
            });

            setSuccess('Usuario creado correctamente.');
            setForm((prev) => ({
                ...prev,
                nombre_usuario: '',
                alias: '',
                password: '',
                confirm_password: '',
                empresa_id: '',
            }));
            await cargarDatos();
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo crear el usuario.');
        } finally {
            setCreating(false);
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

                    <div className="admin-grid">
                        <section className="admin-card admin-upload-card">
                            <h2>Subir archivo</h2>
                            <FileUpload onUploadSuccess={cargarDatos} />
                        </section>

                        <section className="admin-card admin-users-card">
                            <h2>Crear usuario</h2>
                            <form className="admin-form" onSubmit={handleCreateUser}>
                                <div className="admin-form-row">
                                    <label htmlFor="nombre_usuario">Usuario*</label>
                                    <input
                                        id="nombre_usuario"
                                        name="nombre_usuario"
                                        value={form.nombre_usuario}
                                        onChange={handleChange}
                                        disabled={creating}
                                        required
                                    />
                                </div>

                                <div className="admin-form-row">
                                    <label htmlFor="alias">Alias*</label>
                                    <input
                                        id="alias"
                                        name="alias"
                                        value={form.alias}
                                        onChange={handleChange}
                                        disabled={creating}
                                        required
                                    />
                                </div>

                                <div className="admin-form-row">
                                    <label htmlFor="password">Contraseña*</label>
                                    <input
                                        id="password"
                                        name="password"
                                        type="password"
                                        value={form.password}
                                        onChange={handleChange}
                                        disabled={creating}
                                        required
                                    />
                                </div>

                                <div className="admin-form-row">
                                    <label htmlFor="confirm_password">Confirmar contraseña*</label>
                                    <input
                                        id="confirm_password"
                                        name="confirm_password"
                                        type="password"
                                        value={form.confirm_password}
                                        onChange={handleChange}
                                        disabled={creating}
                                        required
                                    />
                                </div>

                                <div className="admin-form-row">
                                    <label htmlFor="rol_id">Rol*</label>
                                    <select id="rol_id" name="rol_id" value={form.rol_id} onChange={handleChange} disabled={creating} required>
                                        <option value="">Seleccione rol</option>
                                        {catalogo.roles.map((r) => (
                                            <option key={r.id} value={r.id}>{r.nombrerol}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="admin-form-row">
                                    <label htmlFor="razon_social_id">Razón social*</label>
                                    <select
                                        id="razon_social_id"
                                        name="razon_social_id"
                                        value={form.razon_social_id}
                                        onChange={handleChange}
                                        disabled={creating}
                                        required
                                    >
                                        <option value="">Seleccione razón social</option>
                                        {catalogo.razones_sociales.map((rs) => (
                                            <option key={rs.id} value={rs.id}>{rs.nombre}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="admin-form-row">
                                    <label htmlFor="empresa_id">Empresa*</label>
                                    <select
                                        id="empresa_id"
                                        name="empresa_id"
                                        value={form.empresa_id}
                                        onChange={handleChange}
                                        disabled={creating || !form.razon_social_id}
                                        required
                                    >
                                        <option value="">Seleccione empresa*</option>
                                        {empresasFiltradas.map((e) => (
                                            <option key={e.id} value={e.id}>{e.nombre}</option>
                                        ))}
                                    </select>
                                </div>

                                <button type="submit" className="admin-btn" disabled={creating}>
                                    {creating ? 'Creando...' : 'Crear usuario'}
                                </button>
                            </form>
                        </section>
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
                                    <button type="button" className="admin-btn" onClick={cerrarMotivoModal}>
                                        Cerrar
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
