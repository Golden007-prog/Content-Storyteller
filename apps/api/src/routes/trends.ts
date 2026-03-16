import { Router, Request, Response, NextFunction } from 'express';
import {
  TrendPlatform,
  TrendQuery,
} from '@content-storyteller/shared';
import { createTrendQuery, getTrendQuery } from '../services/firestore';
import { analyzeTrends } from '../services/trends/analyzer';

const router = Router();

const VALID_PLATFORMS = Object.values(TrendPlatform) as string[];
const VALID_SCOPES = ['global', 'country', 'state_province'] as const;
const VALID_TIME_WINDOWS = ['24h', '7d', '30d'] as const;

/**
 * POST /analyze
 * Validates a TrendQuery body, runs trend analysis, persists result, returns TrendAnalysisResult.
 */
router.post('/analyze', async (req: Request, res: Response, next: NextFunction) => {
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
    if (timeWindow !== undefined && !(VALID_TIME_WINDOWS as readonly string[]).includes(timeWindow)) {
      res.status(400).json({
        error: {
          code: 'INVALID_TIME_WINDOW',
          message: `timeWindow must be one of: ${VALID_TIME_WINDOWS.join(', ')}`,
        },
      });
      return;
    }

    // Build validated query
    const query: TrendQuery = {
      platform: platform as TrendPlatform,
      domain,
      region,
      ...(timeWindow !== undefined && { timeWindow }),
      ...(language !== undefined && { language }),
    };

    // Run analysis
    let result;
    try {
      result = await analyzeTrends(query);
    } catch (err) {
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
    const queryId = await createTrendQuery(result);
    result.queryId = queryId;

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /:queryId
 * Retrieves a previously stored TrendAnalysisResult by queryId.
 * Stub — will be fleshed out in Task 3.2.
 */
router.get('/:queryId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { queryId } = req.params;
    const result = await getTrendQuery(queryId);

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
  } catch (err) {
    next(err);
  }
});

export { router as trendsRouter };
