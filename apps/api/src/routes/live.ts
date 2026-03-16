import { Router, Request, Response, NextFunction } from 'express';
import {
  createLiveSession,
  getLiveSession,
  processLiveInput,
  endLiveSession,
} from '../services/live-session';
import { logger } from '../middleware/logger';
import { ModelUnavailableError } from '@content-storyteller/shared';
import type {
  StartLiveSessionResponse,
  LiveInputResponse,
  StopLiveSessionResponse,
} from '@content-storyteller/shared';

const router = Router();

/**
 * POST /api/v1/live/start
 * Create a new live agent session.
 */
router.post('/start', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = await createLiveSession();
    logger.info(`Live session started: ${session.sessionId}`, {
      correlationId: req.correlationId,
    });

    const response: StartLiveSessionResponse = {
      sessionId: session.sessionId,
      status: session.status,
    };
    res.status(201).json(response);
  } catch (err) {
    if (err instanceof ModelUnavailableError) {
      res.status(503).json({
        error: {
          code: 'LIVE_MODE_UNAVAILABLE',
          message: 'Live conversation mode is not available. The required model could not be reached.',
        },
      });
      return;
    }
    next(err);
  }
});

/**
 * POST /api/v1/live/input
 * Send user input (text, audio transcript) to the live session.
 */
router.post('/input', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId, text } = req.body as { sessionId?: string; text?: string };

    if (!sessionId) {
      res.status(400).json({
        error: { code: 'MISSING_SESSION_ID', message: 'sessionId is required', correlationId: req.correlationId },
      });
      return;
    }

    if (!text || text.trim().length === 0) {
      res.status(400).json({
        error: { code: 'MISSING_INPUT', message: 'text input is required', correlationId: req.correlationId },
      });
      return;
    }

    const session = await getLiveSession(sessionId);
    if (!session) {
      res.status(404).json({
        error: { code: 'SESSION_NOT_FOUND', message: `Session ${sessionId} not found`, correlationId: req.correlationId },
      });
      return;
    }

    if (session.status !== 'active') {
      res.status(409).json({
        error: { code: 'SESSION_ENDED', message: 'Session has already ended', correlationId: req.correlationId },
      });
      return;
    }

    const result = await processLiveInput(sessionId, text.trim());

    const response: LiveInputResponse = {
      sessionId,
      agentText: result.agentText,
      audioBase64: result.audioBase64,
      transcript: result.transcript,
    };
    res.json(response);
  } catch (err) {
    if (err instanceof ModelUnavailableError) {
      res.status(503).json({
        error: {
          code: 'LIVE_MODE_UNAVAILABLE',
          message: 'Live conversation mode is not available. The required model could not be reached.',
        },
      });
      return;
    }
    next(err);
  }
});

/**
 * POST /api/v1/live/stop
 * End a live session, persist transcript, extract creative direction.
 */
router.post('/stop', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId } = req.body as { sessionId?: string };

    if (!sessionId) {
      res.status(400).json({
        error: { code: 'MISSING_SESSION_ID', message: 'sessionId is required', correlationId: req.correlationId },
      });
      return;
    }

    const session = await getLiveSession(sessionId);
    if (!session) {
      res.status(404).json({
        error: { code: 'SESSION_NOT_FOUND', message: `Session ${sessionId} not found`, correlationId: req.correlationId },
      });
      return;
    }

    const result = await endLiveSession(sessionId);
    logger.info(`Live session ended: ${sessionId}`, { correlationId: req.correlationId });

    const response: StopLiveSessionResponse = {
      sessionId,
      transcript: result.transcript,
      extractedCreativeDirection: result.extractedCreativeDirection,
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/live/:sessionId
 * Get current session state.
 */
router.get('/:sessionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId } = req.params;
    const session = await getLiveSession(sessionId);

    if (!session) {
      res.status(404).json({
        error: { code: 'SESSION_NOT_FOUND', message: `Session ${sessionId} not found`, correlationId: req.correlationId },
      });
      return;
    }

    res.json(session);
  } catch (err) {
    next(err);
  }
});

export { router as liveRouter };
