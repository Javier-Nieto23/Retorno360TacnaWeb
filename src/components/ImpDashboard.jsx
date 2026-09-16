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
    'Proceso Productivo',
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
    const [filters, setFilters] = useState({ razon_social_id: '', empresa_id: '', mes_evaluacion: '', anio_evaluacion: '' });
    const [uploadForm, setUploadForm] = useState({
        razon_social_id: '',
        empresa_id: '',
        pedimento_id: '',
        mes_evaluacion: new Date().getMonth() + 1,
        anio_evaluacion: new Date().getFullYear(),
    });
    const [pedimentoForm, setPedimentoForm] = useState({
        razon_social_id: '',
        empresa_id: '',
        nombre_pedimento: '',
    });
    const [pedimentos, setPedimentos] = useState([]);
    const [creatingPedimento, setCreatingPedimento] = useState(false);
    const [draftFiles, setDraftFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [preview, setPreview] = useState({ open: false, documento: null, metadata: null });

    const cumplimientoPorRazonSocial = useMemo(() => {
        const map = new Map();

        (documentos || []).forEach((doc) => {
            const razonKey = String(doc.razon_social_id || doc.razon_social_nombre || 'sin-razon');
            const razonNombre = doc.razon_social_nombre || doc.razon_social_carpeta || 'Sin razón social';

            if (!map.has(razonKey)) {
                map.set(razonKey, { nombre: razonNombre, total: 0, cantidadTipos: 0 });
            }

            const current = map.get(razonKey);
            current.total += Number(doc.porcentaje_completado || 0);
            current.cantidadTipos += 1;
        });

        return Array.from(map.entries())
            .map(([key, value]) => ({
                key,
                nombre: value.nombre,
                porcentaje: Math.min(100, Number(((value.total / Math.max(1, DOCUMENT_TYPES.length)) * 100).toFixed(1))),
            }))
            .sort((a, b) => b.porcentaje - a.porcentaje);
    }, [documentos]);

    const cumplimientoPorEmpresa = useMemo(() => {
        const map = new Map();

        (documentos || []).forEach((doc) => {
            const empresaKey = String(doc.empresa_id || doc.empresa_nombre || 'sin-empresa');
            const empresaNombre = doc.empresa_nombre || doc.empresa_carpeta || 'Sin empresa';

            if (!map.has(empresaKey)) {
                map.set(empresaKey, { nombre: empresaNombre, total: 0, cantidadTipos: 0 });
            }

            const current = map.get(empresaKey);
            current.total += Number(doc.porcentaje_completado || 0);
            current.cantidadTipos += 1;
        });

        return Array.from(map.entries())
            .map(([key, value]) => ({
                key,
                nombre: value.nombre,
                porcentaje: Math.min(100, Number(((value.total / Math.max(1, DOCUMENT_TYPES.length)) * 100).toFixed(1))),
            }))
            .sort((a, b) => b.porcentaje - a.porcentaje);
    }, [documentos]);

    const uploadEmpresas = useMemo(() => {
        if (!uploadForm.razon_social_id) return catalogo.empresas || [];
        return (catalogo.empresas || []).filter((empresa) => String(empresa.id_razon) === String(uploadForm.razon_social_id));
    }, [catalogo.empresas, uploadForm.razon_social_id]);

    const pedimentosDisponibles = useMemo(() => {
        if (!uploadForm.razon_social_id || !uploadForm.empresa_id) return [];
        return (pedimentos || []).filter(
            (pedimento) => String(pedimento.razon_social_id) === String(uploadForm.razon_social_id)
                && String(pedimento.empresa_id) === String(uploadForm.empresa_id)
        );
    }, [pedimentos, uploadForm.empresa_id, uploadForm.razon_social_id]);

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

    useEffect(() => {
        if (!user || !uploadForm.razon_social_id || !uploadForm.empresa_id) {
            setPedimentos([]);
            return;
        }

        const cargarPedimentos = async () => {
            try {
                const query = new URLSearchParams({
                    razon_social_id: String(uploadForm.razon_social_id),
                    empresa_id: String(uploadForm.empresa_id),
                });

                const token = localStorage.getItem('session_token');
                const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/rgce/pedimentos?${query.toString()}`, {
                    headers: {
                        'x-user-id': String(user?.id || ''),
                        'x-session-token': String(token || ''),
                    },
                });
                const data = await response.json();
                if (!response.ok || !data?.success) throw new Error(data?.message || 'No se pudieron cargar los pedimentos');
                setPedimentos(data.pedimentos || []);
            } catch (err) {
                setPedimentos([]);
            }
        };

        cargarPedimentos();
    }, [user, uploadForm.razon_social_id, uploadForm.empresa_id]);

    const createEmptyDraftFile = () => ({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        file: null,
        nuevo_nombre: '',
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
            nuevo_nombre: item.nuevo_nombre || selectedFile.name,
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

    const handleCreatePedimento = async () => {
        if (!pedimentoForm.razon_social_id || !pedimentoForm.empresa_id) {
            setError('Debes seleccionar razón social y empresa antes de crear una carpeta.');
            return;
        }

        if (!pedimentoForm.nombre_pedimento.trim()) {
            setError('Debes escribir el nombre del pedimento.');
            return;
        }

        try {
            setCreatingPedimento(true);
            setError('');
            setSuccess('');

            const token = localStorage.getItem('session_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/rgce/pedimentos`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': String(user?.id || ''),
                    'x-session-token': String(token || ''),
                },
                body: JSON.stringify({
                    razon_social_id: pedimentoForm.razon_social_id,
                    empresa_id: pedimentoForm.empresa_id,
                    nombre_pedimento: pedimentoForm.nombre_pedimento,
                }),
            });

            const data = await response.json();
            if (!response.ok || !data?.success) {
                throw new Error(data?.message || 'No se pudo crear el pedimento.');
            }

            setSuccess(`La carpeta ${data.pedimento?.nombre_pedimento || pedimentoForm.nombre_pedimento} quedó creada correctamente.`);
            setPedimentoForm((prev) => ({ ...prev, nombre_pedimento: '' }));
            setUploadForm((prev) => ({ ...prev, pedimento_id: String(data.pedimento?.id || prev.pedimento_id) }));

            const query = new URLSearchParams({
                razon_social_id: String(pedimentoForm.razon_social_id),
                empresa_id: String(pedimentoForm.empresa_id),
            });

            const pedimentosResponse = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/rgce/pedimentos?${query.toString()}`, {
                headers: {
                    'x-user-id': String(user?.id || ''),
                    'x-session-token': String(token || ''),
                },
            });
            const pedimentosData = await pedimentosResponse.json();
            if (pedimentosResponse.ok && pedimentosData?.success) {
                setPedimentos(pedimentosData.pedimentos || []);
            }
        } catch (err) {
            setError(err.message || 'No se pudo crear la carpeta del pedimento.');
        } finally {
            setCreatingPedimento(false);
        }
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
            if (uploadForm.pedimento_id) {
                formData.append('pedimento_id', String(uploadForm.pedimento_id));
            }
            formData.append('mes_evaluacion', String(uploadForm.mes_evaluacion));
            formData.append('anio_evaluacion', String(uploadForm.anio_evaluacion));

            fileRows.forEach((item) => {
                formData.append('archivos', item.file);
            });

            const documentosPayload = fileRows.map((item) => {
                const nombrePropuesto = String(item.nuevo_nombre || item.file?.name || '').trim();
                return {
                    nombre_archivo: nombrePropuesto || item.file?.name || 'Documento',
                    tipo_archivo: item.tipo_archivo || 'Documento',
                    estado: 'entregado',
                    porcentaje_completado: 0,
                    observaciones: 'Subido y entregado',
                    mes_evaluacion: Number(uploadForm.mes_evaluacion),
                    anio_evaluacion: Number(uploadForm.anio_evaluacion),
                };
            });

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

    const handleDownload = async (doc) => {
        try {
            const token = localStorage.getItem('session_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/rgce/${doc.id}/download-url`, {
                headers: {
                    'x-user-id': String(user?.id || ''),
                    'x-session-token': String(token || ''),
                },
            });
            const data = await response.json();
            if (!response.ok || !data?.success) throw new Error(data?.message || 'No se pudo generar la URL de descarga.');
            window.open(data.download_url || doc.storage_url, '_blank', 'noopener,noreferrer');
        } catch (err) {
            setError(err.message || 'No se pudo descargar el archivo.');
        }
    };

    const handlePreview = async (doc) => {
        try {
            const token = localStorage.getItem('session_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/rgce/${doc.id}/preview`, {
                headers: {
                    'x-user-id': String(user?.id || ''),
                    'x-session-token': String(token || ''),
                },
            });
            const data = await response.json();
            if (!response.ok || !data?.success) throw new Error(data?.message || 'No se pudo cargar la vista previa.');

            setPreview({
                open: true,
                documento: { ...doc, storage_url: data.downloadUrl || data.storageUrl || doc.storage_url || '' },
                metadata: data,
            });
        } catch (err) {
            setError(err.message || 'No se pudo cargar la vista previa.');
        }
    };

    const cerrarPreview = () => {
        setPreview({ open: false, documento: null, metadata: null });
    };

    const getPreviewType = (url = '', forcedType = '') => {
        if (forcedType) return forcedType;
        const lower = String(url).toLowerCase();
        if (lower.endsWith('.pdf')) return 'pdf';
        if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].some((ext) => lower.endsWith(ext))) return 'image';
        return 'unsupported';
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

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginTop: '16px' }}>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px' }}>
                        <h3 style={{ margin: '0 0 12px', fontSize: '1rem' }}>Por razón social</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {cumplimientoPorRazonSocial.length > 0 ? cumplimientoPorRazonSocial.map((item) => (
                                <div key={item.key}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.9rem' }}>
                                        <span>{item.nombre}</span>
                                        <strong>{item.porcentaje}%</strong>
                                    </div>
                                    <div style={{ width: '100%', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden', height: '10px' }}>
                                        <div style={{ width: `${Math.min(100, item.porcentaje)}%`, background: 'linear-gradient(90deg, #16a34a 0%, #4f46e5 100%)', height: '100%' }} />
                                    </div>
                                </div>
                            )) : (
                                <p style={{ margin: 0, color: '#64748b' }}>Sin datos para mostrar.</p>
                            )}
                        </div>
                    </div>

                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px' }}>
                        <h3 style={{ margin: '0 0 12px', fontSize: '1rem' }}>Por empresa</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {cumplimientoPorEmpresa.length > 0 ? cumplimientoPorEmpresa.map((item) => (
                                <div key={item.key}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.9rem' }}>
                                        <span>{item.nombre}</span>
                                        <strong>{item.porcentaje}%</strong>
                                    </div>
                                    <div style={{ width: '100%', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden', height: '10px' }}>
                                        <div style={{ width: `${Math.min(100, item.porcentaje)}%`, background: 'linear-gradient(90deg, #0ea5e9 0%, #22c55e 100%)', height: '100%' }} />
                                    </div>
                                </div>
                            )) : (
                                <p style={{ margin: 0, color: '#64748b' }}>Sin datos para mostrar.</p>
                            )}
                        </div>
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
                            <option value="">Todos</option>
                            {MES_NAMES.map((mes, idx) => (
                                <option key={mes} value={idx + 1}>{mes}</option>
                            ))}
                        </select>
                    </div>

                    <div className="inventarios-filter-group">
                        <label>Año</label>
                        <select value={filters.anio_evaluacion} onChange={(e) => setFilters((prev) => ({ ...prev, anio_evaluacion: e.target.value }))}>
                            <option value="">Todos</option>
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

            {preview.open && preview.documento && (
                <div className="historial-preview-backdrop" onClick={cerrarPreview} style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div className="historial-preview-modal" onClick={(event) => event.stopPropagation()} style={{ width: 'min(1100px, 90vw)', maxHeight: '85vh', overflow: 'auto', background: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 20px 60px rgba(15, 23, 42, 0.25)' }}>
                        <div className="historial-preview-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div>
                                <h3 style={{ margin: 0 }}>{preview.documento.nombre_archivo}</h3>
                                <p style={{ margin: '8px 0 0', color: '#475569' }}>{preview.documento.razon_social_nombre || 'Razón social'} · {preview.documento.empresa_nombre || 'Empresa'}</p>
                            </div>
                            <button type="button" className="preview-close" onClick={cerrarPreview} style={{ border: 'none', background: '#f1f5f9', width: '36px', height: '36px', borderRadius: '999px', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
                        </div>

                        <div className="historial-preview-body" style={{ minHeight: '420px', display: 'grid', placeItems: 'center' }}>
                            {preview.documento.storage_url && getPreviewType(preview.documento.storage_url) === 'pdf' ? (
                                <object
                                    data={preview.documento.storage_url}
                                    type="application/pdf"
                                    style={{ width: '100%', minHeight: '640px', border: '1px solid #e2e8f0', borderRadius: '12px' }}
                                >
                                    <embed src={preview.documento.storage_url} type="application/pdf" style={{ width: '100%', minHeight: '640px' }} />
                                    <div style={{ textAlign: 'center', padding: '24px' }}>
                                        <p>Tu navegador no pudo mostrar la vista previa del PDF.</p>
                                        <a href={preview.documento.storage_url} target="_blank" rel="noreferrer">Abrir archivo original</a>
                                    </div>
                                </object>
                            ) : preview.documento.storage_url && getPreviewType(preview.documento.storage_url) === 'image' ? (
                                <img src={preview.documento.storage_url} alt={preview.documento.nombre_archivo} style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                            ) : (
                                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                                    <p>Vista previa no disponible para este tipo de archivo.</p>
                                    <a href={preview.documento.storage_url || '#'} target="_blank" rel="noreferrer">Abrir archivo original</a>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
