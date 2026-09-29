import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '../context/AuthContext';
import { fileService } from '../services/api';
import './Historial.css';

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

function formatPeriodLabel(anio, mes) {
    if (!anio && !mes) return '—';
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${monthNames[Number(mes) - 1] || '—'} ${anio || ''}`.trim();
}

function getPreviewType(url = '') {
    const lower = String(url).toLowerCase();
    if (lower.endsWith('.pdf')) return 'pdf';
    if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].some((ext) => lower.endsWith(ext))) return 'image';
    if (['.xlsx', '.xls', '.xlsm', '.csv'].some((ext) => lower.endsWith(ext))) return 'excel';
    if (lower.includes('pdf') || lower.includes('image')) return lower.includes('pdf') ? 'pdf' : 'image';
    return 'unsupported';
}

export default function InventariosHistorial() {
    const { user } = useAuth();
    const [archivos, setArchivos] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [filtroTextoRazonSocial, setFiltroTextoRazonSocial] = useState('');
    const [filtroTextoEmpresa, setFiltroTextoEmpresa] = useState('');
    const [preview, setPreview] = useState({ open: false, documento: null, excelRows: [], excelSheetName: '' });

    const cargarArchivos = async () => {
        setLoading(true);
        setError('');

        try {
            const { data } = await fileService.historial();
            const inventarioFiles = (data?.archivos || []).filter((archivo) => {
                const bucketContext = String(archivo?.bucket_context || 'inventory').toLowerCase();
                return bucketContext === 'inventory' || bucketContext === 'inventario';
            });
            setArchivos(inventarioFiles);
        } catch (err) {
            setError(err.response?.data?.error || 'Error al cargar el historial de inventarios.');
            setArchivos([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user) cargarArchivos();
    }, [user]);

    const archivosFiltrados = useMemo(() => {
        const textoRazon = filtroTextoRazonSocial.trim().toLowerCase();
        const textoEmpresa = filtroTextoEmpresa.trim().toLowerCase();

        return (archivos || []).filter((archivo) => {
            const razonNombre = String(archivo.razon_social_nombre || archivo.razon_social_carpeta || '').toLowerCase();
            const empresaNombre = String(archivo.empresa_nombre || archivo.empresa_carpeta || '').toLowerCase();

            const coincideRazon = !textoRazon || razonNombre.includes(textoRazon);
            const coincideEmpresa = !textoEmpresa || empresaNombre.includes(textoEmpresa);
            return coincideRazon && coincideEmpresa;
        });
    }, [archivos, filtroTextoEmpresa, filtroTextoRazonSocial]);

    const abrirPreview = async (documento) => {
        try {
            const { data } = await fileService.obtenerUrlDescarga(documento.id);
            const resolvedUrl = data?.download_url || documento.storage_url || '';

            if (!resolvedUrl) {
                throw new Error('Este archivo no tiene vista previa disponible.');
            }

            if (getPreviewType(resolvedUrl) === 'excel') {
                const response = await fetch(resolvedUrl, { mode: 'cors' });
                if (!response.ok) throw new Error('No se pudo cargar el archivo Excel.');
                const arrayBuffer = await response.arrayBuffer();
                const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0] || 'Hoja1';
                const firstSheet = workbook.Sheets[firstSheetName];
                const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: false, defval: '' }).slice(0, 40);

                setPreview({
                    open: true,
                    documento: { ...documento, storage_url: resolvedUrl },
                    excelRows: rows,
                    excelSheetName: firstSheetName,
                });
                return;
            }

            setPreview({
                open: true,
                documento: { ...documento, storage_url: resolvedUrl },
                excelRows: [],
                excelSheetName: '',
            });
        } catch (err) {
            setError(err.message || 'No se pudo cargar la vista previa.');
        }
    };

    const cerrarPreview = () => {
        setPreview({ open: false, documento: null, excelRows: [], excelSheetName: '' });
    };

    const handleDescargar = async (archivo) => {
        try {
            const { data } = await fileService.obtenerUrlDescarga(archivo.id);
            window.open(data?.download_url || archivo.storage_url || '', '_blank', 'noopener,noreferrer');
        } catch (err) {
            setError(err.message || 'No se pudo descargar el archivo.');
        }
    };

    const handleSolicitarEliminacion = async (archivo) => {
        const motivo = window.prompt(
            `Motivo de la eliminación para "${archivo.nombre_archivo || 'archivo'}"`,
            'Solicito la eliminación del archivo por actualización o error de carga.'
        );

        if (motivo === null) return;

        try {
            await fileService.solicitarEliminacion(archivo.id, motivo.trim() || 'Solicitud de eliminación.');
            await cargarArchivos();
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo registrar la solicitud de eliminación.');
        }
    };

    return (
        <div className="historial-page">
            <div className="historial-header">
                <div>
                    <h1>Historial de inventarios</h1>
                    <p className="historial-subtitle">Sólo para usuarios con rol de inventarios.</p>
                </div>
            </div>

            <div className="historial-filtros">
                <div className="historial-filter-group">
                    <label>Razón social</label>
                    <input
                        value={filtroTextoRazonSocial}
                        onChange={(e) => setFiltroTextoRazonSocial(e.target.value)}
                        placeholder="Buscar por razón social"
                    />
                </div>
                <div className="historial-filter-group">
                    <label>Empresa</label>
                    <input
                        value={filtroTextoEmpresa}
                        onChange={(e) => setFiltroTextoEmpresa(e.target.value)}
                        placeholder="Buscar por empresa"
                    />
                </div>
            </div>

            {error && <p className="historial-error">{error}</p>}

            {loading ? (
                <div className="inventarios-loading">Cargando historial...</div>
            ) : archivosFiltrados.length === 0 ? (
                <div className="inventarios-empty compact">
                    <span>📁</span>
                    <p>No hay archivos de inventario para mostrar.</p>
                </div>
            ) : (
                <div className="historial-table-wrap">
                    <table className="historial-table">
                        <thead>
                            <tr>
                                <th>Archivo</th>
                                <th>Razón social</th>
                                <th>Empresa</th>
                                <th>Período</th>
                                <th>Subido</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {archivosFiltrados.map((archivo) => (
                                <tr key={archivo.id}>
                                    <td>{archivo.nombre_archivo || 'Archivo sin nombre'}</td>
                                    <td>{archivo.razon_social_nombre || '—'}</td>
                                    <td>{archivo.empresa_nombre || '—'}</td>
                                    <td>{formatPeriodLabel(archivo.anio, archivo.mes)}</td>
                                    <td>{formatDateTime(archivo.uploaded_at || archivo.created_at)}</td>
                                    <td>
                                        <div className="historial-actions">
                                            <button type="button" className="historial-btn historial-btn-primary" onClick={() => abrirPreview(archivo)}>
                                                Vista previa
                                            </button>
                                            <button type="button" className="historial-btn historial-btn-secondary" onClick={() => handleDescargar(archivo)}>
                                                Descargar
                                            </button>
                                            <button type="button" className="historial-btn historial-btn-danger" onClick={() => handleSolicitarEliminacion(archivo)}>
                                                Eliminar
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {preview.open && preview.documento && (
                <div className="historial-preview-backdrop" role="dialog" aria-modal="true">
                    <div className="historial-preview-modal">
                        <div className="historial-preview-header">
                            <h2>{preview.documento.nombre_archivo || 'Vista previa'}</h2>
                            <button type="button" className="historial-close-btn" onClick={cerrarPreview}>×</button>
                        </div>

                        {preview.documento.storage_url && getPreviewType(preview.documento.storage_url) === 'pdf' ? (
                            <object data={preview.documento.storage_url} type="application/pdf" className="historial-preview-frame">
                                <embed src={preview.documento.storage_url} type="application/pdf" className="historial-preview-frame" />
                            </object>
                        ) : preview.documento.storage_url && getPreviewType(preview.documento.storage_url) === 'image' ? (
                            <img src={preview.documento.storage_url} alt={preview.documento.nombre_archivo} className="historial-preview-image" />
                        ) : preview.documento.storage_url && getPreviewType(preview.documento.storage_url) === 'excel' ? (
                            <div className="historial-preview-excel-panel">
                                <div className="historial-preview-excel-header">
                                    <span>Hoja: {preview.excelSheetName || 'Hoja 1'}</span>
                                </div>
                                <div className="historial-preview-excel-table-wrap">
                                    <table className="historial-preview-excel-table">
                                        <tbody>
                                            {preview.excelRows.map((row, rowIndex) => (
                                                <tr key={`${preview.documento.id}-row-${rowIndex}`}>
                                                    {(Array.isArray(row) ? row : [row]).map((cell, cellIndex) => (
                                                        <td key={`${preview.documento.id}-cell-${rowIndex}-${cellIndex}`}>{cell ?? ''}</td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div className="historial-preview-placeholder">
                                <p>Vista previa no disponible para este tipo de archivo.</p>
                                <a href={preview.documento.storage_url} target="_blank" rel="noreferrer">Abrir archivo original</a>
                            </div>
                        )}

                        <div className="historial-preview-actions">
                            <button type="button" className="historial-btn historial-btn-primary" onClick={() => handleDescargar(preview.documento)}>
                                Descargar archivo
                            </button>
                            <button type="button" className="historial-btn historial-btn-danger" onClick={() => handleSolicitarEliminacion(preview.documento)}>
                                Solicitar eliminación
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
