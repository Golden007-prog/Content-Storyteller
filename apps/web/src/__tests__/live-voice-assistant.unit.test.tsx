import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, act, fireEvent, waitFor } from '@testing-library/react';

/* ── Mocks ────────────────────────────────────────────────────── */

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

const originalAudio = globalThis.Audio;

/* ── Helpers ──────────────────────────────────────────────────── */

async function startSession(container: HTMLElement) {
  const startBtn = Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent?.includes('Start Creative Session'),
  );
  expect(startBtn).toBeDefined();
  await act(async () => {
    fireEvent.click(startBtn!);
  });
}

function findMicButton(container: HTMLElement) {
  return container.querySelector(
    'button[title="Start recording"], button[title="Stop recording"]',
  ) as HTMLButtonElement | null;
}

function findSendButton(container: HTMLElement) {
  const input = container.querySelector('input[type="text"]');
  if (!input) return null;
  const inputBar = input.closest('div.flex');
  if (!inputBar) return null;
  const buttons = inputBar.querySelectorAll('button');
  return buttons[buttons.length - 1] as HTMLButtonElement;
}

/* ── Tests ─────────────────────────────────────────────────────── */

describe('LiveAgentPanel voice features – unit tests', () => {
  let speechInstance: MockSpeechRecognition;
  let audioInstance: MockAudio;

  beforeEach(() => {
    vi.clearAllMocks();
    speechInstance = new MockSpeechRecognition();
    (window as any).SpeechRecognition = vi.fn(() => speechInstance);
    (window as any).webkitSpeechRecognition = vi.fn(() => speechInstance);

    audioInstance = new MockAudio();
    (globalThis as any).Audio = vi.fn(() => audioInstance);

    mockStartLiveSession.mockResolvedValue({ sessionId: 'unit-session', status: 'active' });
    mockSendLiveInput.mockResolvedValue({
      sessionId: 'unit-session',
      agentText: 'Hello',
      audioBase64: null,
      transcript: [],
    });
    mockStopLiveSession.mockResolvedValue({ sessionId: 'unit-session', transcript: [] });
  });

  afterEach(() => {
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;
    (globalThis as any).Audio = originalAudio;
  });

  /**
   * Test 1: Mic button starts/stops SpeechRecognition
   * Validates: Requirements 5.1, 5.4
   */
  it('mic button starts SpeechRecognition on first click and stops on second click', async () => {
    const { container } = render(
      <LiveAgentPanel onUseCreativeDirection={vi.fn()} />,
    );

    await startSession(container);

    const micBtn = findMicButton(container);
    expect(micBtn).not.toBeNull();

    // First click → start recognition
    await act(async () => {
      fireEvent.click(micBtn!);
    });
    expect(speechInstance.start).toHaveBeenCalledTimes(1);

    // Second click → stop recognition
    const stopBtn = container.querySelector('button[title="Stop recording"]') as HTMLButtonElement;
    expect(stopBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(stopBtn);
    });
    expect(speechInstance.stop).toHaveBeenCalledTimes(1);
  });

  /**
   * Test 2: No SpeechRecognition shows fallback message
   * Validates: Requirements 5.5
   */
  it('shows fallback error when browser does not support SpeechRecognition', async () => {
    // Remove SpeechRecognition from window
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;

    const { container } = render(
      <LiveAgentPanel onUseCreativeDirection={vi.fn()} />,
    );

    await startSession(container);

    const micBtn = findMicButton(container);
    expect(micBtn).not.toBeNull();

    await act(async () => {
      fireEvent.click(micBtn!);
    });

    // Should display an error about speech recognition not being supported
    await waitFor(() => {
      const errorEl = container.querySelector('.text-red-700, .text-red-600');
      expect(errorEl).not.toBeNull();
      expect(errorEl!.textContent).toMatch(/speech recognition/i);
    });
  });

  /**
   * Test 3: AudioEqualizer is rendered inside agent chat bubble
   * Validates: Requirements 8.1
   */
  it('renders AudioEqualizer in agent chat bubble after receiving agent response', async () => {
    mockSendLiveInput.mockResolvedValue({
      sessionId: 'unit-session',
      agentText: 'Here is my creative advice',
      audioBase64: null,
      transcript: [
        { role: 'user', text: 'hello', timestamp: new Date().toISOString() },
        { role: 'agent', text: 'Here is my creative advice', timestamp: new Date().toISOString() },
      ],
    });

    const { container } = render(
      <LiveAgentPanel onUseCreativeDirection={vi.fn()} />,
    );

    await startSession(container);

    // Type and send a message
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'hello' } });
    });

    const sendBtn = findSendButton(container);
    await act(async () => {
      fireEvent.click(sendBtn!);
    });

    await waitFor(() => {
      const equalizer = container.querySelector('[role="img"][aria-label="Audio equalizer"]');
      expect(equalizer).not.toBeNull();
    });
  });

  /**
   * Test 4: AudioEqualizer receives isSpeaking as active prop
   * Validates: Requirements 8.2
   *
   * When audioBase64 is present, isSpeaking=true → bars running.
   * After audio.onended fires, isSpeaking=false → bars paused.
   */
  it('AudioEqualizer bars reflect isSpeaking state during audio playback', async () => {
    mockSendLiveInput.mockResolvedValue({
      sessionId: 'unit-session',
      agentText: 'AI response with audio',
      audioBase64: 'dGVzdGF1ZGlv',
      transcript: [
        { role: 'user', text: 'hello', timestamp: new Date().toISOString() },
        { role: 'agent', text: 'AI response with audio', timestamp: new Date().toISOString() },
      ],
    });

    const { container } = render(
      <LiveAgentPanel onUseCreativeDirection={vi.fn()} />,
    );

    await startSession(container);

    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'hello' } });
    });

    const sendBtn = findSendButton(container);
    await act(async () => {
      fireEvent.click(sendBtn!);
    });

    // Wait for audio playback to start
    await waitFor(() => {
      expect(audioInstance.play).toHaveBeenCalled();
    });

    // Equalizer bars should be running (isSpeaking=true)
    await waitFor(() => {
      const equalizer = container.querySelector('[role="img"][aria-label="Audio equalizer"]');
      expect(equalizer).not.toBeNull();
      const bars = equalizer!.querySelectorAll('div');
      expect(bars.length).toBeGreaterThanOrEqual(4);
      bars.forEach((bar) => {
        expect(bar.style.animationPlayState).toBe('running');
      });
    });

    // Simulate audio ended
    await act(async () => {
      audioInstance.onended?.();
    });

    // Equalizer bars should be paused (isSpeaking=false)
    await waitFor(() => {
      const equalizer = container.querySelector('[role="img"][aria-label="Audio equalizer"]');
      if (equalizer) {
        const bars = equalizer.querySelectorAll('div');
        bars.forEach((bar) => {
          expect(bar.style.animationPlayState).toBe('paused');
        });
      }
    });
  });

  /**
   * Test 5: Audio playback failure sets isSpeaking=false
   * Validates: Requirements 6.4
   */
  it('sets isSpeaking to false when audio.play() rejects', async () => {
    // Make play() reject to simulate autoplay policy block
    audioInstance.play = vi.fn().mockRejectedValue(new Error('Autoplay blocked'));

    mockSendLiveInput.mockResolvedValue({
      sessionId: 'unit-session',
      agentText: 'Response with broken audio',
      audioBase64: 'dGVzdGF1ZGlv',
      transcript: [
        { role: 'user', text: 'hello', timestamp: new Date().toISOString() },
        { role: 'agent', text: 'Response with broken audio', timestamp: new Date().toISOString() },
      ],
    });

    const { container } = render(
      <LiveAgentPanel onUseCreativeDirection={vi.fn()} />,
    );

    await startSession(container);

    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'hello' } });
    });

    const sendBtn = findSendButton(container);
    await act(async () => {
      fireEvent.click(sendBtn!);
    });

    // Wait for the play rejection to be handled
    await waitFor(() => {
      expect(audioInstance.play).toHaveBeenCalled();
    });

    // After play failure, equalizer should show paused state (isSpeaking=false)
    await waitFor(() => {
      const equalizer = container.querySelector('[role="img"][aria-label="Audio equalizer"]');
      if (equalizer) {
        const bars = equalizer.querySelectorAll('div');
        bars.forEach((bar) => {
          expect(bar.style.animationPlayState).toBe('paused');
        });
      }
    });
  });
});
