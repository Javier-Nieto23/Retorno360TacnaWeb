const multer = require('multer');

const storage = multer.memoryStorage();

const uploadImage = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter(req, file, cb) {
        const allowed = [
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/gif',
        ];



        if (allowed.includes(file.mimetype)) {
            cb(null, true);
            return;
        }

        cb(new Error('Solo se permiten imágenes JPG, PNG, WEBP o GIF.'));
    },
});

module.exports = uploadImage;