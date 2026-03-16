"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadRouter = void 0;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const storage_1 = require("../services/storage");
const logger_1 = require("../middleware/logger");
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const ALLOWED_MIME_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'audio/mpeg',
    'audio/wav',
    'audio/webm',
    'video/mp4',
    'video/webm',
    'application/pdf',
]);
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
});
const router = (0, express_1.Router)();
exports.uploadRouter = router;
/**
 * POST /api/v1/upload
 * Accept multipart/form-data, validate MIME types and sizes,
 * store in uploads bucket under uploads/{correlationId}/{originalFilename},
 * and return upload metadata.
 */
router.post('/', upload.array('files', 10), async (req, res, next) => {
    try {
        const files = req.files;
        if (!files || files.length === 0) {
            const body = {
                error: {
                    code: 'NO_FILES',
                    message: 'No files provided in the request',
                    correlationId: req.correlationId,
                },
            };
            res.status(400).json(body);
            return;
        }
        // Task 11.1: MIME allowlist validation
        for (const file of files) {
            if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
                const body = {
                    error: {
                        code: 'UNSUPPORTED_FILE_TYPE',
                        message: `File "${file.originalname}" has unsupported MIME type "${file.mimetype}". Allowed types: ${[...ALLOWED_MIME_TYPES].join(', ')}`,
                        correlationId: req.correlationId,
                    },
                };
                res.status(400).json(body);
                return;
            }
        }
        // Task 11.2: Per-file size enforcement
        for (const file of files) {
            if (file.size > MAX_FILE_SIZE) {
                const body = {
                    error: {
                        code: 'FILE_TOO_LARGE',
                        message: `File "${file.originalname}" exceeds the maximum size of 50 MB`,
                        correlationId: req.correlationId,
                    },
                };
                res.status(413).json(body);
                return;
            }
        }
        // Task 11.3: Deterministic GCS path and metadata storage
        const storageBucket = (0, storage_1.getUploadsBucketName)();
        const results = [];
        for (const file of files) {
            const destination = `uploads/${req.correlationId}/${file.originalname}`;
            const uploadPath = await (0, storage_1.uploadFile)(destination, file.buffer, file.mimetype, {
                contentType: file.mimetype,
                originalFilename: file.originalname,
            });
            results.push({
                uploadPath,
                fileName: file.originalname,
                contentType: file.mimetype,
                size: file.size,
                storageBucket,
            });
        }
        logger_1.logger.info(`Uploaded ${results.length} file(s)`, {
            correlationId: req.correlationId,
        });
        res.status(201).json({ uploads: results });
    }
    catch (err) {
        // Distinguish GCS connectivity errors from other failures
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg.includes('ECONNREFUSED') ||
            errMsg.includes('Could not load the default credentials') ||
            errMsg.includes('ENOTFOUND') ||
            errMsg.includes('getaddrinfo')) {
            logger_1.logger.error('Storage service unavailable during upload', {
                correlationId: req.correlationId,
                error: errMsg,
            });
            res.status(503).json({
                error: {
                    code: 'STORAGE_UNAVAILABLE',
                    message: 'Cloud Storage is not reachable. Check your GCP credentials and network.',
                    correlationId: req.correlationId,
                },
            });
            return;
        }
        next(err);
    }
});
//# sourceMappingURL=upload.js.map