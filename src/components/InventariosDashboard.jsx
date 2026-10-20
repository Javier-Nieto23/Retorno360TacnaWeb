import { useState } from 'react';
import { databaseConnectionService } from '../services/api';
import './OperacionesDashboard.css';

export default function InventariosDashboard() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);

    const handleRunExportQuery = async () => {
        setLoading(true);
        setError('');

        try {
            const response = await databaseConnectionService.exportPedimentos();
            setRows(response.data.rows || []);
            setTotal(response.data.total || 0);
        } catch (err) {
            const msg = err.response?.data?.error || err.response?.data?.message || 'No se pudo ejecutar la consulta de exportación.';
            setError(msg);
            setRows([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="operaciones-dashboard" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <div>
                    <p style={{ margin: 0, fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7dd3fc' }}>
                        Dashboard inventarios
                    </p>
                    <h2 style={{ margin: '8px 0 0', color: '#f8fafc' }}>Consulta de pedimentos de exportación</h2>
                </div>

                <button
                    type="button"
                    onClick={handleRunExportQuery}
                    disabled={loading}
                    style={{
                        background: '#0f766e',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '10px 16px',
                        fontWeight: 700,
                        cursor: loading ? 'not-allowed' : 'pointer',
                        opacity: loading ? 0.7 : 1,
                    }}
                >
                    {loading ? 'Ejecutando consulta...' : 'Consultar pedimentos exportación'}
                </button>
            </div>

            {error && (
                <div style={{ background: '#7f1d1d', color: '#fee2e2', padding: '12px 16px', borderRadius: '8px', marginBottom: '18px' }}>
                    {error}
                </div>
            )}

            {!error && total > 0 && (
                <div style={{ background: '#0f172a', color: '#e2e8f0', padding: '12px 16px', borderRadius: '8px', marginBottom: '18px' }}>
                    Registros encontrados: {total}
                </div>
            )}

            {rows.length > 0 && (
                <div style={{ overflowX: 'auto', background: '#0f172a', borderRadius: '12px', border: '1px solid rgba(148,163,184,.25)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', color: '#e2e8f0' }}>
                        <thead>
                            <tr>
                                {Object.keys(rows[0]).map((key) => (
                                    <th key={key} style={{ padding: '12px 10px', borderBottom: '1px solid rgba(148,163,184,.25)', textAlign: 'left', whiteSpace: 'nowrap' }}>
                                        {key}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.slice(0, 25).map((row, index) => (
                                <tr key={`${row.Factura || 'row'}-${index}`}>
                                    {Object.values(row).map((value, valueIndex) => (
                                        <td key={`${row.Factura || 'row'}-${valueIndex}`} style={{ padding: '10px', borderBottom: '1px solid rgba(148,163,184,.15)', verticalAlign: 'top' }}>
                                            {value === null || value === undefined ? '—' : String(value)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {!loading && rows.length === 0 && !error && (
                <div style={{ background: '#111827', color: '#cbd5e1', padding: '18px 16px', borderRadius: '8px', border: '1px solid rgba(148,163,184,.2)' }}>
                    Aún no has ejecutado la consulta. Usa el botón para consultar pedimentos de exportación.
                </div>
            )}
        </div>
    );
}
