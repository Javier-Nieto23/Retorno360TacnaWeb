import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import './ExpDashboard.css';

const MES_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export default function ExpDashboard() {
    const { user } = useAuth();
    const [documentos, setDocumentos] = useState([]);
    const [summary, setSummary] = useState({
        total_documentos: 0,
        entregados: 0,
        en_revision: 0,
        observados: 0,
        terminados: 0,
        atencion: 0,
        pendientes: 0,
        aprobados: 0,
        porcentaje_promedio: 0,
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [filters, setFilters] = useState({ razon_social_id: '', empresa_id: '', mes_evaluacion: '', anio_evaluacion: '' });
    const [catalogo, setCatalogo] = useState({ razones_sociales: [], empresas: [] });
    const [dashboardSearch, setDashboardSearch] = useState('');

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
            setSummary(data.summary || { total_documentos: 0, entregados: 0, en_revision: 0, observados: 0, terminados: 0, atencion: 0, pendientes: 0, aprobados: 0, porcentaje_promedio: 0 });
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

    const maxChartValue = (items) => Math.max(1, ...items.map((item) => item.value));

    const cumplimientoPorRazonSocial = useMemo(() => {
        const map = new Map();

        (documentosFiltrados || []).forEach((doc) => {
            const razonKey = String(doc.razon_social_id || doc.razon_social_nombre || 'sin-razon');
            const razonNombre = doc.razon_social_nombre || doc.razon_social_carpeta || 'Sin razón social';

            if (!map.has(razonKey)) {
                map.set(razonKey, { nombre: razonNombre, total: 0, tipos: new Set(), count: 0 });
            }

            const current = map.get(razonKey);
            current.total += Number(doc.porcentaje_completado || 0);
            current.count += 1;
            if (doc.tipo_archivo) current.tipos.add(doc.tipo_archivo);
        });

        return Array.from(map.entries())
            .map(([key, value]) => {
                const divisor = Math.max(1, value.tipos.size || value.count || 8);
                return {
                    key,
                    nombre: value.nombre,
                    porcentaje: Math.min(100, Number(((value.total / divisor) * 100).toFixed(1))),
                };
            })
            .sort((a, b) => b.porcentaje - a.porcentaje)
            .slice(0, 5);
    }, [documentosFiltrados]);

    const cumplimientoPorEmpresa = useMemo(() => {
        const map = new Map();

        (documentosFiltrados || []).forEach((doc) => {
            const empresaKey = String(doc.empresa_id || doc.empresa_nombre || 'sin-empresa');
            const empresaNombre = doc.empresa_nombre || doc.empresa_carpeta || 'Sin empresa';

            if (!map.has(empresaKey)) {
                map.set(empresaKey, { nombre: empresaNombre, total: 0, tipos: new Set(), count: 0 });
            }

            const current = map.get(empresaKey);
            current.total += Number(doc.porcentaje_completado || 0);
            current.count += 1;
            if (doc.tipo_archivo) current.tipos.add(doc.tipo_archivo);
        });

        return Array.from(map.entries())
            .map(([key, value]) => {
                const divisor = Math.max(1, value.tipos.size || value.count || 8);
                return {
                    key,
                    nombre: value.nombre,
                    porcentaje: Math.min(100, Number(((value.total / divisor) * 100).toFixed(1))),
                };
            })
            .sort((a, b) => b.porcentaje - a.porcentaje)
            .slice(0, 5);
    }, [documentosFiltrados]);

    const cumplimientoPorCliente = useMemo(() => {
        const map = new Map();

        (documentosFiltrados || []).forEach((doc) => {
            const clienteKey = String(doc.empresa_id || doc.empresa_nombre || 'sin-cliente');
            const clienteNombre = doc.empresa_nombre || doc.empresa_carpeta || 'Sin cliente';

            if (!map.has(clienteKey)) {
                map.set(clienteKey, { nombre: clienteNombre, total: 0, count: 0 });
            }

            const current = map.get(clienteKey);
            current.total += Number(doc.porcentaje_completado || 0);
            current.count += 1;
        });

        return Array.from(map.entries())
            .map(([key, value]) => ({
                key,
                nombre: value.nombre,
                total: value.total,
                count: value.count,
                porcentaje: value.count ? Math.min(100, Number(((value.total / value.count) * 100).toFixed(1))) : 0,
            }))
            .sort((a, b) => b.porcentaje - a.porcentaje)
            .slice(0, 7);
    }, [documentosFiltrados]);

    const cumplimientoPorMes = useMemo(() => {
        const map = new Map();

        (documentosFiltrados || []).forEach((doc) => {
            const mes = Number(doc.mes_evaluacion || new Date().getMonth() + 1);
            const anio = Number(doc.anio_evaluacion || new Date().getFullYear());
            const key = `${anio}-${String(mes).padStart(2, '0')}`;
            const label = `${MES_NAMES[mes - 1] || 'Mes'} ${anio}`;

            if (!map.has(key)) {
                map.set(key, { label, total: 0, count: 0, auditado: 0, parcial: 0, sinAuditor: 0 });
            }

            const current = map.get(key);
            current.count += 1;
            current.total += Number(doc.porcentaje_completado || 0);

            const estado = String(doc.estado || '').toLowerCase();
            if (estado === 'terminado' || estado === 'entregado' || estado === 'aprobado') {
                current.auditado += 1;
            } else if (estado === 'atencion' || estado === 'en_revision') {
                current.parcial += 1;
            } else {
                current.sinAuditor += 1;
            }
        });

        return Array.from(map.entries())
            .map(([key, value]) => {
                const porcentaje = value.count ? Math.min(100, Number(((value.total / value.count) * 100).toFixed(1))) : 0;
                return {
                    key,
                    label: value.label,
                    porcentaje,
                    total: value.count,
                    auditado: value.auditado,
                    parcial: value.parcial,
                    sinAuditor: value.sinAuditor,
                };
            })
            .sort((a, b) => b.label.localeCompare(a.label));
    }, [documentosFiltrados]);

    const totalBasicaCritica = Number(summary.terminados || 0) + Number(summary.atencion || 0) + Number(summary.observados || 0);
    const porcentajeBaseCritica = documentosFiltrados.length
        ? Math.min(100, Number(((Number(summary.entregados || 0) / Math.max(1, documentosFiltrados.length)) * 100).toFixed(1)))
        : 0;

    const kpiCards = [
        { value: documentosFiltrados.length, label: 'Pedimentos operaciones virtuales', helper: 'en el filtro', tone: 'neutral' },
        { value: `${Math.min(100, Number(summary.porcentaje_promedio || porcentajeBaseCritica || 0)).toFixed(1)}%`, label: 'Base crítica', helper: '10 docs', tone: 'blue' },
        { value: summary.terminados ?? 0, label: 'Críticos completos', helper: '10/10 con SI o N/A', tone: 'green' },
        { value: summary.atencion ?? 0, label: 'Les faltan críticos', helper: 'al menos 1 crítico en NO o vacío', tone: 'red' },
        { value: summary.total_documentos ?? 0, label: 'Auditados', helper: 'sin celdas vacías y con auditor', tone: 'green' },
        { value: totalBasicaCritica, label: 'Auditoría parcial', helper: 'con celdas vacías', tone: 'yellow' },
        { value: summary.pendientes ?? 0, label: 'Documentos faltantes', helper: '(NO)', tone: 'gray' },
        { value: summary.observados ?? 0, label: 'Celdas pendientes', helper: 'vacías: aún no revisadas', tone: 'purple' },
    ];

    return (
        <div className="exp-portal-shell">
            <header className="exp-portal-header">
                <div className="exp-title-wrap">
                    <h1>Trazabilidad 3.1.42 · Auditoría de operaciones virtuales</h1>
                    <p className="exp-subtitle">Materialidad de transferencias virtuales — Regla 3.1.42 RGCE 2026 — checklist de 18 documentos por pedimento</p>

                </div>


            </header>

            <div className="exp-banner">
                <span className="exp-banner-mark" />
                <p>
                    <strong>Cobertura:</strong> {documentosFiltrados.length || 0} pedimentos en {documentosFiltrados.length ? '2' : '0'} hojas mensuales (AGOSTO 2025 — JULIO 2026). Estado de la auditoría: {summary.terminados || 0} auditados · {summary.atencion || 0} con auditoría parcial · {summary.observados || 0} sin auditor asignado.
                </p>
            </div>

            <section className="exp-kpi-grid">
                {kpiCards.map((item, index) => (
                    <article key={`${item.label}-${index}`} className={`exp-kpi-card ${item.tone}`}>
                        <div className="exp-kpi-value">{item.value}</div>
                        <div className="exp-kpi-label">{item.label}</div>
                        <div className="exp-kpi-helper">{item.helper}</div>
                    </article>
                ))}
            </section>

            <section className="exp-filter-panel">
                <div className="exp-filter-row">
                    <label className="exp-field">
                        <span>Mes (hoja)</span>
                        <select value={filters.mes_evaluacion} onChange={(e) => setFilters((prev) => ({ ...prev, mes_evaluacion: e.target.value }))}>
                            <option value="">Todos</option>
                            {MES_NAMES.map((mes, idx) => (
                                <option key={mes} value={idx + 1}>{mes}</option>
                            ))}
                        </select>
                    </label>

                    <label className="exp-field">
                        <span>Entidad shelter (razón social)</span>
                        <select value={filters.razon_social_id} onChange={(e) => setFilters((prev) => ({ ...prev, razon_social_id: e.target.value, empresa_id: '' }))}>
                            <option value="">Todas</option>
                            {(catalogo.razones_sociales || []).map((rs) => (
                                <option key={rs.id} value={rs.id}>{rs.nombre}</option>
                            ))}
                        </select>
                    </label>

                    <label className="exp-field">
                        <span>Cliente (célula)</span>
                        <select value={filters.empresa_id} onChange={(e) => setFilters((prev) => ({ ...prev, empresa_id: e.target.value }))}>
                            <option value="">Todas</option>
                            {empresasDisponibles.map((empresa) => (
                                <option key={empresa.id} value={empresa.id}>{empresa.nombre}</option>
                            ))}
                        </select>
                    </label>

                    <label className="exp-field">
                        <span>Tipo</span>
                        <select defaultValue="">
                            <option value="">Todos</option>
                        </select>
                    </label>

                    <label className="exp-field">
                        <span>Auditor</span>
                        <select defaultValue="">
                            <option value="">Todos</option>
                        </select>
                    </label>

                    <label className="exp-field">
                        <span>Estado de auditoría</span>
                        <select defaultValue="">
                            <option value="">Todos</option>
                        </select>
                    </label>

                    <label className="exp-field">
                        <span>Base crítica</span>
                        <select defaultValue="">
                            <option value="">Todos</option>
                        </select>
                    </label>
                </div>

                <div className="exp-search-row">
                    <div className="exp-search-box">
                        <label>Buscar</label>
                        <input
                            type="text"
                            value={dashboardSearch}
                            onChange={(e) => setDashboardSearch(e.target.value)}
                            placeholder="Folio de pedimento o proveedor..."
                        />
                    </div>
                    <button className="exp-btn secondary" onClick={() => setDashboardSearch('')}>Limpiar</button>
                    <button className="exp-btn primary" onClick={cargarDashboard}>Aplicar</button>
                </div>
            </section>

            {error && <p className="exp-form-message error">{error}</p>}
            {success && <p className="exp-form-message success">{success}</p>}

            <section className="exp-analytics-grid">
                <div className="exp-panel">
                    <div className="exp-panel-header">
                        <h2>Avance por documento (1–18)</h2>
                    </div>
                    <p className="exp-panel-copy">Cada barra reporte los pedimentos filtrados según lo que marcó el auditor. Barra con mucho rojo = documento más faltante.</p>
                    <div className="exp-legend">
                        <span><em className="dot green" aria-hidden="true" /> SI</span>
                        <span><em className="dot blue" aria-hidden="true" /> N/A</span>
                        <span><em className="dot red" aria-hidden="true" /> NO</span>
                        <span><em className="dot gray" aria-hidden="true" /> Vacío</span>
                    </div>
                    <div className="exp-bar-stack">
                        {documentosFiltrados.slice(0, 8).map((doc, idx) => (
                            <div key={doc.id || idx} className="exp-bar-row">
                                <div className="exp-bar-name">{doc.tipo_archivo || 'Documento'} <span>{doc.nombre_archivo || 'Sin nombre'}</span></div>
                                <div className="exp-bar-track">
                                    <div className="exp-bar-fill" style={{ width: `${Math.min(100, Number(doc.porcentaje_completado || 0))}%` }} />
                                </div>
                                <div className="exp-bar-value">{Math.min(100, Number(doc.porcentaje_completado || 0))}%</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="exp-panel">
                    <div className="exp-panel-header">
                        <h2>Cumplimiento por entidad shelter</h2>
                    </div>
                    <p className="exp-panel-copy">% promedio (SI + N/A) sobre 18 por razón social. El número es la cantidad de pedimentos.</p>
                    <div className="exp-rank-list">
                        {cumplimientoPorRazonSocial.length > 0 ? cumplimientoPorRazonSocial.map((item, index) => (
                            <div key={item.key || index} className="exp-rank-item">
                                <div className="exp-rank-head">
                                    <strong>{item.nombre}</strong>
                                    <span className="exp-pill">{item.porcentaje}%</span>
                                </div>
                                <div className="exp-progress-track">
                                    <div className="exp-progress-bar" style={{ width: `${item.porcentaje}%` }} />
                                </div>
                            </div>
                        )) : (
                            <div className="exp-empty-state">Sin datos para mostrar.</div>
                        )}
                    </div>
                </div>
            </section>

            <section className="exp-extra-panels">
                <div className="exp-panel exp-panel-compact">
                    <div className="exp-panel-header">
                        <h2>Cumplimiento por cliente (célula de servicio)</h2>
                    </div>
                    <p className="exp-panel-copy">% promedio sobre los 18 por cliente dentro de su entidad shelter — cada célula / LSS monitorea su cartera.</p>
                    <div className="exp-client-chart">
                        {cumplimientoPorCliente.length > 0 ? cumplimientoPorCliente.map((cliente) => (
                            <div key={cliente.key} className="exp-client-row">
                                <div className="exp-client-label">{cliente.nombre}</div>
                                <div className="exp-client-track">
                                    <div className="exp-client-bar" style={{ width: `${cliente.porcentaje}%` }} />
                                    <div className="exp-client-track-bg" />
                                </div>
                                <div className="exp-client-value">{cliente.porcentaje}%</div>
                            </div>
                        )) : (
                            <div className="exp-empty-state">Sin datos para mostrar.</div>
                        )}
                    </div>
                </div>

                <div className="exp-panel exp-panel-compact">
                    <div className="exp-panel-header">
                        <h2>Cumplimiento y estado de auditoría por mes</h2>
                    </div>
                    <p className="exp-panel-copy">Barra = % promedio del mes sobre los 18; debajo, cuántos pedimentos hay y en qué estado está su auditoría.</p>
                    <div className="exp-month-chart">
                        {cumplimientoPorMes.length > 0 ? cumplimientoPorMes.map((mes) => (
                            <div key={mes.key} className="exp-month-row">
                                <div className="exp-month-label">
                                    <span>{mes.label}</span>
                                    <strong>{mes.total}</strong>
                                </div>
                                <div className="exp-month-track">
                                    <div className="exp-month-fill green" style={{ width: `${(mes.auditado / Math.max(1, mes.total)) * 100}%` }} />
                                    <div className="exp-month-fill blue" style={{ width: `${(mes.parcial / Math.max(1, mes.total)) * 100}%` }} />
                                    <div className="exp-month-fill grey" style={{ width: `${(mes.sinAuditor / Math.max(1, mes.total)) * 100}%` }} />
                                </div>
                                <div className="exp-month-percent">{mes.porcentaje}%</div>
                                <div className="exp-month-badges">
                                    {mes.auditado > 0 && <span className="exp-badge auditado">{mes.auditado} auditado</span>}
                                    {mes.parcial > 0 && <span className="exp-badge parcial">{mes.parcial} parcial</span>}
                                    {mes.sinAuditor > 0 && <span className="exp-badge sin-auditor">{mes.sinAuditor} sin auditor</span>}
                                </div>
                            </div>
                        )) : (
                            <div className="exp-empty-state">Sin datos para mostrar.</div>
                        )}
                    </div>
                </div>
            </section>

            <section className="exp-table-panel">
                <div className="exp-table-header">
                    <h2>Documentos</h2>
                </div>
                {loading ? (
                    <div className="exp-loading">Cargando...</div>
                ) : (
                    <div className="exp-table-wrap">
                        <table>
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
                                        <td>{doc.razon_social_nombre || doc.razon_social_carpeta || '—'}</td>
                                        <td>{doc.empresa_nombre || doc.empresa_carpeta || '—'}</td>
                                        <td>{doc.tipo_archivo || '—'}</td>
                                        <td>
                                            <span className={`exp-status-badge ${String(doc.estado || '').toLowerCase().replace(/\s+/g, '-')}`}>
                                                {doc.estado || 'pendiente'}
                                            </span>
                                        </td>
                                        <td>{doc.observaciones || '—'}</td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan="6" className="exp-empty-row">No hay documentos para este filtro.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}
