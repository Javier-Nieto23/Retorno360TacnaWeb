# Retorno360 Tacna - Plataforma de Archivos Excel

## Stack
- **Frontend**: React 19 + Vite + React Router DOM
- **Backend**: Node.js + Express
- **Base de datos**: PostgreSQL
- **Almacenamiento**: Local (desarrollo) / Cloudflare R2 (produccion)

## Estructura del proyecto

`
/                    <- Frontend React (Vite)
/backend/            <- API Express
/backend/src/
  config/            <- Configuracion DB y Storage
  controllers/       <- Logica de negocio
  middleware/        <- Auth local y validacion de archivos
  models/            <- Schema SQL
  routes/            <- Rutas de la API
`

## Base de datos (PostgreSQL)

### Tablas
- **razon_social** � id, nombre, r2_folder (carpeta en R2)
- **usuarios** � id, nombre_usuario, alias, password_hash, razon_social_id
- **archivos_historial** � id, razon_social_id, usuario_id, nombre_archivo, storage_key, anio, mes, tamano, uploaded_at

## Configuracion local (pruebas)

### 1. Configurar base de datos
`
psql -U postgres
CREATE DATABASE retorno360db;
`

### 2. Configurar backend
`
cd backend
copy .env.example .env
# Editar .env con tu password de PostgreSQL
npm run db:init
npm run dev
`

### 3. Crear primer usuario (admin)
`
curl -X POST http://localhost:3001/api/auth/register ^
  -H "Content-Type: application/json" ^
  -d "{\"nombre_usuario\":\"admin\",\"alias\":\"Administrador\",\"password\":\"Admin123!\",\"razon_social_id\":1}"
`

### 4. Iniciar frontend
`
cd ..
npm run dev
`

### 5. Acceder
Abrir: http://localhost:5173

## Configuracion para Cloudflare R2 (produccion)

En ackend/.env cambiar:
`
STORAGE_MODE=r2
R2_ACCOUNT_ID=tu_account_id
R2_ACCESS_KEY_ID=tu_key
R2_SECRET_ACCESS_KEY=tu_secret
R2_BUCKET_NAME=retorno360-files
R2_PUBLIC_URL=https://tu-bucket.r2.dev
`

## API Endpoints

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| POST | /api/auth/login | Iniciar sesion |
| POST | /api/auth/register | Crear usuario |
| GET | /api/auth/me | Datos del usuario actual |
| POST | /api/files/upload | Subir archivo .xlsx |
| GET | /api/files/historial | Listar archivos (con filtros anio/mes) |
| GET | /api/files/historial/resumen | Resumen por anio/mes |
| DELETE | /api/files/:id | Eliminar archivo |
| GET | /api/razonsocial | Listar razones sociales |
| POST | /api/razonsocial | Crear razon social |
