"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.trendsRouter = void 0;
const express_1 = require("express");
const shared_1 = require("@content-storyteller/shared");
const firestore_1 = require("../services/firestore");
const analyzer_1 = require("../services/trends/analyzer");
const router = (0, express_1.Router)();
exports.trendsRouter = router;
const VALID_PLATFORMS = Object.values(shared_1.TrendPlatform);
const VALID_SCOPES = ['global', 'country', 'state_province'];
const VALID_TIME_WINDOWS = ['24h', '7d', '30d'];
/**
 * POST /analyze
 * Validates a TrendQuery body, runs trend analysis, persists result, returns TrendAnalysisResult.
 */
router.post('/analyze', async (req, res, next) => {
    try {
        const { platform, domain, region, timeWindow, language } = req.body;
        // 1. Validate platform
        if (!platform || !VALID_PLATFORMS.includes(platform)) {
            res.status(400).json({
                error: {
                    code: 'INVALID_TREND_PLATFORM',
                    message: `platform must be one of: ${VALID_PLATFORMS.join(', ')}`,
                },
            });
            return;
        }
        // 2. Validate domain
        if (!domain || (typeof domain === 'string' && domain.trim().length === 0)) {
            res.status(400).json({
                error: {
                    code: 'MISSING_DOMAIN',
                    message: 'domain is required and must be a non-empty string',
                },
            });
            return;
        }
        // 3. Validate region
        if (!region || !region.scope || !VALID_SCOPES.includes(region.scope)) {
            res.status(400).json({
                error: {
                    code: 'INVALID_REGION',
                    message: `region.scope must be one of: ${VALID_SCOPES.join(', ')}`,
                },
            });
            return;
        }
        if (region.scope === 'country') {
            if (!region.country || (typeof region.country === 'string' && region.country.trim().length === 0)) {
                res.status(400).json({
                    error: {
                        code: 'INVALID_REGION',
                        message: 'region.country is required when scope is "country"',
                    },
                });
                return;
            }
        }
        if (region.scope === 'state_province') {
            if (!region.country || (typeof region.country === 'string' && region.country.trim().length === 0)) {
                res.status(400).json({
                    error: {
                        code: 'INVALID_REGION',
                        message: 'region.country is required when scope is "state_province"',
                    },
                });
                return;
            }
            if (!region.stateProvince || (typeof region.stateProvince === 'string' && region.stateProvince.trim().length === 0)) {
                res.status(400).json({
                    error: {
                        code: 'INVALID_REGION',
                        message: 'region.stateProvince is required when scope is "state_province"',
                    },
                });
                return;
            }
        }
        // 4. Validate optional timeWindow
        if (timeWindow !== undefined && !VALID_TIME_WINDOWS.includes(timeWindow)) {
            res.status(400).json({
                error: {
                    code: 'INVALID_TIME_WINDOW',
                    message: `timeWindow must be one of: ${VALID_TIME_WINDOWS.join(', ')}`,
                },
            });
            return;
        }
        // Build validated query
        const query = {
            platform: platform,
            domain,
            region,
            ...(timeWindow !== undefined && { timeWindow }),
            ...(language !== undefined && { language }),
        };
        // Run analysis
        let result;
        try {
            result = await (0, analyzer_1.analyzeTrends)(query);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes('GenAI')) {
                res.status(503).json({
                    error: {
                        code: 'ANALYSIS_UNAVAILABLE',
                        message: 'Trend analysis is temporarily unavailable. Please try again later.',
                    },
                });
                return;
            }
            throw err;
        }
        // Persist to Firestore
        const queryId = await (0, firestore_1.createTrendQuery)(result);
        result.queryId = queryId;
        res.status(200).json(result);
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /:queryId
 * Retrieves a previously stored TrendAnalysisResult by queryId.
 * Stub — will be fleshed out in Task 3.2.
 */
router.get('/:queryId', async (req, res, next) => {
    try {
        const { queryId } = req.params;
        const result = await (0, firestore_1.getTrendQuery)(queryId);
        if (!result) {
            res.status(404).json({
                error: {
                    code: 'TREND_QUERY_NOT_FOUND',
                    message: `Trend query ${queryId} not found`,
                },
            });
            return;
        }
        res.status(200).json(result);
    }
    catch (err) {
        next(err);
    }
});
//# sourceMappingURL=trends.js.map