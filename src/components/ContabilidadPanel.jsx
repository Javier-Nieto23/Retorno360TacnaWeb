import { useMemo, useState } from 'react';
import { contabilidadService } from '../services/api';

function parseFilenameFromContentDisposition(headerValue) {
    const raw = String(headerValue || '');
    const utf8Match = raw.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
        return decodeURIComponent(utf8Match[1]);
    }

    const basicMatch = raw.match(/filename="?([^";]+)"?/i);
    if (basicMatch?.[1]) {
        return basicMatch[1];
    }

    return null;
}

async function parseAxiosBlobError(error) {
    const fallbackMessage = 'No se pudo generar el reporte de contabilidad.';

    try {
        const blob = error?.response?.data;
        if (!(blob instanceof Blob)) {
            return error?.response?.data?.error || error?.message || fallbackMessage;
        }

        const text = await blob.text();
        if (!text) return fallbackMessage;

        const parsed = JSON.parse(text);
        return parsed?.error || fallbackMessage;
    } catch {
        return error?.message || fallbackMessage;
    }
}

function triggerFileDownload(blob, filename) {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
}

export default function ContabilidadPanel({ appliedFilters, razonesSociales, empresasDisponibles }) {
    const [campo, setCampo] = useState('');
    const [anio, setAnio] = useState(new Date().getFullYear());
    const [generando, setGenerando] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const razonSocialNombre = useMemo(() => {
        if (!appliedFilters?.razon_social_id) return 'Todas';
        const found = (razonesSociales || []).find((rs) => String(rs.id) === String(appliedFilters.razon_social_id));
        return found?.nombre || `ID ${appliedFilters.razon_social_id}`;
    }, [appliedFilters?.razon_social_id, razonesSociales]);

    const empresaNombre = useMemo(() => {
        if (!appliedFilters?.empresa_id) return 'Todas';
        const found = (empresasDisponibles || []).find((e) => String(e.id) === String(appliedFilters.empresa_id));
        return found?.nombre || `ID ${appliedFilters.empresa_id}`;
    }, [appliedFilters?.empresa_id, empresasDisponibles]);

    const handleGenerarReporte = async (event) => {
        event.preventDefault();
        setError('');
        setSuccess('');

        const campoNormalizado = String(campo || '').trim();
        if (!campoNormalizado) {
            setError('Debes indicar el nombre de la columna/campo que deseas sumar.');
            return;
        }

        const anioNumerico = Number(anio);
        if (!Number.isInteger(anioNumerico) || anioNumerico < 2000 || anioNumerico > 2100) {
            setError('Ingresa un año válido entre 2000 y 2100.');
            return;
        }

        setGenerando(true);
        try {
            const params = {
                campo: campoNormalizado,
                anio: anioNumerico,
            };

            if (appliedFilters?.razon_social_id) {
                params.razon_social_id = appliedFilters.razon_social_id;
            }
            if (appliedFilters?.empresa_id) {
                params.empresa_id = appliedFilters.empresa_id;
            }

            const response = await contabilidadService.generarReporte(params);
            const contentType = String(response?.headers?.['content-type'] || '');

            if (!contentType.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')) {
                throw new Error('La respuesta del servidor no es un archivo Excel válido.');
            }

            const filename = parseFilenameFromContentDisposition(response?.headers?.['content-disposition'])
                || `contabilidad_${campoNormalizado.replace(/\s+/g, '_')}_${anioNumerico}.xlsx`;

            triggerFileDownload(response.data, filename);

            const erroresProcesamiento = Number(response?.headers?.['x-contabilidad-errores'] || 0);
            if (erroresProcesamiento > 0) {
                setSuccess(
                    `Reporte generado con incidencias (${erroresProcesamiento}). Revisa la hoja \"Errores\" del Excel.`
                );
            } else {
                setSuccess('Reporte generado correctamente.');
            }
        } catch (err) {
            const message = await parseAxiosBlobError(err);
            setError(message);
        } finally {
            setGenerando(false);
        }
    };

    return (
        <section className="inventarios-contabilidad-card">
            <div className="inventarios-contabilidad-header">
                <div>
                    <h2>Contabilidad</h2>
                    <p>
                        Analiza todos los Excel del año seleccionado y genera un consolidado mensual con la suma del campo indicado.
                    </p>
                </div>
                <span className="inventarios-requests-badge">Excel consolidado</span>
            </div>

            <div className="inventarios-contabilidad-scope">
                <p><strong>Razón social:</strong> {razonSocialNombre}</p>
                <p><strong>Empresa:</strong> {empresaNombre}</p>
            </div>

            <form className="inventarios-contabilidad-form" onSubmit={handleGenerarReporte}>
                <div className="inventarios-filter-group">
                    <label htmlFor="contabilidad-campo">Columna o campo a sumar</label>
                    <input
                        id="contabilidad-campo"
                        type="text"
                        placeholder="Ejemplo: Importe"
                        value={campo}
                        onChange={(e) => setCampo(e.target.value)}
                    />
                </div>

                <div className="inventarios-filter-group">
                    <label htmlFor="contabilidad-anio">Año</label>
                    <input
                        id="contabilidad-anio"
                        type="number"
                        min="2000"
                        max="2100"
                        step="1"
                        value={anio}
                        onChange={(e) => setAnio(e.target.value)}
                    />
                </div>

                <div className="inventarios-contabilidad-actions">
                    <button type="submit" className="inventarios-btn inventarios-btn-primary" disabled={generando}>
                        {generando ? 'Generando reporte...' : 'Generar y descargar Excel'}
                    </button>
                </div>
            </form>

            {error && <p className="inventarios-error">{error}</p>}
            {success && <p className="inventarios-success">{success}</p>}

            <p className="inventarios-contabilidad-note">
                Consejo: aplica primero los filtros del panel principal para limitar razón social/empresa, luego genera el consolidado.
            </p>
        </section>
    );
}
