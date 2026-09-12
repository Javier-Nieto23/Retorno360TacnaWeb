const { S3Client, PutObjectCommand, DeleteObjectCommand, HeadBucketCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

function resolveBucketConfig(context = 'default') {
    const isRgceContext = context === 'rgce';
    const bucketName = String(
        isRgceContext
            ? (process.env.R2_BUCKET_NAME_RGCE || 'rgce')
            : (process.env.R2_BUCKET_NAME || 'rgce')
    ).trim() || (isRgceContext ? 'rgce' : 'rgce');

    const publicUrlBase = String(
        isRgceContext
            ? (process.env.R2_PUBLIC_URL_RGCE || process.env.R2_PUBLIC_URL || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucketName}`)
            : (process.env.R2_PUBLIC_URL || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucketName}`)
    ).replace(/\/+$/, '');

    return { bucketName, publicUrlBase };
}

const defaultBucketConfig = resolveBucketConfig('default');
const rgceBucketConfig = resolveBucketConfig('rgce');
const r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

function wrapR2Error(operation, error, bucketNameOverride) {
    const statusCode = error?.$metadata?.httpStatusCode;
    const providerCode = error?.Code || error?.code || error?.name || 'R2Error';
    const isAccessDenied = providerCode === 'AccessDenied' || statusCode === 403;
    const bucketLabel = bucketNameOverride || process.env.R2_BUCKET_NAME || 'rgce';

    const wrappedError = new Error(
        isAccessDenied
            ? `Cloudflare R2 denego ${operation}. Verifica permisos del token para bucket "${bucketLabel}" (Object Read/Write) y politicas del bucket.`
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
async function uploadFile(buffer, storageKey, mimeType, options = {}) {
    const context = String(options.context || 'default').toLowerCase();
    const bucketConfig = context === 'rgce' ? rgceBucketConfig : defaultBucketConfig;
    const bucketName = options.bucketName || bucketConfig.bucketName;
    const publicUrlBase = options.publicUrlBase || bucketConfig.publicUrlBase;

    const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: storageKey,
        Body: buffer,
        ContentType: mimeType,
    });
    try {
        await r2Client.send(command);
    } catch (error) {
        throw wrapR2Error('la subida de objetos', error, bucketName);
    }
    const normalizedStorageKey = String(storageKey || '').replace(/^\/+/, '');
    const storageUrl = `${publicUrlBase}/${normalizedStorageKey}`;
    return { storageKey, storageUrl, bucketName };
}

/**
 * Obtiene URL de descarga segura para un objeto.
 * En R2 devuelve URL firmada; en local devuelve la URL almacenada.
 */
async function getDownloadUrl({ storageKey, storageUrl, filename, bucketName: bucketNameOverride }) {
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

    const targetBucket = bucketNameOverride || defaultBucketConfig.bucketName;
    const command = new GetObjectCommand({
        Bucket: targetBucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${String(filename || 'archivo').replace(/"/g, '')}"`,
    });

    try {
        return await getSignedUrl(r2Client, command, { expiresIn: 60 * 10 });
    } catch (error) {
        throw wrapR2Error('la generación de URL de descarga', error, targetBucket);
    }
}

/**
 * Elimina un archivo del storage configurado.
 * Solo borra el objeto exacto indicado; no elimina carpetas ni prefijos.
 * @param {string} storageKey - Clave/ruta del archivo
 */
async function deleteFile(storageKey, options = {}) {
    if (!storageKey || String(storageKey).endsWith('/')) {
        const error = new Error('La eliminacion solo acepta una clave de archivo valida.');
        error.code = 'INVALID_STORAGE_KEY';
        throw error;
    }

    const context = String(options.context || 'default').toLowerCase();
    const bucketConfig = context === 'rgce' ? rgceBucketConfig : defaultBucketConfig;
    const targetBucket = options.bucketName || bucketConfig.bucketName;

    const command = new DeleteObjectCommand({
        Bucket: targetBucket,
        Key: storageKey,
    });
    try {
        await r2Client.send(command);
    } catch (error) {
        throw wrapR2Error('la eliminacion de objetos', error, targetBucket);
    }
}

/**
 * Verifica la conexión con Cloudflare R2
 * @returns {Promise<boolean>}
 */
async function checkCloudflareConnection(context = 'default') {
    const bucketConfig = context === 'rgce' ? rgceBucketConfig : defaultBucketConfig;
    try {
        const command = new HeadBucketCommand({
            Bucket: bucketConfig.bucketName,
        });
        await r2Client.send(command);

        return true;
    } catch (error) {
        console.error(`Error al conectar con Cloudflare R2 (${bucketConfig.bucketName}): ${error.message}`);
        return false;
    }
}

//fagregar streamToBuffer como helper interno 
function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', (err) => reject(err));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
}

/**
 * Descarga unb archivo desde R2 y lo devuelve como buffer,para procesarlo en memoria.
 * @param {string} storageKey - Clave/ruta del archivo
 * @returns {Promise<Buffer>}   
 */
async function getFileBuffer(storageKey, options = {}) {
    const key = String(storageKey || '').trim();
    if (!key || key.endsWith('/')) {
        const error = new Error('storage_key invalido para lectura. ');
        error.code = 'INVALID_STORAGE_KEY';
        throw error;
    }
    const context = String(options.context || 'default').toLowerCase();
    const bucketConfig = context === 'rgce' ? rgceBucketConfig : defaultBucketConfig;
    const targetBucket = options.bucketName || bucketConfig.bucketName;

    const command = new GetObjectCommand({
        Bucket: targetBucket,
        Key: key,
    });
    try {
        const response = await r2Client.send(command);
        return await streamToBuffer(response.Body);
    } catch (error) {
        throw wrapR2Error(`la lectura de objetos "${key}"`, error, targetBucket);
    }
}
module.exports = { uploadFile, deleteFile, checkCloudflareConnection, getDownloadUrl, getFileBuffer, r2Client, resolveBucketConfig };
