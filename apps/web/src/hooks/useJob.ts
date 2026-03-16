import { useState, useCallback } from 'react';
import type {
  CreateJobResponse,
  PollJobStatusResponse,
  Platform,
  Tone,
  OutputPreference,
} from '@content-storyteller/shared';
import { uploadFiles, createJob, pollJob } from '../api/client';

export type JobPhase = 'idle' | 'uploading' | 'creating' | 'streaming' | 'completed' | 'failed';

export interface UseJobReturn {
  phase: JobPhase;
  jobId: string | null;
  jobData: PollJobStatusResponse | null;
  error: string | null;
  startJob: (files: File[], promptText: string, platform: Platform, tone: Tone, outputPreference?: OutputPreference) => Promise<string>;
  refreshJob: () => Promise<void>;
  setPhase: (phase: JobPhase) => void;
}

export function useJob(): UseJobReturn {
  const [phase, setPhase] = useState<JobPhase>('idle');
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobData, setJobData] = useState<PollJobStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startJob = useCallback(
    async (files: File[], promptText: string, platform: Platform, tone: Tone, outputPreference?: OutputPreference): Promise<string> => {
      setError(null);

      try {
        // Upload files (skip if none provided)
        let uploadedMediaPaths: string[] = [];
        if (files.length > 0) {
          setPhase('uploading');
          const uploads = await uploadFiles(files);
          uploadedMediaPaths = uploads.map((u) => u.uploadPath);
        }

        // Create job
        setPhase('creating');
        const idempotencyKey = crypto.randomUUID();
        const response: CreateJobResponse = await createJob({
          uploadedMediaPaths,
          idempotencyKey,
          promptText,
          platform,
          tone,
          outputPreference,
        });

        setJobId(response.jobId);
        setPhase('streaming');
        return response.jobId;
      } catch (err) {
        let message = 'An unexpected error occurred';
        if (err instanceof Error) {
          // Surface the backend's structured error message directly
          message = err.message;
        }
        setError(message);
        setPhase('failed');
        throw err;
      }
    },
    [],
  );

  const refreshJob = useCallback(async () => {
    if (!jobId) return;
    try {
      const data = await pollJob(jobId);
      setJobData(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh job';
      setError(message);
    }
  }, [jobId]);

  return { phase, jobId, jobData, error, startJob, refreshJob, setPhase };
}
