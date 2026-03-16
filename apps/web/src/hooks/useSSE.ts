import { useEffect, useRef, useCallback } from 'react';
import type { StreamEventShape } from '@content-storyteller/shared';
import { createSSEConnection } from '../api/client';

export interface SSECallbacks {
  onStateChange?: (data: StreamEventShape['data']) => void;
  onPartialResult?: (data: StreamEventShape['data']) => void;
  onComplete?: (data: StreamEventShape['data']) => void;
  onFailed?: (data: StreamEventShape['data']) => void;
  onError?: (error: Event) => void;
}

export interface UseSSEOptions {
  jobId: string | null;
  enabled?: boolean;
  callbacks: SSECallbacks;
}

export function useSSE({ jobId, enabled = true, callbacks }: UseSSEOptions): void {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const sourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!jobId || !enabled) {
      cleanup();
      return;
    }

    const connect = () => {
      cleanup();

      const source = createSSEConnection(jobId);
      sourceRef.current = source;

      const parseData = (event: MessageEvent): StreamEventShape['data'] | null => {
        try {
          return JSON.parse(event.data);
        } catch {
          return null;
        }
      };

      source.addEventListener('state_change', (event: MessageEvent) => {
        const data = parseData(event);
        if (data) callbacksRef.current.onStateChange?.(data);
        reconnectAttemptRef.current = 0;
      });

      source.addEventListener('partial_result', (event: MessageEvent) => {
        const data = parseData(event);
        if (data) callbacksRef.current.onPartialResult?.(data);
      });

      source.addEventListener('complete', (event: MessageEvent) => {
        const data = parseData(event);
        if (data) callbacksRef.current.onComplete?.(data);
        cleanup();
      });

      source.addEventListener('failed', (event: MessageEvent) => {
        const data = parseData(event);
        if (data) callbacksRef.current.onFailed?.(data);
        cleanup();
      });

      source.onerror = (event: Event) => {
        callbacksRef.current.onError?.(event);

        // Reconnect with exponential backoff if not a terminal close
        if (source.readyState === EventSource.CLOSED) {
          const attempt = reconnectAttemptRef.current;
          const delay = Math.min(1000 * 2 ** attempt, 30000);
          reconnectAttemptRef.current = attempt + 1;
          reconnectTimerRef.current = setTimeout(connect, delay);
        }
      };
    };

    connect();

    return cleanup;
  }, [jobId, enabled, cleanup]);
}
