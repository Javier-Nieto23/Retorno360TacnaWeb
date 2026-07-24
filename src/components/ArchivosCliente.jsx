import FileUpload from './FileUpload';
import './ClientSections.css';

export default function ArchivosCliente() {
    return (
        <div className="client-section-page">
            <div className="client-section-card">
                <div className="client-section-head">
                    <div>
                        <h1>Subir inventario</h1>
                        <p>Carga el archivo Excel del período seleccionado para tu empresa.</p>
                    </div>
                </div>
                <FileUpload />
            </div>
        </div>
    );
}
