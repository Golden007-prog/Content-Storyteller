"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.corsMiddleware = void 0;
const cors_1 = __importDefault(require("cors"));
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
/**
 * Parse CORS_ORIGIN into a cors-compatible origin value.
 * Supports:
 *   "*"                          → allow all
 *   "https://example.com"       → single origin string
 *   "https://a.com,https://b.com" → array of allowed origins
 */
function parseOrigin() {
    if (CORS_ORIGIN === '*')
        return '*';
    const origins = CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
    if (origins.length === 1)
        return origins[0];
    return origins;
}
exports.corsMiddleware = (0, cors_1.default)({
    origin: parseOrigin(),
    credentials: true,
});
//# sourceMappingURL=cors.js.map