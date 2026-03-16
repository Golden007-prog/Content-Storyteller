"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.VideoGenerationCapability = void 0;
const shared_1 = require("@content-storyteller/shared");
const gcp_1 = require("../config/gcp");
const VIDEO_POLL_INTERVAL_MS = 15_000; // 15 seconds between polls
const VIDEO_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
/**
 * Video generation capability backed by Vertex AI Veo API.
 *
 * Uses the Vertex AI REST API to submit video generation jobs,
 * polls for completion with a 10-minute timeout, and returns
 * the resulting mp4 video data as base64.
 *
 * Falls back gracefully when the API is unavailable or access is denied.
 */
class VideoGenerationCapability {
    name = 'video_generation';
    cachedAvailability = null;
    lastCheckTime = 0;
    cacheTtlMs = 60_000; // re-check every 60s
    async isAvailable() {
        const now = Date.now();
        if (this.cachedAvailability !== null && now - this.lastCheckTime < this.cacheTtlMs) {
            return this.cachedAvailability;
        }
        if (!(0, gcp_1.getGcpConfig)().projectId) {
            this.cachedAvailability = false;
            this.lastCheckTime = now;
            return false;
        }
        try {
            // Lightweight probe: check if we can get an access token via ADC
            const { GoogleAuth } = await Promise.resolve().then(() => __importStar(require('google-auth-library')));
            const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
            await auth.getAccessToken();
            this.cachedAvailability = true;
        }
        catch {
            this.cachedAvailability = false;
        }
        this.lastCheckTime = now;
        return this.cachedAvailability;
    }
    async generate(input) {
        const { jobId, data } = input;
        const brief = data.brief;
        const storyboard = data.storyboard;
        const videoBrief = data.videoBrief;
        const prompt = buildVeoPrompt(brief, storyboard, videoBrief);
        try {
            const { GoogleAuth } = await Promise.resolve().then(() => __importStar(require('google-auth-library')));
            const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
            const accessToken = await auth.getAccessToken();
            if (!accessToken) {
                return { success: false, assets: [], metadata: { reason: 'no-access-token' } };
            }
            const cfg = (0, gcp_1.getGcpConfig)();
            const loc = (0, shared_1.getLocation)('videoFinal');
            // Submit video generation job to Vertex AI Veo API
            const endpoint = `https://${loc}-aiplatform.googleapis.com/v1/projects/${cfg.projectId}/locations/${loc}/publishers/google/models/${(0, shared_1.getModel)('videoFinal')}:predictLongRunning`;
            const requestBody = {
                instances: [{ prompt }],
                parameters: {
                    aspectRatio: '16:9',
                    sampleCount: 1,
                    durationSeconds: 8,
                },
            };
            const submitResponse = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });
            if (!submitResponse.ok) {
                const errorText = await submitResponse.text();
                if (isAccessDeniedStatus(submitResponse.status) || isAccessDeniedMessage(errorText)) {
                    return { success: false, assets: [], metadata: { reason: 'access-denied', detail: errorText } };
                }
                throw new Error(`Veo API submit failed (${submitResponse.status}): ${errorText}`);
            }
            const submitResult = await submitResponse.json();
            const operationName = submitResult.name;
            if (!operationName) {
                throw new Error('Veo API did not return an operation name');
            }
            // Poll for completion with 10-minute timeout
            const videoData = await this.pollForCompletion(operationName, accessToken);
            if (!videoData) {
                return {
                    success: false,
                    assets: [],
                    metadata: { jobId, reason: 'timeout-or-no-video', operationName },
                };
            }
            return {
                success: true,
                assets: [videoData], // base64-encoded mp4 data
                metadata: { jobId, model: (0, shared_1.getModel)('videoFinal'), operationName },
            };
        }
        catch (err) {
            if (isAccessDenied(err)) {
                return { success: false, assets: [], metadata: { reason: 'access-denied' } };
            }
            throw err;
        }
    }
    /**
     * Poll the Vertex AI long-running operation until completion or timeout.
     * Returns base64-encoded video data on success, null on timeout/failure.
     */
    async pollForCompletion(operationName, accessToken) {
        const pollEndpoint = `https://${(0, shared_1.getLocation)('videoFinal')}-aiplatform.googleapis.com/v1/${operationName}`;
        const deadline = Date.now() + VIDEO_TIMEOUT_MS;
        while (Date.now() < deadline) {
            await sleep(VIDEO_POLL_INTERVAL_MS);
            const pollResponse = await fetch(pollEndpoint, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${accessToken}` },
            });
            if (!pollResponse.ok) {
                const errorText = await pollResponse.text();
                if (isAccessDeniedStatus(pollResponse.status)) {
                    throw Object.assign(new Error(`Poll access denied: ${errorText}`), { code: 403 });
                }
                // Transient error — continue polling
                continue;
            }
            const pollResult = await pollResponse.json();
            if (pollResult.error) {
                throw new Error(`Veo operation failed: ${pollResult.error.message || 'Unknown error'}`);
            }
            if (pollResult.done) {
                const predictions = pollResult.response?.predictions;
                if (predictions && predictions.length > 0 && predictions[0].bytesBase64Encoded) {
                    return predictions[0].bytesBase64Encoded;
                }
                // Done but no video data
                return null;
            }
        }
        // Timeout reached
        return null;
    }
}
exports.VideoGenerationCapability = VideoGenerationCapability;
function buildVeoPrompt(brief, storyboard, videoBrief) {
    const parts = [];
    if (brief) {
        parts.push(`Create a short promotional video for: ${brief.inputSummary || brief.keyMessages.join(', ')}`);
        parts.push(`Target audience: ${brief.targetAudience}`);
        parts.push(`Tone: ${brief.tone}`);
        parts.push(`Visual direction: ${brief.visualDirection}`);
        if (brief.campaignAngle)
            parts.push(`Campaign angle: ${brief.campaignAngle}`);
    }
    else {
        parts.push('Create a short promotional marketing video');
    }
    if (storyboard && storyboard.scenes.length > 0) {
        const sceneDesc = storyboard.scenes
            .map(s => `Scene ${s.sceneNumber}: ${s.description} (${s.duration}, ${s.motionStyle})`)
            .join('. ');
        parts.push(`Storyboard: ${sceneDesc}`);
    }
    if (videoBrief) {
        parts.push(`Motion style: ${videoBrief.motionStyle}`);
        parts.push(`Energy: ${videoBrief.energyDirection}`);
    }
    return parts.join('. ');
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function isAccessDeniedStatus(status) {
    return status === 403 || status === 401;
}
function isAccessDeniedMessage(text) {
    const lower = text.toLowerCase();
    return lower.includes('permission denied') || lower.includes('403') || lower.includes('unauthorized');
}
function isAccessDenied(err) {
    if (err && typeof err === 'object') {
        const code = err.code;
        const status = err.status;
        if (code === 403 || code === '403' || status === 403 || status === '403')
            return true;
        const message = String(err.message || '');
        if (message.includes('403') || message.toLowerCase().includes('permission denied')) {
            return true;
        }
    }
    return false;
}
//# sourceMappingURL=video-generation.js.map