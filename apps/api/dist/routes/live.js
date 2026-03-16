"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.liveRouter = void 0;
const express_1 = require("express");
const live_session_1 = require("../services/live-session");
const logger_1 = require("../middleware/logger");
const shared_1 = require("@content-storyteller/shared");
const router = (0, express_1.Router)();
exports.liveRouter = router;
/**
 * POST /api/v1/live/start
 * Create a new live agent session.
 */
router.post('/start', async (req, res, next) => {
    try {
        const session = await (0, live_session_1.createLiveSession)();
        logger_1.logger.info(`Live session started: ${session.sessionId}`, {
            correlationId: req.correlationId,
        });
        const response = {
            sessionId: session.sessionId,
            status: session.status,
        };
        res.status(201).json(response);
    }
    catch (err) {
        if (err instanceof shared_1.ModelUnavailableError) {
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
router.post('/input', async (req, res, next) => {
    try {
        const { sessionId, text } = req.body;
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
        const session = await (0, live_session_1.getLiveSession)(sessionId);
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
        const result = await (0, live_session_1.processLiveInput)(sessionId, text.trim());
        const response = {
            sessionId,
            agentText: result.agentText,
            transcript: result.transcript,
        };
        res.json(response);
    }
    catch (err) {
        if (err instanceof shared_1.ModelUnavailableError) {
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
router.post('/stop', async (req, res, next) => {
    try {
        const { sessionId } = req.body;
        if (!sessionId) {
            res.status(400).json({
                error: { code: 'MISSING_SESSION_ID', message: 'sessionId is required', correlationId: req.correlationId },
            });
            return;
        }
        const session = await (0, live_session_1.getLiveSession)(sessionId);
        if (!session) {
            res.status(404).json({
                error: { code: 'SESSION_NOT_FOUND', message: `Session ${sessionId} not found`, correlationId: req.correlationId },
            });
            return;
        }
        const result = await (0, live_session_1.endLiveSession)(sessionId);
        logger_1.logger.info(`Live session ended: ${sessionId}`, { correlationId: req.correlationId });
        const response = {
            sessionId,
            transcript: result.transcript,
            extractedCreativeDirection: result.extractedCreativeDirection,
        };
        res.json(response);
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/v1/live/:sessionId
 * Get current session state.
 */
router.get('/:sessionId', async (req, res, next) => {
    try {
        const { sessionId } = req.params;
        const session = await (0, live_session_1.getLiveSession)(sessionId);
        if (!session) {
            res.status(404).json({
                error: { code: 'SESSION_NOT_FOUND', message: `Session ${sessionId} not found`, correlationId: req.correlationId },
            });
            return;
        }
        res.json(session);
    }
    catch (err) {
        next(err);
    }
});
//# sourceMappingURL=live.js.map