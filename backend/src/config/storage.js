const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

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
    await r2Client.send(command);
    const storageUrl = `${process.env.R2_PUBLIC_URL}/${storageKey}`;
    return { storageKey, storageUrl };
}

/**
 * Elimina un archivo del storage configurado.
 * @param {string} storageKey - Clave/ruta del archivo
 */
async function deleteFile(storageKey) {
    const command = new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: storageKey,
    });
    await r2Client.send(command);
}

module.exports = { uploadFile, deleteFile };
