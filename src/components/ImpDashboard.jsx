import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fileService } from '../services/api';
import './InventariosDashboard.css';

const MES_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const DOCUMENT_TYPES = [
    'Opinión Positiva',
    'CSF',
    'Factura SEER',
    'Pedimento Pagado',
    'Pedimento Contraparte Pagado',
    'CFDI / Remisión',
    'Verificación de domicilio',
];


export default function ImpDashboard() {
    const { user } = useAuth();
    const [razonesSociales, setRazonesSociales] = useState([]);
    const [empresasDisponibles, setEmpresasDisponibles] = useState([]);
    const [catalogo, setCatalogo] = useState({ tipos: DOCUMENT_TYPES, estados: [], razones_sociales: [], empresas: [] });
    const [documentos, setDocumentos] = useState([]);
    const [summary, setSummary] = useState({
        total_documentos: 0,
        aprobados: 0,
        pendientes: 0,
        en_revision: 0,
        observados: 0,
        porcentaje_promedio: 0,
    });
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ razon_social_id: '', empresa_id: '', mes_evaluacion: new Date().getMonth() + 1, anio_evaluacion: new Date().getFullYear() });
    const [uploadForm, setUploadForm] = useState({ razon_social_id: '', empresa_id: '' });
    const [draftFiles, setDraftFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const uploadEmpresas = useMemo(() => {
        if (!uploadForm.razon_social_id) return catalogo.empresas || [];
        return (catalogo.empresas || []).filter((empresa) => String(empresa.id_razon) === String(uploadForm.razon_social_id));
    }, [catalogo.empresas, uploadForm.razon_social_id]);

    useEffect(() => {
        if (!user) return;

        async function cargarCatalogo() {
            try {
                const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/rgce/catalogo`;
                const token = localStorage.getItem('session_token');
                const userId = user?.id;
                const response = await fetch(url, {
                    headers: {
                        'x-user-id': String(userId || ''),
                        'x-session-token': String(token || ''),
                    },
                });
                const data = await response.json();
                if (data?.success) {
                    const razones = data.razones_sociales || [];
                    const empresas = data.empresas || [];
                    setCatalogo({
                        tipos: data.tipos || DOCUMENT_TYPES,
                        estados: data.estados || [],
                        razones_sociales: razones,
                        empresas,
                    });
                    setRazonesSociales(razones);
                    setEmpresasDisponibles(
                        filters.razon_social_id
                            ? empresas.filter((empresa) => String(empresa.id_razon) === String(filters.razon_social_id))
                            : empresas
                    );
                    return;
                }
            } catch {
                // ignorar y mantener valores por defecto
            }

            setCatalogo({ tipos: DOCUMENT_TYPES, estados: [], razones_sociales: [], empresas: [] });
            setRazonesSociales([]);
            setEmpresasDisponibles([]);
        }

        cargarCatalogo();
    }, [user, filters.razon_social_id]);

    const cargarDashboard = async (nextFilters = filters) => {
        try {
            setLoading(true);
            setError('');
            const query = new URLSearchParams();

            if (nextFilters.razon_social_id) query.append('razon_social_id', nextFilters.razon_social_id);
            if (nextFilters.empresa_id) query.append('empresa_id', nextFilters.empresa_id);
            if (nextFilters.mes_evaluacion) query.append('mes_evaluacion', nextFilters.mes_evaluacion);
            if (nextFilters.anio_evaluacion) query.append('anio_evaluacion', nextFilters.anio_evaluacion);

            const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/rgce/dashboard?${query.toString()}`;
            const token = localStorage.getItem('session_token');
            const userId = user?.id;
            const response = await fetch(url, {
                headers: {
                    'x-user-id': String(userId || ''),
                    'x-session-token': String(token || ''),
                },
            });
            const data = await response.json();
            if (!response.ok || !data?.success) throw new Error(data?.message || 'No se pudo cargar dashboard');
            setSummary(data.summary || { total_documentos: 0, aprobados: 0, pendientes: 0, en_revision: 0, observados: 0, porcentaje_promedio: 0 });
            setDocumentos(data.documentos || []);
        } catch (err) {
            setError(err.message || 'Error al cargar el dashboard');
            setDocumentos([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!user) return;
        cargarDashboard();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const createEmptyDraftFile = () => ({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        file: null,
        tipo_archivo: '',
        estado: 'entregado',
        porcentaje_completado: 0,
        observaciones: 'Subido y entregado',
    });

    const addFileRow = () => {
        setDraftFiles((prev) => [...prev, createEmptyDraftFile()]);
        setSuccess('');
        setError('');
    };

    const handleFileSelect = (event, index) => {
        const files = Array.from(event.target.files || []);
        const selectedFile = files[0];
        if (!selectedFile) return;

        setDraftFiles((prev) => prev.map((item, idx) => idx === index ? {
            ...item,
            file: selectedFile,
            tipo_archivo: item.tipo_archivo || '',
            estado: 'entregado',
            porcentaje_completado: 0,
            observaciones: 'Subido y entregado',
        } : item));
        setSuccess('');
        setError('');
    };

    const handleDraftChange = (index, field, value) => {
        setDraftFiles((prev) => prev.map((item, idx) => idx === index ? { ...item, [field]: value } : item));
    };

    const handleUpload = async () => {
        const fileRows = draftFiles.filter((item) => item.file);
        if (fileRows.length === 0) {
            setError('Debe seleccionar al menos un archivo para subir.');
            return;
        }
        if (!uploadForm.razon_social_id || !uploadForm.empresa_id) {
            setError('Debe seleccionar razón social y empresa antes de subir archivos.');
            return;
        }

        try {
            setUploading(true);
            setError('');
            setSuccess('');

            const formData = new FormData();
            formData.append('razon_social_id', uploadForm.razon_social_id);
            formData.append('empresa_id', uploadForm.empresa_id);
            formData.append('mes_evaluacion', filters.mes_evaluacion);
            formData.append('anio_evaluacion', filters.anio_evaluacion);

            fileRows.forEach((item) => {
                formData.append('archivos', item.file);
            });

            const documentosPayload = fileRows.map((item) => ({
                tipo_archivo: item.tipo_archivo || 'Documento',
                estado: 'entregado',
                porcentaje_completado: 0,
                observaciones: 'Subido y entregado',
                mes_evaluacion: Number(filters.mes_evaluacion),
                anio_evaluacion: Number(filters.anio_evaluacion),
            }));

            formData.append('documentos', JSON.stringify(documentosPayload));

            const token = localStorage.getItem('session_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/rgce/upload`, {
                method: 'POST',
                headers: {
                    'x-user-id': String(user?.id || ''),
                    'x-session-token': String(token || ''),
                },
                body: formData,
            });
            const data = await response.json();
            if (!response.ok || !data?.success) throw new Error(data?.message || 'Error al subir archivos');

            setSuccess(`${data.documentos?.length || 0} archivo(s) guardados correctamente.`);
            setDraftFiles([createEmptyDraftFile()]);
            setUploadForm((prev) => ({ ...prev, empresa_id: '' }));
            await cargarDashboard();
        } catch (err) {
            setError(err.message || 'No se pudo subir la documentación.');
        } finally {
            setUploading(false);
        }
    };

    const handleStateChange = async (id, nextState) => {
        try {
            const token = localStorage.getItem('session_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/rgce/${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': String(user?.id || ''),
                    'x-session-token': String(token || ''),
                },
                body: JSON.stringify({ estado: nextState }),
            });
            const data = await response.json();
            if (!response.ok || !data?.success) throw new Error(data?.message || 'No se pudo actualizar el archivo');
            await cargarDashboard();
            setSuccess('Estado actualizado correctamente.');
        } catch (err) {
            setError(err.message || 'No se pudo actualizar el archivo');
        }
    };

    return (
        <div className="inventarios-page">
            <header className="inventarios-header">
                <div>
                    <p className="inventarios-eyebrow">Rol IMP</p>
                    <h1>Dashboard RGCE / Documentación de importación</h1>
                </div>
                <div className="inventarios-date">
                    <span>{MES_NAMES[Number(filters.mes_evaluacion || new Date().getMonth() + 1) - 1]} {filters.anio_evaluacion || new Date().getFullYear()}</span>
                </div>
            </header>

            <section className="inventarios-stats">
                <article className="inventarios-stat-card">
                    <span className="inventarios-stat-icon">📁</span>
                    <div>
                        <p className="inventarios-stat-value">{summary.total_documentos}</p>
                        <p className="inventarios-stat-label">Total de documentos</p>
                    </div>
                </article>
                <article className="inventarios-stat-card">
                    <span className="inventarios-stat-icon">✅</span>
                    <div>
                        <p className="inventarios-stat-value">{summary.aprobados}</p>
                        <p className="inventarios-stat-label">Aprobados</p>
                    </div>
                </article>
                <article className="inventarios-stat-card">
                    <span className="inventarios-stat-icon">🕒</span>
                    <div>
                        <p className="inventarios-stat-value">{summary.en_revision}</p>
                        <p className="inventarios-stat-label">En revisión</p>
                    </div>
                </article>
                <article className="inventarios-stat-card warning">
                    <span className="inventarios-stat-icon">⚠️</span>
                    <div>
                        <p className="inventarios-stat-value">{summary.observados}</p>
                        <p className="inventarios-stat-label">Observados</p>
                    </div>
                </article>
            </section>

            <section className="inventarios-chart-card" style={{ marginTop: '24px' }}>
                <div className="inventarios-chart-header">
                    <div>
                        <h2>Control de cumplimiento</h2>
                        <p>Mes a evaluar</p>
                    </div>
                </div>

                <div className="inventarios-filters" style={{ marginTop: '16px' }}>
                    <div className="inventarios-filter-group">
                        <label>Razón social</label>
                        <select value={filters.razon_social_id} onChange={(e) => {
                            const nextRazonSocialId = e.target.value;
                            setFilters((prev) => ({ ...prev, razon_social_id: nextRazonSocialId, empresa_id: '' }));
                        }}>
                            <option value="">Todas</option>
                            {razonesSociales.map((rs) => (
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
                        <button className="inventarios-btn inventarios-btn-filter" onClick={() => cargarDashboard(filters)}>
                            Aplicar
                        </button>
                    </div>
                </div>
            </section>

            <section className="inventarios-upload-card" style={{ marginTop: '24px' }}>
                <h2>Subir documentación RGCE</h2>
                <div className="inventarios-contabilidad-form">
                    <div className="inventarios-filters" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: '1rem' }}>
                        <div className="inventarios-filter-group">
                            <label>Razón social*</label>
                            <select
                                value={uploadForm.razon_social_id}
                                onChange={(e) => setUploadForm((prev) => ({ ...prev, razon_social_id: e.target.value, empresa_id: '' }))}
                            >
                                <option value="">Seleccione razón social</option>
                                {razonesSociales.map((rs) => (
                                    <option key={rs.id} value={rs.id}>{rs.nombre}</option>
                                ))}
                            </select>
                        </div>

                        <div className="inventarios-filter-group">
                            <label>Empresa*</label>
                            <select
                                value={uploadForm.empresa_id}
                                onChange={(e) => setUploadForm((prev) => ({ ...prev, empresa_id: e.target.value }))}
                            >
                                <option value="">Seleccione empresa</option>
                                {uploadEmpresas.map((empresa) => (
                                    <option key={empresa.id} value={empresa.id}>{empresa.nombre}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="inventarios-rgce-file-list">
                        {draftFiles.map((item, index) => (
                            <div key={item.id} className="inventarios-rgce-file-row">
                                <div className="inventarios-rgce-file-input">
                                    <input
                                        type="file"
                                        accept=".pdf,.xlsx,.xls,.doc,.docx,.png,.jpg,.jpeg,.webp"
                                        onChange={(event) => handleFileSelect(event, index)}
                                    />
                                    {item.file && <small>{item.file.name}</small>}
                                </div>
                                <div className="inventarios-rgce-file-select">
                                    <select value={item.tipo_archivo} onChange={(e) => handleDraftChange(index, 'tipo_archivo', e.target.value)}>
                                        <option value="">Tipo de archivo</option>
                                        {catalogo.tipos.map((tipo) => (
                                            <option key={tipo} value={tipo}>{tipo}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="inventarios-rgce-file-select" aria-hidden="true" />
                                <div className="inventarios-rgce-file-number" aria-hidden="true" />
                            </div>
                        ))}
                    </div>

                    <div className="inventarios-rgce-actions-row">
                        <button type="button" className="inventarios-btn inventarios-btn-secondary" onClick={addFileRow}>
                            Agregar otra fila
                        </button>
                    </div>

                    {error && <p className="inventarios-error">{error}</p>}
                    {success && <p className="inventarios-success">{success}</p>}

                    <div className="inventarios-contabilidad-actions">
                        <button className="inventarios-btn inventarios-btn-primary" onClick={handleUpload} disabled={uploading || draftFiles.every((item) => !item.file)}>
                            {uploading ? 'Subiendo...' : 'Guardar documentación'}
                        </button>
                    </div>
                </div>
            </section>

            <section className="inventarios-requests-card" style={{ marginTop: '24px' }}>
                <div className="inventarios-requests-header">
                    <div>
                        <h2>Documentos cargados</h2>
                        <p>Mes a evaluar: {MES_NAMES[Number(filters.mes_evaluacion || new Date().getMonth() + 1) - 1]} {filters.anio_evaluacion || new Date().getFullYear()}</p>
                    </div>
                    <span className="inventarios-requests-badge">{documentos.length} registros</span>
                </div>

                <div className="inventarios-requests-table-wrap">
                    {loading ? (
                        <p>Cargando...</p>
                    ) : (
                        <table className="inventarios-requests-table">
                            <thead>
                                <tr>
                                    <th>Tipo</th>
                                    <th>Archivo</th>
                                    <th>Razón social</th>
                                    <th>Empresa</th>
                                    <th>Mes</th>
                                    <th>Estado</th>
                                    <th>%</th>
                                    <th>Observación</th>
                                    <th>Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {documentos.length > 0 ? documentos.map((doc) => (
                                    <tr key={doc.id}>
                                        <td>{doc.tipo_archivo}</td>
                                        <td>
                                            {doc.storage_url ? (
                                                <a href={doc.storage_url} target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'underline' }}>
                                                    {doc.nombre_archivo}
                                                </a>
                                            ) : (
                                                doc.nombre_archivo
                                            )}
                                        </td>
                                        <td>{doc.razon_social_nombre || doc.razon_social_carpeta}</td>
                                        <td>{doc.empresa_nombre || doc.empresa_carpeta}</td>
                                        <td>{doc.mes_evaluacion}/{doc.anio_evaluacion}</td>
                                        <td>{doc.estado}</td>
                                        <td>0%</td>
                                        <td>{doc.observaciones || '—'}</td>
                                        <td>
                                            <span className="inventarios-rgce-status-fixed">Fijo</span>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan="9" style={{ textAlign: 'center', padding: '20px' }}>No hay documentos cargados para este filtro.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </section>
        </div>
    );
}
