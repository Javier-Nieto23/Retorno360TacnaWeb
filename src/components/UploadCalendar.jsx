import { useEffect, useMemo, useState } from 'react';
import { fileService } from '../services/api';
import './UploadCalendar.css';

const MONTH_NAMES = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
];

const WEEK_DAYS = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];

function buildFilterParams(filterParams) {
    const params = {};

    if (filterParams?.razon_social_id) {
        params.razon_social_id = filterParams.razon_social_id;
    }

    if (filterParams?.empresa_id) {
        params.empresa_id = filterParams.empresa_id;
    }

    return params;
}

export default function UploadCalendar({
    title = 'Calendario de subidas',
    subtitle = 'Días marcados con al menos una subida de Excel.',
    filterParams,
    refreshKey,
}) {
    const [cursor, setCursor] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1);
    });
    const [uploadedByDay, setUploadedByDay] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const label = `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`;

    const calendarCells = useMemo(() => {
        const year = cursor.getFullYear();
        const month = cursor.getMonth();
        const firstDay = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstWeekDay = (firstDay.getDay() + 6) % 7;
        const cells = [];

        for (let i = 0; i < firstWeekDay; i += 1) {
            cells.push(null);
        }

        for (let day = 1; day <= daysInMonth; day += 1) {
            cells.push(day);
        }

        while (cells.length < 42) {
            cells.push(null);
        }

        return cells;
    }, [cursor]);

    useEffect(() => {
        let active = true;

        async function loadCalendar() {
            setLoading(true);
            setError('');

            try {
                const params = {
                    ...buildFilterParams(filterParams),
                    anio: cursor.getFullYear(),
                    mes: cursor.getMonth() + 1,
                };

                const { data } = await fileService.historial(params);
                if (!active) return;

                const dayMap = {};
                (data.archivos || []).forEach((archivo) => {
                    if (!archivo.uploaded_at) return;
                    const day = new Date(archivo.uploaded_at).getDate();
                    dayMap[day] = (dayMap[day] || 0) + 1;
                });

                setUploadedByDay(dayMap);
            } catch (err) {
                if (!active) return;
                setUploadedByDay({});
                setError(err.response?.data?.error || 'No se pudo cargar el calendario de subidas.');
            } finally {
                if (active) setLoading(false);
            }
        }

        loadCalendar();

        return () => {
            active = false;
        };
    }, [cursor, filterParams?.empresa_id, filterParams?.razon_social_id, refreshKey]);

    const now = new Date();
    const isCurrentMonth = now.getFullYear() === cursor.getFullYear() && now.getMonth() === cursor.getMonth();

    return (
        <section className="upload-calendar-card">
            <div className="upload-calendar-header">
                <h2>{title}</h2>
                <div className="upload-calendar-nav">
                    <button type="button" className="upload-calendar-nav-btn" onClick={() => setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))} aria-label="Mes anterior">‹</button>
                    <span className="upload-calendar-label">{label}</span>
                    <button type="button" className="upload-calendar-nav-btn" onClick={() => setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))} aria-label="Mes siguiente">›</button>
                </div>
            </div>
            <p className="upload-calendar-subtitle">{subtitle}</p>

            {error && <div className="upload-calendar-error">{error}</div>}

            {loading ? (
                <div className="upload-calendar-loading">Cargando calendario...</div>
            ) : (
                <div className="upload-calendar-grid" role="grid" aria-label={`Calendario de subidas para ${label}`}>
                    {WEEK_DAYS.map((weekday) => (
                        <div key={weekday} className="upload-calendar-weekday">{weekday}</div>
                    ))}

                    {calendarCells.map((day, index) => {
                        const uploads = day ? Number(uploadedByDay[day] || 0) : 0;
                        const hasUploads = uploads > 0;
                        const isToday = day && isCurrentMonth && day === now.getDate();
                        const className = [
                            'upload-calendar-day',
                            !day ? 'empty' : '',
                            hasUploads ? 'has-upload' : '',
                            isToday ? 'today' : '',
                        ].filter(Boolean).join(' ');

                        return (
                            <div
                                key={`${day || 'empty'}-${index}`}
                                className={className}
                                role="gridcell"
                                aria-label={day ? `Día ${day}${hasUploads ? `, ${uploads} subida${uploads > 1 ? 's' : ''}` : ', sin subidas'}` : 'Celda vacía'}
                            >
                                {day ? (
                                    <>
                                        <span className="upload-calendar-day-number">{day}</span>
                                        {hasUploads && <span className="upload-calendar-dot" title={`${uploads} subida${uploads > 1 ? 's' : ''}`} />}
                                    </>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}