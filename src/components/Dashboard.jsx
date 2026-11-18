import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fileService } from '../services/api';
import { detectRazonSocialId } from '../utils/razonSocial';
import './Dashboard.css';
import './ClientSections.css';

const MESES_NOMBRES = [
    '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const STEPS = [
    { title: 'Identificación', hint: 'Número de parte y descripciones' },
    { title: 'Medidas', hint: 'Unidad, horas, peso y piezas' },
    { title: 'Origen', hint: 'País de origen y referencia' },
    { title: 'Imagen', hint: 'Adjunta una imagen y confirma' },
];

const EMPTY_FORM = {
    numero_parte: '',
    descripcion_esp: '',
    descripcion_ing: '',
    unidad_medida: '',
    unit_horas: '',
    peso_cantidad: '',
    piezas: '',
    pais_origen: '',
    similar: '',
};

function generateSolicitudId() {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `SOL-${datePart}-${String(Math.floor(Math.random() * 900000) + 100000)}`;
}

export default function Dashboard() {
    const { user } = useAuth();
    const razonSocialIdDetectado = detectRazonSocialId(user);

    const [numerosParteResumen, setNumerosParteResumen] = useState([]);
    const [loadingResumen, setLoadingResumen] = useState(true);
    const [resumenError, setResumenError] = useState('');

    const [step, setStep] = useState(0);
    const [direction, setDirection] = useState('forward');
    const [numeroParteForm, setNumeroParteForm] = useState(EMPTY_FORM);
    const [imagenArchivo, setImagenArchivo] = useState(null);
    const [imagenPreview, setImagenPreview] = useState('');
    const [numeroParteSaving, setNumeroParteSaving] = useState(false);
    const [numeroParteError, setNumeroParteError] = useState('');
    const [numeroParteSuccess, setNumeroParteSuccess] = useState('');
    const [descripcionInglesHabilitada, setDescripcionInglesHabilitada] = useState(false);
    const [similarHabilitado, setSimilarHabilitado] = useState(false);
    const [respuestaImagen, setRespuestaImagen] = useState(null);
    const [solicitudId, setSolicitudId] = useState(() => generateSolicitudId());
    const [traduciendoDescripcion, setTraduciendoDescripcion] = useState(false);

    const resumenGrafico = useMemo(() => {
        const years = [...new Set(numerosParteResumen.map((item) => Number(item.anio)).filter(Boolean))].sort((a, b) => b - a);
        const anioSeleccionado = years[0] || new Date().getFullYear();
        const dataDelAnio = numerosParteResumen.filter((item) => Number(item.anio) === anioSeleccionado);
        const mapaMeses = new Map(dataDelAnio.map((item) => [Number(item.mes), Number(item.total) || 0]));

        const meses = Array.from({ length: 12 }, (_, index) => {
            const mes = index + 1;
            return { mes, nombre: MESES_NOMBRES[mes], total: mapaMeses.get(mes) || 0 };
        });

        return {
            anioSeleccionado,
            meses,
            totalAnio: meses.reduce((sum, item) => sum + item.total, 0),
        };
    }, [numerosParteResumen]);

    const totalSolicitudes = numerosParteResumen.reduce((sum, r) => sum + (Number(r.total) || 0), 0);
    const maxMonthlyValue = Math.max(1, ...resumenGrafico.meses.map((item) => item.total));

    const cargarResumen = useCallback(async () => {
        setLoadingResumen(true);
        setResumenError('');
        try {
            const { data } = await fileService.resumenMensualNumerosParte();
            setNumerosParteResumen(data.resumen || []);
        } catch (err) {
            setNumerosParteResumen([]);
            setResumenError(err.response?.data?.error || 'No se pudo cargar la información del dashboard.');
        } finally {
            setLoadingResumen(false);
        }
    }, []);

    useEffect(() => {
        cargarResumen();
    }, [cargarResumen]);

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
        setNumeroParteForm(EMPTY_FORM);
        setDescripcionInglesHabilitada(false);
        setSimilarHabilitado(false);
        setRespuestaImagen(null);
        setSolicitudId(generateSolicitudId());
        setTraduciendoDescripcion(false);
        setImagenArchivo(null);
        setStep(0);
        setDirection('forward');
    };

    const updateField = (field) => (e) => {
        const { value } = e.target;
        setNumeroParteForm((prev) => ({ ...prev, [field]: value }));
    };

    const traducirDescripcion = async () => {
        const descripcionEsp = String(numeroParteForm.descripcion_esp || '').trim();

        if (!descripcionEsp) {
            setNumeroParteError('Ingresa la descripción en español antes de traducirla.');
            return;
        }

        setTraduciendoDescripcion(true);
        setNumeroParteError('');
        setNumeroParteSuccess('');

        try {
            const libretranslateBaseUrl = String(import.meta.env.VITE_LIBRETRANSLATE_URL || 'http://localhost:5000').replace(/\/+$/, '');
            const response = await fetch(`${libretranslateBaseUrl}/translate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    q: descripcionEsp,
                    source: 'es',
                    target: 'en',
                    format: 'text',
                }),
            });

            const data = await response.json();
            const traduccion = String(data?.translatedText || '').trim();

            if (!response.ok || !traduccion) {
                throw new Error(data?.error || 'No se pudo traducir la descripción al inglés.');
            }

            setDescripcionInglesHabilitada(true);
            setNumeroParteForm((prev) => ({ ...prev, descripcion_ing: traduccion }));
            setNumeroParteSuccess('Descripción traducida al inglés correctamente.');
        } catch (error) {
            setNumeroParteError(error.message || 'No se pudo traducir la descripción al inglés.');
        } finally {
            setTraduciendoDescripcion(false);
        }
    };

    const validateStep = (stepIndex) => {
        if (stepIndex === 0) {
            if (!String(numeroParteForm.numero_parte || '').trim()) return 'Ingresa un número de parte.';
            if (!String(numeroParteForm.descripcion_esp || '').trim()) return 'Ingresa la descripción en español.';
        }
        return '';
    };

    const goToStep = (target) => {
        setNumeroParteError('');
        setNumeroParteSuccess('');
        setDirection(target > step ? 'forward' : 'backward');
        setStep(target);
    };

    const handleNext = () => {
        const validationError = validateStep(step);
        if (validationError) {
            setNumeroParteError(validationError);
            return;
        }
        goToStep(Math.min(step + 1, STEPS.length - 1));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (step < STEPS.length - 1) {
            handleNext();
            return;
        }

        const numeroParte = String(numeroParteForm.numero_parte || '').trim();
        const descripcionEsp = String(numeroParteForm.descripcion_esp || '').trim();

        if (!numeroParte) {
            setNumeroParteError('Ingresa un número de parte.');
            return;
        }

        if (!descripcionEsp) {
            setNumeroParteError('Ingresa la descripción en español.');
            return;
        }

        if (respuestaImagen === null) {
            setNumeroParteError('Primero responde si deseas agregar una imagen antes de guardar.');
            return;
        }

        if (respuestaImagen === true && !imagenArchivo) {
            setNumeroParteError('Si deseas adjuntar una imagen, selecciona un archivo antes de guardar.');
            return;
        }

        setNumeroParteSaving(true);
        setNumeroParteError('');
        setNumeroParteSuccess('');

        try {
            const formData = new FormData();
            formData.append('numero_parte', numeroParte);
            formData.append('id_solicitud', solicitudId);
            formData.append('descripcion_esp', descripcionEsp);
            formData.append('descripcion_ing', String(numeroParteForm.descripcion_ing || '').trim());
            formData.append('unidad_medida', String(numeroParteForm.unidad_medida || '').trim());
            formData.append('unit_horas', String(numeroParteForm.unit_horas || '').trim());
            formData.append('peso_cantidad', String(numeroParteForm.peso_cantidad || '').trim());
            formData.append('piezas', String(numeroParteForm.piezas || '').trim());
            formData.append('pais_origen', String(numeroParteForm.pais_origen || '').trim());
            formData.append('similar', String(numeroParteForm.similar || '').trim());

            if (imagenArchivo) {
                formData.append('imagen', imagenArchivo);
            }

            await fileService.crearNumeroParte(formData);
            resetForm();
            setNumeroParteSuccess('Número de parte registrado correctamente.');
            await cargarResumen();
        } catch (err) {
            setNumeroParteError(err.response?.data?.error || 'No se pudo registrar el número de parte.');
        } finally {
            setNumeroParteSaving(false);
        }
    };

    return (
        <div className="dashboard">
            <div className="dashboard-header">
                <div>
                    <h1 className="dashboard-welcome">Bienvenido, {user?.alias}</h1>
                    <p className="dashboard-rs">{user?.razon_social_nombre}</p>
                    <p className="dashboard-rs-id">ID Razón Social: {razonSocialIdDetectado}</p>
                </div>
                <div className="dashboard-date">
                    {new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
            </div>

            <div className="stats-row">
                <div className="stat-card">
                    <span className="stat-icon">🔧</span>
                    <div>
                        <p className="stat-value">{totalSolicitudes}</p>
                        <p className="stat-label">Solicitudes totales</p>
                    </div>
                </div>
                <div className="stat-card">
                    <span className="stat-icon">📅</span>
                    <div>
                        <p className="stat-value">{resumenGrafico.totalAnio}</p>
                        <p className="stat-label">Solicitudes en {resumenGrafico.anioSeleccionado}</p>
                    </div>
                </div>
            </div>

            {resumenError && <div className="dashboard-error">{resumenError}</div>}

            <section className="missing-months-card">
                <div className="missing-months-header">
                    <div>
                        <h2 className="section-title">Solicitudes registradas por mes</h2>
                        <p className="missing-months-subtitle">Año {resumenGrafico.anioSeleccionado}</p>
                    </div>
                </div>

                {loadingResumen ? (
                    <div className="loading-text">Cargando gráfico...</div>
                ) : resumenGrafico.totalAnio === 0 ? (
                    <div className="empty-state">
                        <span>📊</span>
                        <p>Aún no hay solicitudes registradas para mostrar la gráfica.</p>
                    </div>
                ) : (
                    <div className="missing-months-chart" role="img" aria-label={`Gráfico de solicitudes registradas por mes en ${resumenGrafico.anioSeleccionado}`}>
                        {resumenGrafico.meses.map((item) => {
                            const height = `${Math.max(8, (item.total / maxMonthlyValue) * 100)}%`;
                            const barClass = item.total >= 2 ? 'multi-files' : item.total > 0 ? 'has-files' : 'no-files';

                            return (
                                <div key={item.mes} className={`missing-months-column ${barClass}`}>
                                    <div className="missing-months-track">
                                        <div className="missing-months-fill" style={{ height }} />
                                    </div>
                                    <span className="missing-months-value">{item.total}</span>
                                    <span className="missing-months-label">{item.nombre}</span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            <section className="client-section-card">
                <div className="client-section-head">
                    <div>
                        <h2 className="section-title">Solicitud de parte</h2>
                        <p>Registra un número de parte asociado a tu empresa.</p>
                    </div>
                </div>

                <form className="client-part-form" onSubmit={handleSubmit}>
                    <ol className="client-part-stepper" aria-label="Progreso de la solicitud">
                        {STEPS.map((item, index) => (
                            <li
                                key={item.title}
                                className={`client-part-stepper-item ${index === step ? 'active' : ''} ${index < step ? 'done' : ''}`}
                                aria-current={index === step ? 'step' : undefined}
                            >
                                <span className="client-part-stepper-dot">{index < step ? '✓' : index + 1}</span>
                                <span className="client-part-stepper-label">{item.title}</span>
                            </li>
                        ))}
                    </ol>
                    <p className="client-part-step-hint">Paso {step + 1} de {STEPS.length}: {STEPS[step].hint}</p>

                    <div key={step} className={`client-part-grid client-part-step ${direction}`}>
                        <div className="client-part-field client-part-field-full">
                            <label htmlFor="numero_parte_solicitud_id">ID de solicitud</label>
                            <input
                                id="numero_parte_solicitud_id"
                                type="text"
                                value={solicitudId}
                                readOnly
                                disabled={numeroParteSaving}
                            />
                        </div>

                        {step === 0 && (<>
                            <div className="client-part-field client-part-field-full">
                                <label htmlFor="numero_parte">Número de parte</label>
                                <input
                                    id="numero_parte"
                                    type="text"
                                    value={numeroParteForm.numero_parte}
                                    onChange={updateField('numero_parte')}
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
                                    onChange={updateField('descripcion_esp')}
                                    placeholder="Descripción principal del producto o parte"
                                    rows={3}
                                    maxLength={500}
                                    disabled={numeroParteSaving}
                                />
                            </div>

                            <div className="client-part-field client-part-field-full">
                                <div className="client-part-toggle-row">
                                    <label className="client-part-toggle" htmlFor="numero_parte_descripcion_ing_habilitada">
                                        <input
                                            id="numero_parte_descripcion_ing_habilitada"
                                            type="checkbox"
                                            checked={descripcionInglesHabilitada}
                                            onChange={(e) => setDescripcionInglesHabilitada(e.target.checked)}
                                            disabled={numeroParteSaving}
                                        />
                                        <span>Agregar descripción en inglés</span>
                                    </label>
                                </div>

                                {descripcionInglesHabilitada && (
                                    <>
                                        <div className="client-part-translation-actions">
                                            <label htmlFor="numero_parte_descripcion_ing">Descripción en inglés</label>
                                            <button
                                                type="button"
                                                className="client-part-translate-button"
                                                onClick={traducirDescripcion}
                                                disabled={numeroParteSaving || traduciendoDescripcion || !String(numeroParteForm.descripcion_esp || '').trim()}
                                            >
                                                {traduciendoDescripcion ? 'Traduciendo...' : 'Traducir desde español'}
                                            </button>
                                        </div>
                                        <textarea
                                            id="numero_parte_descripcion_ing"
                                            value={numeroParteForm.descripcion_ing}
                                            onChange={updateField('descripcion_ing')}
                                            placeholder="English description"
                                            rows={3}
                                            maxLength={500}
                                            disabled={numeroParteSaving}
                                        />
                                    </>
                                )}
                            </div>
                        </>)}

                        {step === 1 && (<>
                            <div className="client-part-field">
                                <label htmlFor="numero_parte_unidad_medida">Unidad de medida</label>
                                <input
                                    id="numero_parte_unidad_medida"
                                    type="text"
                                    value={numeroParteForm.unidad_medida}
                                    onChange={updateField('unidad_medida')}
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
                                    onChange={updateField('unit_horas')}
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
                                    onChange={updateField('peso_cantidad')}
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
                                    onChange={updateField('piezas')}
                                    placeholder="0"
                                    disabled={numeroParteSaving}
                                />
                            </div>
                        </>)}

                        {step === 2 && (<>
                            <div className="client-part-field">
                                <label htmlFor="numero_parte_pais_origen">País de origen</label>
                                <input
                                    id="numero_parte_pais_origen"
                                    type="text"
                                    value={numeroParteForm.pais_origen}
                                    onChange={updateField('pais_origen')}
                                    placeholder="Ej: Perú"
                                    maxLength={120}
                                    disabled={numeroParteSaving}
                                />
                            </div>

                            <div className="client-part-field client-part-field-full">
                                <div className="client-part-toggle-row">
                                    <label className="client-part-toggle" htmlFor="numero_parte_similar_habilitado">
                                        <input
                                            id="numero_parte_similar_habilitado"
                                            type="checkbox"
                                            checked={similarHabilitado}
                                            onChange={(e) => {
                                                const checked = e.target.checked;
                                                setSimilarHabilitado(checked);
                                                if (!checked) {
                                                    setNumeroParteForm((prev) => ({ ...prev, similar: '' }));
                                                }
                                            }}
                                            disabled={numeroParteSaving}
                                        />
                                        <span>Agregar similar</span>
                                    </label>
                                </div>

                                {similarHabilitado && (
                                    <>
                                        <label htmlFor="numero_parte_similar">Similar</label>
                                        <input
                                            id="numero_parte_similar"
                                            type="text"
                                            value={numeroParteForm.similar}
                                            onChange={updateField('similar')}
                                            placeholder="Parte o referencia similar"
                                            maxLength={250}
                                            disabled={numeroParteSaving}
                                        />
                                    </>
                                )}
                            </div>
                        </>)}

                        {step === 3 && (<>
                            <div className="client-part-field client-part-field-full">
                                <div className="client-part-toggle-row">
                                    <span className="client-part-field-label">¿Deseas agregar una imagen?</span>
                                </div>
                                <div className="client-part-choice-group">
                                    <label className="client-part-toggle" htmlFor="numero_parte_agregar_imagen_si">
                                        <input
                                            id="numero_parte_agregar_imagen_si"
                                            type="radio"
                                            name="agregar_imagen"
                                            checked={respuestaImagen === true}
                                            onChange={() => setRespuestaImagen(true)}
                                            disabled={numeroParteSaving}
                                        />
                                        <span>Sí</span>
                                    </label>
                                    <label className="client-part-toggle" htmlFor="numero_parte_agregar_imagen_no">
                                        <input
                                            id="numero_parte_agregar_imagen_no"
                                            type="radio"
                                            name="agregar_imagen"
                                            checked={respuestaImagen === false}
                                            onChange={() => {
                                                setRespuestaImagen(false);
                                                setImagenArchivo(null);
                                            }}
                                            disabled={numeroParteSaving}
                                        />
                                        <span>No</span>
                                    </label>
                                </div>

                                {respuestaImagen === true && (
                                    <>
                                        <label htmlFor="numero_parte_imagen">Imagen</label>
                                        <input
                                            id="numero_parte_imagen"
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) => setImagenArchivo(e.target.files?.[0] || null)}
                                            disabled={numeroParteSaving}
                                        />
                                        <p className="client-part-help">Puedes adjuntar una imagen JPG, PNG, WEBP o GIF.</p>
                                    </>
                                )}
                            </div>

                            <div className="client-part-summary client-part-field-full">
                                <p><strong>{numeroParteForm.numero_parte || '—'}</strong></p>
                                <p>{numeroParteForm.descripcion_esp || 'Sin descripción'}</p>
                                <p>
                                    {[numeroParteForm.unidad_medida, numeroParteForm.piezas && `${numeroParteForm.piezas} pzas`, numeroParteForm.pais_origen]
                                        .filter(Boolean)
                                        .join(' · ') || 'Sin datos adicionales'}
                                </p>
                            </div>
                        </>)}
                    </div>

                    {step === 3 && respuestaImagen === true && imagenPreview && (
                        <div className="client-part-image-preview">
                            <img src={imagenPreview} alt="Vista previa de la imagen seleccionada" />
                        </div>
                    )}

                    {numeroParteError && <p className="client-part-message error">{numeroParteError}</p>}
                    {numeroParteSuccess && <p className="client-part-message success">{numeroParteSuccess}</p>}

                    <div className="client-part-actions">
                        <button
                            type="button"
                            className="client-part-back"
                            onClick={() => goToStep(step - 1)}
                            disabled={step === 0 || numeroParteSaving}
                        >
                            Atrás
                        </button>
                        {step < STEPS.length - 1 ? (
                            <button type="button" className="client-part-submit" onClick={handleNext}>
                                Siguiente
                            </button>
                        ) : (
                            <button type="submit" className="client-part-submit" disabled={numeroParteSaving || respuestaImagen === null}>
                                {numeroParteSaving ? 'Guardando...' : 'Guardar número de parte'}
                            </button>
                        )}
                    </div>
                </form>
            </section>
        </div>
    );
}
