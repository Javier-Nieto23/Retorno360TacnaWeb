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
        empresa_id INTEGER REFERENCES empresa (id) ON DELETE SET NULL,
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

CREATE INDEX IF NOT EXISTS idx_historial_empresa ON archivos_historial (empresa_id);

-- Tabla de numeros de parte
CREATE TABLE IF NOT EXISTS numeros_parte (
    id SERIAL PRIMARY KEY,
    numero_parte VARCHAR(120) NOT NULL,
    descripcion VARCHAR(500),
    descripcion_esp VARCHAR(500),
    descripcion_ing VARCHAR(500),
    unidad_medida VARCHAR(100),
    unit_horas NUMERIC(10,2),
    peso_cantidad NUMERIC(10,3),
    piezas INTEGER,
    pais_origen VARCHAR(120),
    similar VARCHAR(250),
    imagen_nombre VARCHAR(255),
    imagen_storage_key VARCHAR(1000),
    imagen_storage_url TEXT,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    razon_social_id INTEGER REFERENCES razon_social(id) ON DELETE SET NULL,
    empresa_id INTEGER REFERENCES empresa(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_numeros_parte_created_at ON numeros_parte (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_numeros_parte_empresa ON numeros_parte (empresa_id);
CREATE INDEX IF NOT EXISTS idx_numeros_parte_razon_social ON numeros_parte (razon_social_id);

-- Tabla de solicitudes de eliminacion de archivos (requiere aprobacion admin)
CREATE TABLE IF NOT EXISTS archivo_delete_requests (
    id SERIAL PRIMARY KEY,
    archivo_id INTEGER NOT NULL REFERENCES archivos_historial(id) ON DELETE CASCADE,
    solicitado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    motivo TEXT,
    solicitado_at TIMESTAMP DEFAULT NOW(),
    resuelto_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    resuelto_at TIMESTAMP,
    comentario_admin TEXT,
    CONSTRAINT archivo_delete_requests_estado_chk CHECK (estado IN ('pendiente', 'aprobado', 'rechazado'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_archivo_delete_requests_pending_unique
ON archivo_delete_requests (archivo_id)
WHERE estado = 'pendiente';

-- Tabla de observaciones reportadas por admin sobre archivos
CREATE TABLE IF NOT EXISTS observaciones (
    id SERIAL PRIMARY KEY,
    descripcion VARCHAR(500) NOT NULL,
    iduser INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    cliente_participante_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    idarchivo INTEGER NOT NULL REFERENCES archivos_historial(id) ON DELETE CASCADE,
    estado VARCHAR(20) NOT NULL DEFAULT 'abierto',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'observaciones_estado_chk'
    ) THEN
        ALTER TABLE observaciones
        ADD CONSTRAINT observaciones_estado_chk
        CHECK (estado IN ('abierto', 'en_revision', 'cerrado'));
    END IF;
END
$$;

-- Compatibilidad con tablas observaciones creadas sin autoincremento en id
CREATE SEQUENCE IF NOT EXISTS observaciones_id_seq;
ALTER TABLE observaciones ALTER COLUMN id SET DEFAULT nextval('observaciones_id_seq');
ALTER SEQUENCE observaciones_id_seq OWNED BY observaciones.id;
SELECT setval('observaciones_id_seq', COALESCE((SELECT MAX(id) FROM observaciones), 0) + 1, false);

CREATE INDEX IF NOT EXISTS idx_observaciones_archivo ON observaciones (idarchivo);
CREATE INDEX IF NOT EXISTS idx_observaciones_created_at ON observaciones (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_observaciones_estado ON observaciones (estado);

-- Tabla de mensajes vinculados a cada observación
CREATE TABLE IF NOT EXISTS observacion_mensajes (
    id SERIAL PRIMARY KEY,
    observacion_id INTEGER NOT NULL REFERENCES observaciones(id) ON DELETE CASCADE,
    iduser INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    mensaje VARCHAR(1000) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_observacion_mensajes_observacion
ON observacion_mensajes (observacion_id, created_at ASC);

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