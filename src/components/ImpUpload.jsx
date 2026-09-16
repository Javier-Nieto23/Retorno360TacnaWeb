import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
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

export default function ImpUpload() {
  const { user } = useAuth();
  const [razonesSociales, setRazonesSociales] = useState([]);
  const [catalogo, setCatalogo] = useState({ tipos: DOCUMENT_TYPES, razones_sociales: [], empresas: [] });
  const [pedimentoForm, setPedimentoForm] = useState({ razon_social_id: '', empresa_id: '', nombre_pedimento: '' });
  const [uploadForm, setUploadForm] = useState({
    razon_social_id: '',
    empresa_id: '',
    pedimento_id: '',
    mes_evaluacion: new Date().getMonth() + 1,
    anio_evaluacion: new Date().getFullYear(),
  });
  const [pedimentos, setPedimentos] = useState([]);
  const [draftFiles, setDraftFiles] = useState([]);
  const [virtuales, setVirtuales] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [creatingPedimento, setCreatingPedimento] = useState(false);
  const [savingVirtual, setSavingVirtual] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [virtualForm, setVirtualForm] = useState({
    razon_social_id: '',
    empresa_id: '',
    nombre_operacion: '',
    tipo_virtual: 'Transferencia',
    cantidad: 1,
    mes_evaluacion: new Date().getMonth() + 1,
    anio_evaluacion: new Date().getFullYear(),
    observaciones: '',
  });

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

  const catalogoEmpresasPorRazon = useMemo(() => {
    if (!pedimentoForm.razon_social_id) return [];
    return (catalogo.empresas || []).filter((empresa) => String(empresa.id_razon) === String(pedimentoForm.razon_social_id));
  }, [catalogo.empresas, pedimentoForm.razon_social_id]);

  useEffect(() => {
    if (!user) return;

    async function cargarCatalogo() {
      try {
        setLoading(true);
        const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/rgce/catalogo`;
        const response = await fetch(url, {
          headers: {
            'x-user-id': String(user?.id || ''),
            'x-session-token': String(localStorage.getItem('session_token') || ''),
          },
        });
        const data = await response.json();
        if (!response.ok || !data?.success) throw new Error(data?.message || 'No se pudo cargar el catálogo');
        setCatalogo({
          tipos: data.tipos || DOCUMENT_TYPES,
          razones_sociales: data.razones_sociales || [],
          empresas: data.empresas || [],
        });
        setRazonesSociales(data.razones_sociales || []);
      } catch (err) {
        setError(err.message || 'Error al cargar catálogo');
      } finally {
        setLoading(false);
      }
    }

    cargarCatalogo();
  }, [user]);

  useEffect(() => {
    if (!user || !uploadForm.razon_social_id || !uploadForm.empresa_id) {
      setPedimentos([]);
      return;
    }

    async function cargarPedimentos() {
      try {
        const query = new URLSearchParams({
          razon_social_id: String(uploadForm.razon_social_id),
          empresa_id: String(uploadForm.empresa_id),
        });
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/rgce/pedimentos?${query.toString()}`, {
          headers: {
            'x-user-id': String(user?.id || ''),
            'x-session-token': String(localStorage.getItem('session_token') || ''),
          },
        });
        const data = await response.json();
        if (!response.ok || !data?.success) throw new Error(data?.message || 'No se pudieron cargar los pedimentos');
        setPedimentos(data.pedimentos || []);
      } catch {
        setPedimentos([]);
      }
    }

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

  useEffect(() => {
    setDraftFiles([createEmptyDraftFile()]);
  }, []);

  const addFileRow = () => {
    setDraftFiles((prev) => [...prev, createEmptyDraftFile()]);
    setError('');
    setSuccess('');
  };

  const handleFileSelect = (event, index) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setDraftFiles((prev) => prev.map((item, idx) => idx === index ? {
      ...item,
      file,
      nuevo_nombre: item.nuevo_nombre || file.name,
      tipo_archivo: item.tipo_archivo || '',
      estado: 'entregado',
      porcentaje_completado: 0,
      observaciones: 'Subido y entregado',
    } : item));
  };

  const handleDraftChange = (index, field, value) => {
    setDraftFiles((prev) => prev.map((item, idx) => idx === index ? { ...item, [field]: value } : item));
  };

  const handleCreatePedimento = async () => {
    if (!pedimentoForm.razon_social_id || !pedimentoForm.empresa_id) {
      setError('Debe seleccionar razón social y empresa antes de crear la carpeta.');
      return;
    }

    if (!pedimentoForm.nombre_pedimento.trim()) {
      setError('Debe indicar el nombre del pedimento.');
      return;
    }

    try {
      setCreatingPedimento(true);
      setError('');
      setSuccess('');

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/rgce/pedimentos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(user?.id || ''),
          'x-session-token': String(localStorage.getItem('session_token') || ''),
        },
        body: JSON.stringify({
          razon_social_id: pedimentoForm.razon_social_id,
          empresa_id: pedimentoForm.empresa_id,
          nombre_pedimento: pedimentoForm.nombre_pedimento,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.message || 'No se pudo crear el pedimento.');

      setSuccess(`La carpeta ${data.pedimento?.nombre_pedimento || pedimentoForm.nombre_pedimento} quedó creada.`);
      setPedimentoForm((prev) => ({ ...prev, nombre_pedimento: '' }));
      setUploadForm((prev) => ({ ...prev, pedimento_id: String(data.pedimento?.id || prev.pedimento_id) }));

      const query = new URLSearchParams({
        razon_social_id: String(pedimentoForm.razon_social_id),
        empresa_id: String(pedimentoForm.empresa_id),
      });
      const pedimentosResponse = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/rgce/pedimentos?${query.toString()}`, {
        headers: {
          'x-user-id': String(user?.id || ''),
          'x-session-token': String(localStorage.getItem('session_token') || ''),
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
      if (uploadForm.pedimento_id) formData.append('pedimento_id', String(uploadForm.pedimento_id));
      formData.append('mes_evaluacion', String(uploadForm.mes_evaluacion));
      formData.append('anio_evaluacion', String(uploadForm.anio_evaluacion));

      fileRows.forEach((item) => formData.append('archivos', item.file));

      const documentosPayload = fileRows.map((item) => ({
        nombre_archivo: String(item.nuevo_nombre || item.file?.name || '').trim() || item.file?.name || 'Documento',
        tipo_archivo: item.tipo_archivo || 'Documento',
        estado: 'entregado',
        porcentaje_completado: 0,
        observaciones: 'Subido y entregado',
        mes_evaluacion: Number(uploadForm.mes_evaluacion),
        anio_evaluacion: Number(uploadForm.anio_evaluacion),
      }));

      formData.append('documentos', JSON.stringify(documentosPayload));

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/rgce/upload`, {
        method: 'POST',
        headers: {
          'x-user-id': String(user?.id || ''),
          'x-session-token': String(localStorage.getItem('session_token') || ''),
        },
        body: formData,
      });

      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.message || 'Error al subir archivos');

      setSuccess(`${data.documentos?.length || 0} archivo(s) guardados correctamente.`);
      setDraftFiles([createEmptyDraftFile()]);
      setUploadForm((prev) => ({ ...prev, empresa_id: '', pedimento_id: '' }));
    } catch (err) {
      setError(err.message || 'No se pudo subir la documentación.');
    } finally {
      setUploading(false);
    }
  };

  const cargarVirtuales = async (nextForm = virtualForm) => {
    try {
      const params = new URLSearchParams();
      if (nextForm.razon_social_id) params.append('razon_social_id', nextForm.razon_social_id);
      if (nextForm.empresa_id) params.append('empresa_id', nextForm.empresa_id);
      if (nextForm.mes_evaluacion) params.append('mes_evaluacion', String(nextForm.mes_evaluacion));
      if (nextForm.anio_evaluacion) params.append('anio_evaluacion', String(nextForm.anio_evaluacion));

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/rgce/virtuales?${params.toString()}`, {
        headers: {
          'x-user-id': String(user?.id || ''),
          'x-session-token': String(localStorage.getItem('session_token') || ''),
        },
      });
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.message || 'No se pudo cargar virtuales');
      setVirtuales(data.virtuales || []);
    } catch {
      setVirtuales([]);
    }
  };

  const handleVirtualSubmit = async () => {
    if (!virtualForm.razon_social_id || !virtualForm.empresa_id || !virtualForm.nombre_operacion.trim()) {
      setError('Debe completar razón social, empresa y nombre de la operación virtual.');
      return;
    }

    try {
      setSavingVirtual(true);
      setError('');
      setSuccess('');

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/rgce/virtuales`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(user?.id || ''),
          'x-session-token': String(localStorage.getItem('session_token') || ''),
        },
        body: JSON.stringify({
          razon_social_id: virtualForm.razon_social_id,
          empresa_id: virtualForm.empresa_id,
          nombre_operacion: virtualForm.nombre_operacion,
          tipo_virtual: virtualForm.tipo_virtual,
          cantidad: Number(virtualForm.cantidad || 0),
          mes_evaluacion: Number(virtualForm.mes_evaluacion),
          anio_evaluacion: Number(virtualForm.anio_evaluacion),
          observaciones: virtualForm.observaciones,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.message || 'No se pudo guardar la operación virtual.');

      setSuccess('La operación virtual se registró correctamente.');
      setVirtualForm((prev) => ({ ...prev, nombre_operacion: '', tipo_virtual: 'Transferencia', cantidad: 1, observaciones: '' }));
      await cargarVirtuales();
    } catch (err) {
      setError(err.message || 'No se pudo registrar la operación virtual.');
    } finally {
      setSavingVirtual(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    cargarVirtuales();
  }, [user]);

  return (
    <div className="inventarios-page">
      <header className="inventarios-header">
        <div>
          <p className="inventarios-eyebrow">Rol IMP</p>
          <h1>Subir documentos RGCE</h1>
        </div>
        <div className="inventarios-date">
          <span>{MES_NAMES[Number(uploadForm.mes_evaluacion || new Date().getMonth() + 1) - 1]} {uploadForm.anio_evaluacion || new Date().getFullYear()}</span>
        </div>
      </header>

      <section className="inventarios-upload-card" style={{ marginTop: '18px' }}>
        <h2>Carpetas RGCE</h2>
        <div className="inventarios-contabilidad-form" style={{ marginBottom: '24px' }}>
          <div className="inventarios-filters" style={{ gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))', marginBottom: '1rem' }}>
            <div className="inventarios-filter-group">
              <label>Razón social*</label>
              <select
                value={pedimentoForm.razon_social_id}
                onChange={(e) => setPedimentoForm((prev) => ({ ...prev, razon_social_id: e.target.value, empresa_id: '' }))}
              >
                <option value="">Seleccione razón social</option>
                {(razonesSociales || []).map((rs) => (
                  <option key={rs.id} value={rs.id}>{rs.nombre}</option>
                ))}
              </select>
            </div>

            <div className="inventarios-filter-group">
              <label>Empresa*</label>
              <select
                value={pedimentoForm.empresa_id}
                onChange={(e) => setPedimentoForm((prev) => ({ ...prev, empresa_id: e.target.value }))}
              >
                <option value="">Seleccione empresa</option>
                {catalogoEmpresasPorRazon.map((empresa) => (
                  <option key={empresa.id} value={empresa.id}>{empresa.nombre}</option>
                ))}
              </select>
            </div>

            <div className="inventarios-filter-group" style={{ gridColumn: '1 / -1' }}>
              <label>Nombre del pedimento</label>
              <input
                type="text"
                value={pedimentoForm.nombre_pedimento}
                onChange={(e) => setPedimentoForm((prev) => ({ ...prev, nombre_pedimento: e.target.value }))}
                placeholder="Ej. PED-001 / Importación 2026"
              />
            </div>
          </div>

          <div className="inventarios-contabilidad-actions">
            <button type="button" className="inventarios-btn inventarios-btn-primary" onClick={handleCreatePedimento} disabled={creatingPedimento || !pedimentoForm.razon_social_id || !pedimentoForm.empresa_id || !pedimentoForm.nombre_pedimento.trim()}>
              {creatingPedimento ? 'Creando...' : 'Crear carpeta'}
            </button>
          </div>

          {pedimentosDisponibles.length > 0 && (
            <div style={{ marginTop: '18px' }}>
              <h3 style={{ margin: '0 0 12px' }}>Pedimentos disponibles</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {pedimentosDisponibles.map((pedimento) => (
                  <button
                    key={pedimento.id}
                    type="button"
                    className="inventarios-btn inventarios-btn-secondary"
                    onClick={() => setUploadForm((prev) => ({ ...prev, pedimento_id: String(pedimento.id) }))}
                    style={{
                      background: uploadForm.pedimento_id === String(pedimento.id) ? '#1d4ed8' : '#f8fafc',
                      color: uploadForm.pedimento_id === String(pedimento.id) ? '#fff' : '#0f172a',
                    }}
                  >
                    {pedimento.nombre_pedimento}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <h2>Subir documentación RGCE</h2>
        <div className="inventarios-contabilidad-form">
          <div className="inventarios-filters" style={{ gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))', marginBottom: '1rem' }}>
            <div className="inventarios-filter-group">
              <label>Razón social*</label>
              <select
                value={uploadForm.razon_social_id}
                onChange={(e) => setUploadForm((prev) => ({ ...prev, razon_social_id: e.target.value, empresa_id: '', pedimento_id: '' }))}
              >
                <option value="">Seleccione razón social</option>
                {(razonesSociales || []).map((rs) => (
                  <option key={rs.id} value={rs.id}>{rs.nombre}</option>
                ))}
              </select>
            </div>

            <div className="inventarios-filter-group">
              <label>Empresa*</label>
              <select
                value={uploadForm.empresa_id}
                onChange={(e) => setUploadForm((prev) => ({ ...prev, empresa_id: e.target.value, pedimento_id: '' }))}
              >
                <option value="">Seleccione empresa</option>
                {uploadEmpresas.map((empresa) => (
                  <option key={empresa.id} value={empresa.id}>{empresa.nombre}</option>
                ))}
              </select>
            </div>

            <div className="inventarios-filter-group">
              <label>Pedimento</label>
              <select
                value={uploadForm.pedimento_id}
                onChange={(e) => setUploadForm((prev) => ({ ...prev, pedimento_id: e.target.value }))}
              >
                <option value="">Sin pedimento</option>
                {pedimentosDisponibles.map((pedimento) => (
                  <option key={pedimento.id} value={pedimento.id}>{pedimento.nombre_pedimento}</option>
                ))}
              </select>
            </div>

            <div className="inventarios-filter-group">
              <label>Mes del archivo*</label>
              <select
                value={uploadForm.mes_evaluacion}
                onChange={(e) => setUploadForm((prev) => ({ ...prev, mes_evaluacion: Number(e.target.value) }))}
              >
                {MES_NAMES.map((mes, idx) => (
                  <option key={mes} value={idx + 1}>{mes}</option>
                ))}
              </select>
            </div>

            <div className="inventarios-filter-group">
              <label>Año del archivo*</label>
              <select
                value={uploadForm.anio_evaluacion}
                onChange={(e) => setUploadForm((prev) => ({ ...prev, anio_evaluacion: Number(e.target.value) }))}
              >
                {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map((year) => (
                  <option key={year} value={year}>{year}</option>
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
                    {(catalogo.tipos || []).map((tipo) => (
                      <option key={tipo} value={tipo}>{tipo}</option>
                    ))}
                  </select>
                </div>
                <div className="inventarios-rgce-file-rename">
                  <input
                    type="text"
                    value={item.nuevo_nombre}
                    onChange={(e) => handleDraftChange(index, 'nuevo_nombre', e.target.value)}
                    placeholder={item.file ? 'Nuevo nombre del archivo' : 'Nombre del archivo'}
                    disabled={!item.file}
                  />
                </div>
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

      <section className="inventarios-upload-card" style={{ marginTop: '24px' }}>
        <h2>Operaciones virtuales</h2>
        <div className="inventarios-contabilidad-form">
          <div className="inventarios-filters" style={{ gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))', marginBottom: '1rem' }}>
            <div className="inventarios-filter-group">
              <label>Razón social*</label>
              <select
                value={virtualForm.razon_social_id}
                onChange={(e) => setVirtualForm((prev) => ({ ...prev, razon_social_id: e.target.value, empresa_id: '' }))}
              >
                <option value="">Seleccione razón social</option>
                {(razonesSociales || []).map((rs) => (
                  <option key={rs.id} value={rs.id}>{rs.nombre}</option>
                ))}
              </select>
            </div>
            <div className="inventarios-filter-group">
              <label>Empresa*</label>
              <select
                value={virtualForm.empresa_id}
                onChange={(e) => setVirtualForm((prev) => ({ ...prev, empresa_id: e.target.value }))}
              >
                <option value="">Seleccione empresa</option>
                {(catalogo.empresas || []).filter((empresa) => String(empresa.id_razon) === String(virtualForm.razon_social_id)).map((empresa) => (
                  <option key={empresa.id} value={empresa.id}>{empresa.nombre}</option>
                ))}
              </select>
            </div>
            <div className="inventarios-filter-group">
              <label>Nombre de la operación*</label>
              <input
                type="text"
                value={virtualForm.nombre_operacion}
                onChange={(e) => setVirtualForm((prev) => ({ ...prev, nombre_operacion: e.target.value }))}
                placeholder="Ej. Transferencia de materiales"
              />
            </div>
            <div className="inventarios-filter-group">
              <label>Tipo de virtual*</label>
              <select
                value={virtualForm.tipo_virtual}
                onChange={(e) => setVirtualForm((prev) => ({ ...prev, tipo_virtual: e.target.value }))}
              >
                <option value="Transferencia">Transferencia</option>
                <option value="Ajuste">Ajuste</option>
                <option value="Traspaso">Traspaso</option>
                <option value="Inventario">Inventario</option>
              </select>
            </div>
            <div className="inventarios-filter-group">
              <label>Cantidad</label>
              <input
                type="number"
                min="0"
                value={virtualForm.cantidad}
                onChange={(e) => setVirtualForm((prev) => ({ ...prev, cantidad: Number(e.target.value || 0) }))}
              />
            </div>
            <div className="inventarios-filter-group">
              <label>Mes</label>
              <select
                value={virtualForm.mes_evaluacion}
                onChange={(e) => setVirtualForm((prev) => ({ ...prev, mes_evaluacion: Number(e.target.value) }))}
              >
                {MES_NAMES.map((mes, idx) => (
                  <option key={mes} value={idx + 1}>{mes}</option>
                ))}
              </select>
            </div>
            <div className="inventarios-filter-group">
              <label>Año</label>
              <select
                value={virtualForm.anio_evaluacion}
                onChange={(e) => setVirtualForm((prev) => ({ ...prev, anio_evaluacion: Number(e.target.value) }))}
              >
                {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <div className="inventarios-filter-group" style={{ gridColumn: '1 / -1' }}>
              <label>Observaciones</label>
              <textarea
                rows="3"
                value={virtualForm.observaciones}
                onChange={(e) => setVirtualForm((prev) => ({ ...prev, observaciones: e.target.value }))}
                placeholder="Detalles adicionales de la operación virtual"
              />
            </div>
          </div>

          <div className="inventarios-contabilidad-actions">
            <button type="button" className="inventarios-btn inventarios-btn-primary" onClick={handleVirtualSubmit} disabled={savingVirtual || !virtualForm.razon_social_id || !virtualForm.empresa_id || !virtualForm.nombre_operacion.trim()}>
              {savingVirtual ? 'Guardando...' : 'Guardar operación virtual'}
            </button>
          </div>

          {virtuales.length > 0 && (
            <div style={{ marginTop: '20px' }}>
              <h3 style={{ margin: '0 0 12px' }}>Registros recientes</h3>
              <div className="inventarios-requests-table-wrap">
                <table className="inventarios-requests-table">
                  <thead>
                    <tr>
                      <th>Operación</th>
                      <th>Tipo</th>
                      <th>Cantidad</th>
                      <th>Empresa</th>
                      <th>Mes / Año</th>
                    </tr>
                  </thead>
                  <tbody>
                    {virtuales.map((item) => (
                      <tr key={item.id}>
                        <td>{item.nombre_operacion}</td>
                        <td>{item.tipo_virtual}</td>
                        <td>{item.cantidad}</td>
                        <td>{item.empresa_nombre || 'N/A'}</td>
                        <td>{MES_NAMES[(Number(item.mes_evaluacion || 1) - 1)] || ''} / {item.anio_evaluacion}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>

      {loading && <div className="inventarios-loading">Cargando información...</div>}
    </div>
  );
}
