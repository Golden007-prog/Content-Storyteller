import cors from 'cors';

const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

/**
 * Parse CORS_ORIGIN into a cors-compatible origin value.
 * Supports:
 *   "*"                          → allow all
 *   "https://example.com"       → single origin string
 *   "https://a.com,https://b.com" → array of allowed origins
 */
function parseOrigin(): cors.CorsOptions['origin'] {
  if (CORS_ORIGIN === '*') return '*';
  const origins = CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
  if (origins.length === 1) return origins[0];
  return origins;
}

export const corsMiddleware = cors({
  origin: parseOrigin(),
  credentials: true,
});
