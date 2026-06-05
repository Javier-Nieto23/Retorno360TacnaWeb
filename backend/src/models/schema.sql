-- ==========================================
-- SCHEMA DE BASE DE DATOS: Retorno360 Tacna
-- ==========================================
-- Tabla de Razón Social
CREATE TABLE
    IF NOT EXISTS razon_social (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        r2_folder VARCHAR(500) NOT NULL, -- Carpeta base en R2 (ej: "empresa-abc/")
        created_at TIMESTAMP DEFAULT NOW ()
    );

-- Tabla de Usuarios
CREATE TABLE
    IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nombre_usuario VARCHAR(100) UNIQUE NOT NULL,
        alias VARCHAR(100) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        razon_social_id INTEGER REFERENCES razon_social (id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW ()
    );

-- Tabla Historial de Archivos subidos
CREATE TABLE
    IF NOT EXISTS archivos_historial (
        id SERIAL PRIMARY KEY,
        razon_social_id INTEGER REFERENCES razon_social (id) ON DELETE CASCADE,
        usuario_id INTEGER REFERENCES usuarios (id) ON DELETE SET NULL,
        nombre_archivo VARCHAR(500) NOT NULL, -- Nombre original del archivo
        nombre_almacenado VARCHAR(500) NOT NULL, -- Nombre con timestamp en storage
        storage_key VARCHAR(1000) NOT NULL, -- Clave en R2 o ruta local
        storage_url TEXT, -- URL pública (si aplica)
        anio INTEGER NOT NULL,
        mes INTEGER NOT NULL,
        tamano BIGINT, -- Tamaño en bytes
        uploaded_at TIMESTAMP DEFAULT NOW ()
    );

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_historial_razon_social ON archivos_historial (razon_social_id);

CREATE INDEX IF NOT EXISTS idx_historial_anio_mes ON archivos_historial (anio, mes);

CREATE INDEX IF NOT EXISTS idx_historial_usuario ON archivos_historial (usuario_id);

-- DATOS INICIALES DE EJEMPLO
-- ==========================================
-- Razón Social de ejemplo
-- Tabla de Empresa
CREATE TABLE IF NOT EXISTS empresa (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    razon_social_id INTEGER REFERENCES razon_social(id) ON DELETE CASCADE,
    carpeta VARCHAR(255) NOT NULL, -- Nombre de carpeta para la empresa dentro de la razon social
    created_at TIMESTAMP DEFAULT NOW()
);

-- Relación: una razón social puede tener muchas empresas

INSERT INTO
    razon_social (nombre, r2_folder)
VALUES
    ('Empresa Demo S.A.C.', 'empresa-demo/') ON CONFLICT DO NOTHING;

INSERT INTO
    usuarios (nombre_usuario, alias, password_hash, razon_social_id)
VALUES      
    ('Administrator', 'Administrator', 'Admin123', 1) ON CONFLICT DO NOTHING;
    


-- Usuario administrador (password: Admin123!)
-- Nota: el hash se genera con bcrypt desde la app, este es solo un recordatorio
-- Para insertar el primer admin, usa el endpoint POST /api/auth/register