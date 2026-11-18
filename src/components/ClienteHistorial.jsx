import { useEffect, useState } from 'react';
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

function formatEstado(item) {
    const estado = item.solicitud_status || '—';
    if (item.dias_abierto === null || item.dias_abierto === undefined) return `Estado: ${estado}`;
    const dias = item.dias_abierto === 1 ? '1 día' : `${item.dias_abierto} días`;
    return `Estado: ${estado} · ${dias} en estado Abierto`;
}

export default function ClienteHistorial() {
    const [solicitudes, setSolicitudes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;

        fileService.listarNumerosParte()
            .then(({ data }) => {
                if (!cancelled) setSolicitudes(data?.numeros_parte || []);
            })
            .catch((err) => {
                if (!cancelled) setError(err.response?.data?.error || 'No se pudo cargar el historial de solicitudes.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <div className="client-section-page">
            <div className="client-section-card">
                <div className="client-section-head">
                    <div>
                        <h1>Historial de solicitudes</h1>
                        <p>Solicitudes de número de parte enviadas y su estado actual.</p>
                    </div>
                    <span className="client-section-badge">{solicitudes.length} registradas</span>
                </div>

                {error && <p className="client-part-message error">{error}</p>}

                <div className="client-part-list">
                    {loading ? (
                        <div className="client-part-empty">Cargando solicitudes...</div>
                    ) : solicitudes.length === 0 ? (
                        <div className="client-part-empty">
                            <span>🔧</span>
                            <p>No hay solicitudes registradas aún.</p>
                        </div>
                    ) : (
                        solicitudes.map((item) => (
                            <article key={item.id} className="client-part-item">
                                <div className="client-part-item-body">
                                    <p className="client-part-code">{item.numero_parte}</p>
                                    <p className="client-part-meta">Solicitud: {item.id_solicitud || '—'}</p>
                                    <p className="client-part-meta">{formatEstado(item)}</p>
                                    <p className="client-part-meta">ES: {item.descripcion_esp || 'Sin descripción'}</p>
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
