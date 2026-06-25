const { S3Client, PutObjectCommand, DeleteObjectCommand, HeadBucketCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

function wrapR2Error(operation, error) {
    const statusCode = error?.$metadata?.httpStatusCode;
    const providerCode = error?.Code || error?.code || error?.name || 'R2Error';
    const isAccessDenied = providerCode === 'AccessDenied' || statusCode === 403;

    const wrappedError = new Error(
        isAccessDenied
            ? `Cloudflare R2 denego ${operation}. Verifica permisos del token para bucket \"${process.env.R2_BUCKET_NAME}\" (Object Read/Write) y politicas del bucket.`
            : `Fallo ${operation} en Cloudflare R2: ${providerCode}`
    );

    wrappedError.code = isAccessDenied ? 'R2_ACCESS_DENIED' : 'R2_ERROR';
    wrappedError.providerCode = providerCode;
    wrappedError.statusCode = statusCode;
    wrappedError.cause = error;
    return wrappedError;
}

/**
 * Guarda un archivo en el storage configurado.
 * @param {Buffer} buffer - Contenido del archivo
 * @param {string} storageKey - Clave/ruta en el storage (ej: "empresa-demo/2024/03/archivo.xlsx")
 * @param {string} mimeType - MIME type del archivo
 * @returns {Promise<{storageKey, storageUrl}>}
 */
async function uploadFile(buffer, storageKey, mimeType) {
    const command = new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: storageKey,
        Body: buffer,
        ContentType: mimeType,
    });
    try {
        await r2Client.send(command);
    } catch (error) {
        throw wrapR2Error('la subida de objetos', error);
    }
    const normalizedPublicUrl = String(process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '');
    const normalizedStorageKey = String(storageKey || '').replace(/^\/+/, '');
    const storageUrl = `${normalizedPublicUrl}/${normalizedStorageKey}`;
    return { storageKey, storageUrl };
}

/**
 * Obtiene URL de descarga segura para un objeto.
 * En R2 devuelve URL firmada; en local devuelve la URL almacenada.
 */
async function getDownloadUrl({ storageKey, storageUrl, filename }) {
    const isR2Mode = String(process.env.STORAGE_MODE || '').toLowerCase() === 'r2';

    if (!isR2Mode) {
        return storageUrl;
    }

    const key = String(storageKey || '').trim();
    if (!key) {
        const error = new Error('storage_key inválido para descarga.');
        error.code = 'INVALID_STORAGE_KEY';
        throw error;
    }

    const command = new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${String(filename || 'archivo').replace(/"/g, '')}"`,
    });

    try {
        return await getSignedUrl(r2Client, command, { expiresIn: 60 * 10 });
    } catch (error) {
        throw wrapR2Error('la generación de URL de descarga', error);
    }
}

/**
 * Elimina un archivo del storage configurado.
 * Solo borra el objeto exacto indicado; no elimina carpetas ni prefijos.
 * @param {string} storageKey - Clave/ruta del archivo
 */
async function deleteFile(storageKey) {
    if (!storageKey || String(storageKey).endsWith('/')) {
        const error = new Error('La eliminacion solo acepta una clave de archivo valida.');
        error.code = 'INVALID_STORAGE_KEY';
        throw error;
    }

    const command = new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: storageKey,
    });
    try {
        await r2Client.send(command);
    } catch (error) {
        throw wrapR2Error('la eliminacion de objetos', error);
    }
}

/**
 * Verifica la conexión con Cloudflare R2
 * @returns {Promise<boolean>}
 */
async function checkCloudflareConnection() {
    try {
        const command = new HeadBucketCommand({
            Bucket: process.env.R2_BUCKET_NAME,
        });
        await r2Client.send(command);
        return true;
    } catch (error) {
        console.error(`Error al conectar con Cloudflare R2: ${error.message}`);
        return false;
    }
}

module.exports = { uploadFile, deleteFile, checkCloudflareConnection, getDownloadUrl, r2Client };
