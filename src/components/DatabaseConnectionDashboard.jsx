import { useEffect, useState } from 'react';
import api from '../services/api';
import './DatabaseConnectionDashboard.css';

const connectionDetails = {
    server: 'bms.cjkk8qusia7f.us-east-2.rds.amazonaws.com,1435',
    user: 'jnieto',
    database: 'BMS_KASA',
};

export default function DatabaseConnectionDashboard() {
    const [status, setStatus] = useState({
        connected: false,
        message: 'Verificando conexión...',
        status: 'checking',
    });
    const [details, setDetails] = useState(connectionDetails);

    useEffect(() => {
        let isMounted = true;

        const requestConnectionStatus = async () => {
            try {
                const response = await api.get('/conexion-bms/test');
                if (!isMounted) return;
                setStatus({
                    connected: response.data.connected,
                    message: response.data.message || 'conexion a base de datos completa',
                    status: response.data.connected ? 'ok' : 'error',
                });
                setDetails({
                    server: response.data.server || connectionDetails.server,
                    user: response.data.user || connectionDetails.user,
                    database: response.data.database || connectionDetails.database,
                });
            } catch (error) {
                if (!isMounted) return;

                if (error.response?.status === 404) {
                    try {
                        const fallbackResponse = await api.get('/sqlserver/test');
                        if (!isMounted) return;
                        setStatus({
                            connected: fallbackResponse.data.connected,
                            message: fallbackResponse.data.message || 'conexion a base de datos completa',
                            status: fallbackResponse.data.connected ? 'ok' : 'error',
                        });
                        setDetails({
                            server: fallbackResponse.data.server || connectionDetails.server,
                            user: fallbackResponse.data.user || connectionDetails.user,
                            database: fallbackResponse.data.database || connectionDetails.database,
                        });
                        return;
                    } catch (fallbackError) {
                        // Continuar con el manejo del error original.
                    }
                }

                const errorMessage = error.response?.data?.message || 'No se pudo establecer la conexión.';
                setStatus({
                    connected: false,
                    message: errorMessage,
                    status: 'error',
                });
            }
        };

        requestConnectionStatus();

        return () => {
            isMounted = false;
        };
    }, []);

    const isSuccess = status.connected && status.status === 'ok';

    return (
        <div className="database-connection-screen">
            <div className="database-connection-card">
                <h1 className="database-connection-title">conexion a base de datos completa</h1>

                <div className="database-connection-status">
                    <span className={`database-connection-status-badge ${isSuccess ? 'success' : status.status === 'error' ? 'error' : ''}`} />
                    <span>{isSuccess ? 'Conexión establecida correctamente' : status.status === 'error' ? 'Conexión fallida' : 'Validando conexión...'}</span>
                </div>

                <div className="database-connection-grid">
                    <div className="database-connection-item">
                        <span className="label">Servidor AWS</span>
                        <span className="value">{details.server}</span>
                    </div>
                    <div className="database-connection-item">
                        <span className="label">Usuario</span>
                        <span className="value">{details.user}</span>
                    </div>
                    <div className="database-connection-item">
                        <span className="label">Base de datos</span>
                        <span className="value">{details.database}</span>
                    </div>
                </div>

                <div className={`database-connection-message ${status.status === 'error' ? 'error' : ''}`}>
                    {status.message}
                </div>
            </div>
        </div>
    );
}
