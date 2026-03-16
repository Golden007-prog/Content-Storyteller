"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.correlationId = correlationId;
const crypto_1 = __importDefault(require("crypto"));
const CORRELATION_HEADER = 'x-correlation-id';
function correlationId(req, res, next) {
    const id = req.headers[CORRELATION_HEADER] || crypto_1.default.randomUUID();
    req.correlationId = id;
    res.setHeader('X-Correlation-ID', id);
    next();
}
//# sourceMappingURL=correlation-id.js.map