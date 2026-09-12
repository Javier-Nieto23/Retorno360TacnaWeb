const multer = require('multer');

const storage = multer.memoryStorage();

const uploadRgce = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter(req, file, cb) {
        const allowedMimeTypes = [
            'application/pdf',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-word',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/jpeg',
            'image/png',
            'image/webp',
        ];

        const allowedExtension = /\.(pdf|xlsx|xls|doc|docx|png|jpg|jpeg|webp)$/i;

        if (allowedMimeTypes.includes(file.mimetype) || allowedExtension.test(file.originalname)) {
            cb(null, true);
            return;
        }

        cb(new Error('Solo se permiten PDF, Excel, Word o imágenes para documentos RGCE.'));
    },
});

module.exports = uploadRgce;
