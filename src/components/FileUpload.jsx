import { useState, useRef, useCallback, useEffect } from 'react';
import { fileService } from '../services/api';
import './FileUpload.css';
import { useAuth } from '../context/AuthContext';

const MESES = [
    { num: 1, nombre: 'Enero' }, { num: 2, nombre: 'Febrero' }, { num: 3, nombre: 'Marzo' },
    { num: 4, nombre: 'Abril' }, { num: 5, nombre: 'Mayo' }, { num: 6, nombre: 'Junio' },
    { num: 7, nombre: 'Julio' }, { num: 8, nombre: 'Agosto' }, { num: 9, nombre: 'Septiembre' },
    { num: 10, nombre: 'Octubre' }, { num: 11, nombre: 'Noviembre' }, { num: 12, nombre: 'Diciembre' },
];

const anioActual = new Date().getFullYear();
const ANIOS = Array.from({ length: 5 }, (_, i) => anioActual - i);

export default function FileUpload({ onUploadSuccess }) {
    const inputRef = useRef(null);
    const [file, setFile] = useState(null);
    const [anio, setAnio] = useState(anioActual);
    const [mes, setMes] = useState(new Date().getMonth() + 1);
    const [dragging, setDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState(null); // { success, message }
    const { user } = useAuth();
    const [showConfirm, setShowConfirm] = useState(false);
    const [confirmMsg, setConfirmMsg] = useState('');
    const [razonesSociales, setRazonesSociales] = useState([]);
    const [empresas, setEmpresas] = useState([]);
    const [razonSocialId, setRazonSocialId] = useState(String(user?.razon_social_id || ''));
    const [empresaId, setEmpresaId] = useState('');
    const [loadingRazonesSociales, setLoadingRazonesSociales] = useState(false);
    const [loadingEmpresas, setLoadingEmpresas] = useState(false);

    const roleName = String(user?.rol_nombre || '').toLowerCase();
    const isAdminRole = roleName === 'admin';
    const isInventariosRole = roleName === 'inventarios';
    const requiresCompanySelection = isInventariosRole || isAdminRole;
    const razonSocialSeleccionada = razonesSociales.find((rs) => String(rs.id) === String(razonSocialId));
    const empresaSeleccionada = empresas.find((e) => String(e.id) === String(empresaId));

    useEffect(() => {
        if (!user) {
            console.warn('No se ha iniciado sesión');
        }
    }, [user]);

    useEffect(() => {
        if (file && user) {
            const razonSocialFolder = razonSocialSeleccionada?.r2_folder || user.r2_folder || '[carpeta_razon_social]';
            setConfirmMsg(
                `El inventario será registrado usando la razón social seleccionada.\n` +
                `El archivo se almacenará en la ruta: ${razonSocialFolder}${(empresaSeleccionada?.nombre || '[empresa]')}/${anio}/${String(mes).padStart(2, '0')}/${file.name}`
            );
        } else {
            setConfirmMsg('');
        }
    }, [file, user, anio, mes, empresaSeleccionada?.nombre, razonSocialSeleccionada?.r2_folder]);

    useEffect(() => {
        if (!user || !requiresCompanySelection) return;

        let active = true;

        async function cargarRazonesSociales() {
            setLoadingRazonesSociales(true);
            try {
                const { data } = await fileService.razonesSocialesDisponibles();
                if (!active) return;

                const razonesData = data.razones_sociales || [];
                setRazonesSociales(razonesData);

                if (!razonSocialId) {
                    setRazonSocialId(String(user.razon_social_id || razonesData[0]?.id || ''));
                }
            } catch {
                if (active) setRazonesSociales([]);
            } finally {
                if (active) setLoadingRazonesSociales(false);
            }
        }

        cargarRazonesSociales();

        return () => {
            active = false;
        };
    }, [user, requiresCompanySelection, razonSocialId]);

    useEffect(() => {
        if (!user || !requiresCompanySelection || !razonSocialId) return;

        async function cargarEmpresas() {
            setLoadingEmpresas(true);
            try {
                const { data } = await fileService.empresasDisponibles({ razon_social_id: razonSocialId });
                const empresasData = data.empresas || [];
                setEmpresas(empresasData);

                if (empresasData.length === 1) {
                    setEmpresaId(String(empresasData[0].id));
                }
            } catch {
                setEmpresas([]);
            } finally {
                setLoadingEmpresas(false);
            }
        }

        cargarEmpresas();
    }, [user, requiresCompanySelection, razonSocialId]);

    const handleFile = (f) => {
        if (!f) return;
        if (!f.name.match(/\.(xlsx|xls)$/i)) {
            setResult({ success: false, message: 'Solo se permiten archivos Excel (.xlsx, .xls).' });
            return;
        }
        setFile(f);
        setResult(null);
    };

    const onDrop = useCallback((e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files[0];
        handleFile(f);
    }, []);

    const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
    const onDragLeave = () => setDragging(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!file) { setResult({ success: false, message: 'Seleccione un archivo.' }); return; }
        if (requiresCompanySelection && (!razonSocialId || !empresaId)) {
            setResult({ success: false, message: 'Seleccione una razón social y una empresa antes de subir el archivo.' });
            return;
        }
        setShowConfirm(true);
    };

    const handleConfirmUpload = async () => {
        setShowConfirm(false);
        setUploading(true);
        setResult(null);
        try {
            const formData = new FormData();
            formData.append('archivo', file);
            formData.append('anio', anio);
            formData.append('mes', mes);
            if (requiresCompanySelection) {
                formData.append('razon_social_id', razonSocialId);
                formData.append('empresa_id', empresaId);
            }
            await fileService.upload(formData);
            setResult({ success: true, message: `"${file.name}" subido correctamente.` });
            setFile(null);
            if (inputRef.current) inputRef.current.value = '';
            onUploadSuccess?.();
        } catch (err) {
            setResult({ success: false, message: err.response?.data?.error || 'Error al subir el archivo.' });
        } finally {
            setUploading(false);
        }
    };

    const mesNombre = MESES.find((m) => m.num === Number(mes))?.nombre;

    return (
        <form className="upload-form" onSubmit={handleSubmit}>
            <h2 className="upload-title">Subir archivo Excel</h2>

            {/* Selección de período */}
            <div className="period-row">
                <div className="form-field">
                    <label>Año</label>
                    <select value={anio} onChange={(e) => setAnio(e.target.value)} disabled={uploading}>
                        {ANIOS.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                </div>
                <div className="form-field">
                    <label>Mes</label>
                    <select value={mes} onChange={(e) => setMes(e.target.value)} disabled={uploading}>
                        {MESES.map((m) => <option key={m.num} value={m.num}>{m.nombre}</option>)}
                    </select>
                </div>
            </div>

            {requiresCompanySelection && (
                <div className="company-row">
                    <div className="form-field">
                        <label>Razón social*</label>
                        <select
                            value={razonSocialId}
                            onChange={(e) => {
                                setRazonSocialId(e.target.value);
                                setEmpresaId('');
                                setResult(null);
                            }}
                            disabled={uploading || loadingRazonesSociales}
                            required
                        >
                            <option value="">Seleccione razón social</option>
                            {razonesSociales.map((rs) => (
                                <option key={rs.id} value={rs.id}>{rs.nombre}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-field">
                        <label>Empresa*</label>
                        <select
                            value={empresaId}
                            onChange={(e) => {
                                setEmpresaId(e.target.value);
                                setResult(null);
                            }}
                            disabled={uploading || loadingEmpresas || !razonSocialId}
                            required
                        >
                            <option value="">Seleccione empresa</option>
                            {empresas.map((empresa) => (
                                <option key={empresa.id} value={empresa.id}>{empresa.nombre}</option>
                            ))}
                        </select>
                    </div>
                </div>
            )}

            {/* Zona drag & drop */}
            <div
                className={`dropzone ${dragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onClick={() => !uploading && inputRef.current?.click()}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    style={{ display: 'none' }}
                    onChange={(e) => handleFile(e.target.files[0])}
                    disabled={uploading}
                />
                {file ? (
                    <div className="file-preview">
                        <span className="file-icon">📄</span>
                        <div className="file-info">
                            <span className="file-name">{file.name}</span>
                            <span className="file-meta">
                                {(file.size / 1024).toFixed(1)} KB · {mesNombre} {anio}
                            </span>
                        </div>
                        <button
                            type="button"
                            className="remove-file"
                            onClick={(e) => { e.stopPropagation(); setFile(null); setResult(null); }}
                        >✕</button>
                    </div>
                ) : (
                    <div className="dropzone-placeholder">
                        <span className="drop-icon">📂</span>
                        <p>Arrastra tu archivo aquí o <strong>haz clic para seleccionar</strong></p>
                        <span className="drop-hint">Archivos .xlsx y .xls · Máximo 50 MB</span>
                    </div>
                )}
            </div>

            {result && (
                <div className={`upload-result ${result.success ? 'success' : 'error'}`} role="alert">
                    {result.success ? '✓' : '✕'} {result.message}
                </div>
            )}

            <button type="submit" className="btn-upload" disabled={!file || uploading || (requiresCompanySelection && (!razonSocialId || !empresaId))}>
                {uploading ? <><span className="spinner-sm" /> Subiendo...</> : 'Subir archivo'}
            </button>

            {showConfirm && (
                <div className="modal-confirm">
                    <div className="modal-content">
                        <h3>Confirmar subida de archivo</h3>
                        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{confirmMsg}</pre>
                        <div className="modal-actions">
                            <button type="button" className="btn-upload" onClick={handleConfirmUpload} disabled={uploading}>Confirmar</button>
                            <button type="button" className="btn-cancel" onClick={() => setShowConfirm(false)} disabled={uploading}>Cancelar</button>
                        </div>
                    </div>
                </div>
            )}
        </form>
    );
}
