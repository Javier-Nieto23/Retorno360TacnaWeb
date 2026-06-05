const multer = require('multer');

// Almacenamiento en memoria para procesarlo antes de subir a R2 o disco
const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB máximo
    fileFilter(req, file, cb) {
        const allowed = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
            'application/vnd.ms-excel', // .xls
        ];
        if (allowed.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls)$/i)) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls).'));
        }
    },
});

module.exports = upload;
