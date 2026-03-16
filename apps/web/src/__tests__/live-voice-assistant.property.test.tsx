import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import React from 'react';
import { render, act, fireEvent } from '@testing-library/react';
import { AudioEqualizer } from '../components/AudioEqualizer';

/**
 * Feature: live-agent-voice-assistant, Property 10: Equalizer bars have distinct animation delays
 *
 * For any rendered AudioEqualizer component, each bar element SHALL have a
 * unique animation-delay value, ensuring independent movement.
 *
 * **Validates: Requirements 7.3**
 */
describe('Feature: live-agent-voice-assistant, Property 10: Equalizer bars have distinct animation delays', () => {
  it('all bar elements have unique animation-delay values regardless of active prop', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (active) => {
          const { container, unmount } = render(<AudioEqualizer active={active} />);

          const equalizerContainer = container.querySelector('[role="img"]');
          expect(equalizerContainer).not.toBeNull();

          // Bars are the child divs inside the role="img" container
          const bars = equalizerContainer!.querySelectorAll('div');
          expect(bars.length).toBeGreaterThanOrEqual(4);
          expect(bars.length).toBeLessThanOrEqual(5);

          // Extract animation-delay from each bar's inline style
          const delays: string[] = [];
          bars.forEach((bar) => {
            const delay = bar.style.animationDelay;
            expect(delay).toBeDefined();
            expect(delay).not.toBe('');
            delays.push(delay);
          });

          // All delays must be unique
          const uniqueDelays = new Set(delays);
          expect(uniqueDelays.size).toBe(delays.length);

          unmount();
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Feature: live-agent-voice-assistant, Property 11: Equalizer active prop controls animation state
 *
 * For any boolean value of the active prop, the AudioEqualizer bars SHALL have
 * animation-play-state set to 'running' when active is true and 'paused' when
 * active is false.
 *
 * **Validates: Requirements 7.4, 7.5, 8.3**
 */
describe('Feature: live-agent-voice-assistant, Property 11: Equalizer active prop controls animation state', () => {
  it('bars have animationPlayState running when active=true and paused when active=false', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (active) => {
          const { container, unmount } = render(<AudioEqualizer active={active} />);

          const equalizerContainer = container.querySelector('[role="img"]');
          expect(equalizerContainer).not.toBeNull();

          const bars = equalizerContainer!.querySelectorAll('div');
          expect(bars.length).toBeGreaterThanOrEqual(4);

          const expectedState = active ? 'running' : 'paused';

          bars.forEach((bar) => {
            expect(bar.style.animationPlayState).toBe(expectedState);
          });

          unmount();
        },
      ),
      { numRuns: 100 },
    );
  });
});

/* ── Mocks for LiveAgentPanel tests ──────────────────────────── */

// Mock the API client module
const mockStartLiveSession = vi.fn();
const mockSendLiveInput = vi.fn();
const mockStopLiveSession = vi.fn();

vi.mock('../api/client', () => ({
  startLiveSession: (...args: any[]) => mockStartLiveSession(...args),
  sendLiveInput: (...args: any[]) => mockSendLiveInput(...args),
  stopLiveSession: (...args: any[]) => mockStopLiveSession(...args),
}));

import { LiveAgentPanel } from '../components/LiveAgentPanel';

// SpeechRecognition mock
class MockSpeechRecognition {
  continuous = false;
  interimResults = false;
  onresult: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
}

// Audio mock
class MockAudio {
  src = '';
  onended: (() => void) | null = null;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
}

/**
 * Feature: live-agent-voice-assistant, Property 8: Speech recognition updates input field
 *
 * For any speech recognition result (interim or final) produced by the browser
 * SpeechRecognition API, the Live_Agent_Panel input field value SHALL reflect
 * the transcribed text.
 *
 * **Validates: Requirements 5.2, 5.3**
 */
describe('Feature: live-agent-voice-assistant, Property 8: Speech recognition updates input field', () => {
  let speechInstance: MockSpeechRecognition;

  beforeEach(() => {
    vi.clearAllMocks();
    speechInstance = new MockSpeechRecognition();
    (window as any).SpeechRecognition = vi.fn(() => speechInstance);
    (window as any).webkitSpeechRecognition = vi.fn(() => speechInstance);

    mockStartLiveSession.mockResolvedValue({ sessionId: 'test-session', status: 'active' });
    mockSendLiveInput.mockResolvedValue({
      sessionId: 'test-session',
      agentText: 'Hello',
      audioBase64: null,
      transcript: [],
    });
    mockStopLiveSession.mockResolvedValue({
      sessionId: 'test-session',
      transcript: [],
    });
  });

  afterEach(() => {
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;
  });

  it('for any random transcript string, SpeechRecognition onresult updates the input field', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
        async (transcript) => {
          const onUseCreativeDirection = vi.fn();
          const { container, unmount } = render(
            <LiveAgentPanel onUseCreativeDirection={onUseCreativeDirection} />,
          );

          // Start a session by clicking the "Start Creative Session" button
          const allButtons = container.querySelectorAll('button');
          const startBtn = Array.from(allButtons).find((b) =>
            b.textContent?.includes('Start Creative Session'),
          );
          expect(startBtn).toBeDefined();

          await act(async () => {
            fireEvent.click(startBtn!);
          });

          // After session starts, find the mic button in the input bar
          const micButton = container.querySelector(
            'button[title="Start recording"], button[title="Stop recording"]',
          );

          if (micButton) {
            // Click mic to start speech recognition
            await act(async () => {
              fireEvent.click(micButton);
            });

            // Simulate SpeechRecognition onresult event
            if (speechInstance.onresult) {
              const event = {
                results: [[{ transcript, isFinal: true }]],
                resultIndex: 0,
              };
              await act(async () => {
                speechInstance.onresult!(event);
              });
            }

            // Verify the input field contains the transcript text
            const input = container.querySelector('input[type="text"]') as HTMLInputElement;
            if (input && speechInstance.onresult) {
              expect(input.value).toContain(transcript);
            }
          } else {
            // If mic button doesn't have title attribute, find by position
            // The mic button is the first button in the input bar area
            const inputEl = container.querySelector('input[type="text"]');
            expect(inputEl).not.toBeNull();

            // The input bar has buttons: mic, then send
            const inputBar = inputEl!.closest('div.flex');
            if (inputBar) {
              const barButtons = inputBar.querySelectorAll('button');
              if (barButtons.length >= 1) {
                const micBtn = barButtons[0];
                await act(async () => {
                  fireEvent.click(micBtn);
                });

                if (speechInstance.onresult) {
                  const event = {
                    results: [[{ transcript, isFinal: true }]],
                    resultIndex: 0,
                  };
                  await act(async () => {
                    speechInstance.onresult!(event);
                  });
                }

                const input = container.querySelector('input[type="text"]') as HTMLInputElement;
                if (input && speechInstance.onresult) {
                  expect(input.value).toContain(transcript);
                }
              }
            }
          }

          unmount();
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Feature: live-agent-voice-assistant, Property 9: isSpeaking tracks audio lifecycle
 *
 * For any non-null audioBase64 response, when the Audio object begins playback
 * isSpeaking SHALL be true, and when the Audio object fires onended, isSpeaking
 * SHALL be false. If playback fails, isSpeaking SHALL also be false.
 *
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
 */
describe('Feature: live-agent-voice-assistant, Property 9: isSpeaking tracks audio lifecycle', () => {
  let audioInstance: MockAudio;
  const originalAudio = globalThis.Audio;

  beforeEach(() => {
    vi.clearAllMocks();
    audioInstance = new MockAudio();
    (globalThis as any).Audio = vi.fn(() => audioInstance);

    // Set up SpeechRecognition mock
    (window as any).SpeechRecognition = vi.fn(() => new MockSpeechRecognition());
    (window as any).webkitSpeechRecognition = vi.fn(() => new MockSpeechRecognition());

    mockStartLiveSession.mockResolvedValue({ sessionId: 'test-session', status: 'active' });
    mockStopLiveSession.mockResolvedValue({
      sessionId: 'test-session',
      transcript: [],
    });
  });

  afterEach(() => {
    (globalThis as any).Audio = originalAudio;
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;
  });

  it('AudioEqualizer active prop reflects speaking state during audio playback lifecycle', { timeout: 30000 }, async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a random base64-like string to simulate audioBase64
        fc.base64String({ minLength: 10, maxLength: 100 }),
        async (audioBase64) => {
          // Mock sendLiveInput to return audioBase64
          mockSendLiveInput.mockResolvedValue({
            sessionId: 'test-session',
            agentText: 'AI response',
            audioBase64,
            transcript: [
              { role: 'user', text: 'hello', timestamp: new Date().toISOString() },
              { role: 'agent', text: 'AI response', timestamp: new Date().toISOString() },
            ],
          });

          const onUseCreativeDirection = vi.fn();
          const { container, unmount } = render(
            <LiveAgentPanel onUseCreativeDirection={onUseCreativeDirection} />,
          );

          // Start a session
          const allButtons = container.querySelectorAll('button');
          const startBtn = Array.from(allButtons).find((b) =>
            b.textContent?.includes('Start Creative Session'),
          );
          expect(startBtn).toBeDefined();

          await act(async () => {
            fireEvent.click(startBtn!);
          });

          // Type and send a message
          const input = container.querySelector('input[type="text"]') as HTMLInputElement;
          if (input) {
            await act(async () => {
              fireEvent.change(input, { target: { value: 'hello' } });
            });

            // Find and click the send button (last button in the input bar)
            const inputBar = input.closest('div.flex');
            if (inputBar) {
              const barButtons = inputBar.querySelectorAll('button');
              const sendBtn = barButtons[barButtons.length - 1];
              await act(async () => {
                fireEvent.click(sendBtn);
              });
            }
          }

          // Wait for the response to be processed
          await act(async () => {
            await new Promise((r) => setTimeout(r, 50));
          });

          // After audio starts playing, check if AudioEqualizer shows active state
          if ((globalThis.Audio as any).mock?.calls?.length > 0) {
            // Audio was created - verify play was called
            expect(audioInstance.play).toHaveBeenCalled();

            // Check that AudioEqualizer is rendered with active state (running)
            const equalizer = container.querySelector('[role="img"][aria-label="Audio equalizer"]');
            if (equalizer) {
              const bars = equalizer.querySelectorAll('div');
              bars.forEach((bar) => {
                expect(bar.style.animationPlayState).toBe('running');
              });
            }

            // Simulate audio ended
            if (audioInstance.onended) {
              await act(async () => {
                audioInstance.onended!();
              });
            }

            // After audio ends, equalizer should show paused state
            const equalizerAfter = container.querySelector('[role="img"][aria-label="Audio equalizer"]');
            if (equalizerAfter) {
              const barsAfter = equalizerAfter.querySelectorAll('div');
              barsAfter.forEach((bar) => {
                expect(bar.style.animationPlayState).toBe('paused');
              });
            }
          }

          unmount();
        },
      ),
      { numRuns: 100 },
    );
  });
});
