import { useCallback, useEffect, useState } from 'react';
import { fileService } from '../services/api';
import './ClientSections.css';

function formatDate(value) {
    return new Date(value).toLocaleString('es-PE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function SolicitudParte() {
    const [numerosParte, setNumerosParte] = useState([]);
    const [loadingNumerosParte, setLoadingNumerosParte] = useState(true);
    const [numeroParteForm, setNumeroParteForm] = useState({
        numero_parte: '',
        descripcion_esp: '',
        descripcion_ing: '',
        unidad_medida: '',
        unit_horas: '',
        peso_cantidad: '',
        piezas: '',
        pais_origen: '',
        similar: '',
    });
    const [imagenArchivo, setImagenArchivo] = useState(null);
    const [imagenPreview, setImagenPreview] = useState('');
    const [numeroParteSaving, setNumeroParteSaving] = useState(false);
    const [numeroParteError, setNumeroParteError] = useState('');
    const [numeroParteSuccess, setNumeroParteSuccess] = useState('');

    const cargarNumerosParte = useCallback(async () => {
        setLoadingNumerosParte(true);
        setNumeroParteError('');

        try {
            const { data } = await fileService.listarNumerosParte();
            setNumerosParte(data?.numeros_parte || []);
        } catch (err) {
            setNumerosParte([]);
            setNumeroParteError(err.response?.data?.error || 'No se pudieron cargar los números de parte.');
        } finally {
            setLoadingNumerosParte(false);
        }
    }, []);

    useEffect(() => {
        cargarNumerosParte();
    }, [cargarNumerosParte]);

    useEffect(() => {
        if (!imagenArchivo) {
            setImagenPreview('');
            return undefined;
        }

        const previewUrl = URL.createObjectURL(imagenArchivo);
        setImagenPreview(previewUrl);

        return () => URL.revokeObjectURL(previewUrl);
    }, [imagenArchivo]);

    const resetForm = () => {
        setNumeroParteForm({
            numero_parte: '',
            descripcion_esp: '',
            descripcion_ing: '',
            unidad_medida: '',
            unit_horas: '',
            peso_cantidad: '',
            piezas: '',
            pais_origen: '',
            similar: '',
        });
        setImagenArchivo(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const numeroParte = String(numeroParteForm.numero_parte || '').trim();
        const descripcionEsp = String(numeroParteForm.descripcion_esp || '').trim();
        const descripcionIng = String(numeroParteForm.descripcion_ing || '').trim();
        const unidadMedida = String(numeroParteForm.unidad_medida || '').trim();
        const unitHoras = String(numeroParteForm.unit_horas || '').trim();
        const pesoCantidad = String(numeroParteForm.peso_cantidad || '').trim();
        const piezas = String(numeroParteForm.piezas || '').trim();
        const paisOrigen = String(numeroParteForm.pais_origen || '').trim();
        const similar = String(numeroParteForm.similar || '').trim();

        if (!numeroParte) {
            setNumeroParteError('Ingresa un número de parte.');
            return;
        }

        if (!descripcionEsp) {
            setNumeroParteError('Ingresa la descripción en español.');
            return;
        }

        setNumeroParteSaving(true);
        setNumeroParteError('');
        setNumeroParteSuccess('');

        try {
            const formData = new FormData();
            formData.append('numero_parte', numeroParte);
            formData.append('descripcion_esp', descripcionEsp);
            formData.append('descripcion_ing', descripcionIng);
            formData.append('unidad_medida', unidadMedida);
            formData.append('unit_horas', unitHoras);
            formData.append('peso_cantidad', pesoCantidad);
            formData.append('piezas', piezas);
            formData.append('pais_origen', paisOrigen);
            formData.append('similar', similar);

            if (imagenArchivo) {
                formData.append('imagen', imagenArchivo);
            }

            await fileService.crearNumeroParte(formData);
            resetForm();
            setNumeroParteSuccess('Número de parte registrado correctamente.');
            await cargarNumerosParte();
        } catch (err) {
            setNumeroParteError(err.response?.data?.error || 'No se pudo registrar el número de parte.');
        } finally {
            setNumeroParteSaving(false);
        }
    };

    return (
        <div className="client-section-page">
            <div className="client-section-card">
                <div className="client-section-head">
                    <div>
                        <h1>Solicitud de parte</h1>
                        <p>Registra un número de parte asociado a tu empresa.</p>
                    </div>
                    <span className="client-section-badge">{numerosParte.length} registrados</span>
                </div>

                <form className="client-part-form" onSubmit={handleSubmit}>
                    <div className="client-part-grid">
                        <div className="client-part-field">
                        <label htmlFor="numero_parte">Número de parte</label>
                        <input
                            id="numero_parte"
                            type="text"
                            value={numeroParteForm.numero_parte}
                            onChange={(e) => setNumeroParteForm((prev) => ({ ...prev, numero_parte: e.target.value }))}
                            placeholder="Ej: ABC-12345"
                            maxLength={120}
                            disabled={numeroParteSaving}
                        />
                        </div>

                        <div className="client-part-field client-part-field-full">
                            <label htmlFor="numero_parte_descripcion_esp">Descripción en español</label>
                            <textarea
                                id="numero_parte_descripcion_esp"
                                value={numeroParteForm.descripcion_esp}
                                onChange={(e) => setNumeroParteForm((prev) => ({ ...prev, descripcion_esp: e.target.value }))}
                                placeholder="Descripción principal del producto o parte"
                                rows={3}
                                maxLength={500}
                                disabled={numeroParteSaving}
                            />
                        </div>

                        <div className="client-part-field client-part-field-full">
                            <label htmlFor="numero_parte_descripcion_ing">Descripción en inglés</label>
                            <textarea
                                id="numero_parte_descripcion_ing"
                                value={numeroParteForm.descripcion_ing}
                                onChange={(e) => setNumeroParteForm((prev) => ({ ...prev, descripcion_ing: e.target.value }))}
                                placeholder="English description"
                                rows={3}
                                maxLength={500}
                                disabled={numeroParteSaving}
                            />
                        </div>

                        <div className="client-part-field">
                            <label htmlFor="numero_parte_unidad_medida">Unidad de medida</label>
                            <input
                                id="numero_parte_unidad_medida"
                                type="text"
                                value={numeroParteForm.unidad_medida}
                                onChange={(e) => setNumeroParteForm((prev) => ({ ...prev, unidad_medida: e.target.value }))}
                                placeholder="Ej: caja, pieza, kg"
                                maxLength={100}
                                disabled={numeroParteSaving}
                            />
                        </div>

                        <div className="client-part-field">
                            <label htmlFor="numero_parte_unit_horas">Unit en horas</label>
                            <input
                                id="numero_parte_unit_horas"
                                type="number"
                                step="0.01"
                                min="0"
                                value={numeroParteForm.unit_horas}
                                onChange={(e) => setNumeroParteForm((prev) => ({ ...prev, unit_horas: e.target.value }))}
                                placeholder="0.00"
                                disabled={numeroParteSaving}
                            />
                        </div>

                        <div className="client-part-field">
                            <label htmlFor="numero_parte_peso_cantidad">Peso (cantidad)</label>
                            <input
                                id="numero_parte_peso_cantidad"
                                type="number"
                                step="0.001"
                                min="0"
                                value={numeroParteForm.peso_cantidad}
                                onChange={(e) => setNumeroParteForm((prev) => ({ ...prev, peso_cantidad: e.target.value }))}
                                placeholder="0.000"
                                disabled={numeroParteSaving}
                            />
                        </div>

                        <div className="client-part-field">
                            <label htmlFor="numero_parte_piezas">Piezas</label>
                            <input
                                id="numero_parte_piezas"
                                type="number"
                                min="0"
                                step="1"
                                value={numeroParteForm.piezas}
                                onChange={(e) => setNumeroParteForm((prev) => ({ ...prev, piezas: e.target.value }))}
                                placeholder="0"
                                disabled={numeroParteSaving}
                            />
                        </div>

                        <div className="client-part-field">
                            <label htmlFor="numero_parte_pais_origen">País de origen</label>
                            <input
                                id="numero_parte_pais_origen"
                                type="text"
                                value={numeroParteForm.pais_origen}
                                onChange={(e) => setNumeroParteForm((prev) => ({ ...prev, pais_origen: e.target.value }))}
                                placeholder="Ej: Perú"
                                maxLength={120}
                                disabled={numeroParteSaving}
                            />
                        </div>

                        <div className="client-part-field client-part-field-full">
                            <label htmlFor="numero_parte_similar">Similar</label>
                            <input
                                id="numero_parte_similar"
                                type="text"
                                value={numeroParteForm.similar}
                                onChange={(e) => setNumeroParteForm((prev) => ({ ...prev, similar: e.target.value }))}
                                placeholder="Parte o referencia similar"
                                maxLength={250}
                                disabled={numeroParteSaving}
                            />
                        </div>

                        <div className="client-part-field client-part-field-full">
                            <label htmlFor="numero_parte_imagen">Imagen</label>
                            <input
                                id="numero_parte_imagen"
                                type="file"
                                accept="image/*"
                                onChange={(e) => setImagenArchivo(e.target.files?.[0] || null)}
                                disabled={numeroParteSaving}
                            />
                            <p className="client-part-help">Puedes adjuntar una imagen JPG, PNG, WEBP o GIF.</p>
                        </div>
                    </div>

                    {imagenPreview && (
                        <div className="client-part-image-preview">
                            <img src={imagenPreview} alt="Vista previa de la imagen seleccionada" />
                        </div>
                    )}

                    {numeroParteError && <p className="client-part-message error">{numeroParteError}</p>}
                    {numeroParteSuccess && <p className="client-part-message success">{numeroParteSuccess}</p>}

                    <button type="submit" className="client-part-submit" disabled={numeroParteSaving}>
                        {numeroParteSaving ? 'Guardando...' : 'Guardar número de parte'}
                    </button>
                </form>

                <div className="client-part-list">
                    {loadingNumerosParte ? (
                        <div className="client-part-empty">Cargando números de parte...</div>
                    ) : numerosParte.length === 0 ? (
                        <div className="client-part-empty">
                            <span>🔧</span>
                            <p>No hay números de parte registrados aún.</p>
                        </div>
                    ) : (
                        numerosParte.map((item) => (
                            <article key={item.id} className="client-part-item">
                                <div className="client-part-item-body">
                                    <p className="client-part-code">{item.numero_parte}</p>
                                    <p className="client-part-meta">ES: {item.descripcion_esp || item.descripcion || 'Sin descripción'}</p>
                                    <p className="client-part-meta">EN: {item.descripcion_ing || 'Sin descripción en inglés'}</p>
                                    <div className="client-part-details">
                                        <span>Unidad: {item.unidad_medida || '—'}</span>
                                        <span>Horas: {item.unit_horas ?? '—'}</span>
                                        <span>Peso: {item.peso_cantidad ?? '—'}</span>
                                        <span>Piezas: {item.piezas ?? '—'}</span>
                                        <span>País: {item.pais_origen || '—'}</span>
                                        <span>Similar: {item.similar || '—'}</span>
                                    </div>
                                    {item.imagen_storage_url && (
                                        <a className="client-part-image-link" href={item.imagen_storage_url} target="_blank" rel="noreferrer">
                                            Ver imagen
                                        </a>
                                    )}
                                </div>
                                <span className="client-part-date">{formatDate(item.created_at)}</span>
                            </article>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
