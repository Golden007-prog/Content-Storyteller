import React, { useState, useRef, useCallback } from 'react';
import { startLiveSession, sendLiveInput, stopLiveSession } from '../api/client';
import type { TranscriptEntry, ExtractedCreativeDirection } from '@content-storyteller/shared';
import { HeroSection } from './layout/HeroSection';

interface LiveAgentPanelProps {
  onUseCreativeDirection: (direction: ExtractedCreativeDirection) => void;
}

export function LiveAgentPanel({ onUseCreativeDirection }: LiveAgentPanelProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extractedDirection, setExtractedDirection] = useState<ExtractedCreativeDirection | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => { transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [transcript]);

  const handleStartSession = useCallback(async () => {
    setError(null); setTranscript([]); setExtractedDirection(null); setSessionEnded(false);
    try { const res = await startLiveSession(); setSessionId(res.sessionId); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to start session'); }
  }, []);

  const handleSendText = useCallback(async () => {
    if (!sessionId || !inputText.trim() || isProcessing) return;
    setError(null); setIsProcessing(true);
    try { const res = await sendLiveInput(sessionId, inputText.trim()); setTranscript(res.transcript); setInputText(''); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to send input'); }
    finally { setIsProcessing(false); }
  }, [sessionId, inputText, isProcessing]);

  const handleStopSession = useCallback(async () => {
    if (!sessionId) return;
    setError(null); setIsProcessing(true);
    try {
      const res = await stopLiveSession(sessionId);
      setTranscript(res.transcript);
      if (res.extractedCreativeDirection) setExtractedDirection(res.extractedCreativeDirection);
      setSessionEnded(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to stop session'); }
    finally { setIsProcessing(false); }
  }, [sessionId]);

  const toggleMic = useCallback(async () => {
    if (isRecording) { mediaRecorderRef.current?.stop(); setIsRecording(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = () => {};
      recorder.onstop = () => { stream.getTracks().forEach((t) => t.stop()); };
      recorder.start(); mediaRecorderRef.current = recorder; setIsRecording(true);
    } catch { setError('Microphone access denied. Please type your message instead.'); }
  }, [isRecording]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText(); }
  };

  return (
    <div>
      {/* Hero */}
      {!sessionId && (
        <div className="section-lavender">
          <div className="section-wrapper">
            <HeroSection
              icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>}
              title="Live Agent Mode"
              subtitle="Chat with an AI Creative Director to brainstorm your content direction, then generate a full package from the conversation."
            >
              <button onClick={handleStartSession} className="btn-primary !py-3.5 !px-8 !text-base">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                Start Creative Session
              </button>
              <p className="text-xs text-gray-400 mt-3">No credit card required. Free to try.</p>
            </HeroSection>
          </div>
        </div>
      )}

      {/* Active session */}
      {sessionId && (
        <div className="section-wrapper py-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 max-w-6xl mx-auto">
            {/* Chat area */}
            <div className="card-elevated flex flex-col" style={{ minHeight: '520px' }}>
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-brand flex items-center justify-center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">AI Creative Director</p>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${sessionEnded ? 'bg-gray-400' : 'bg-green-500 animate-pulse'}`} />
                      <span className="text-xs text-gray-500">{sessionEnded ? 'Session ended' : 'Online'}</span>
                    </div>
                  </div>
                </div>
                {!sessionEnded && (
                  <button onClick={handleStopSession} disabled={isProcessing} className="btn-ghost text-red-500 hover:text-red-700 hover:bg-red-50 !text-xs">
                    End Session
                  </button>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                {transcript.length === 0 && (
                  <p className="text-gray-400 text-sm text-center mt-16">Start the conversation — describe what you want to create.</p>
                )}
                {transcript.map((entry, i) => (
                  <div key={i} className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {entry.role !== 'user' && (
                      <div className="w-7 h-7 rounded-lg bg-brand-100 flex items-center justify-center mr-2 mt-1 shrink-0">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-brand-600" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                      </div>
                    )}
                    <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      entry.role === 'user'
                        ? 'bg-gradient-brand text-white rounded-br-md'
                        : 'bg-gray-50 border border-gray-100 text-gray-800 rounded-bl-md'
                    }`}>
                      {entry.text}
                    </div>
                  </div>
                ))}
                {isProcessing && (
                  <div className="flex justify-start">
                    <div className="w-7 h-7 rounded-lg bg-brand-100 flex items-center justify-center mr-2 mt-1 shrink-0">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-brand-600" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                    </div>
                    <div className="bg-gray-50 border border-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
                      <div className="flex gap-1.5"><span className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{animationDelay:'0ms'}} /><span className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{animationDelay:'150ms'}} /><span className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{animationDelay:'300ms'}} /></div>
                    </div>
                  </div>
                )}
                <div ref={transcriptEndRef} />
              </div>

              {/* Input bar */}
              {!sessionEnded && (
                <div className="px-6 py-4 border-t border-gray-100">
                  <div className="flex items-center gap-3">
                    <button onClick={toggleMic} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isRecording ? 'bg-red-100 text-red-600 animate-pulseGlow' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`} title={isRecording ? 'Stop recording' : 'Start recording'}>
                      {isRecording ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /></svg>}
                    </button>
                    <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={handleKeyDown} placeholder="Chat with your AI Creative Director..." disabled={isProcessing} className="input-base !rounded-xl flex-1" />
                    <button onClick={handleSendText} disabled={isProcessing || !inputText.trim()} className="w-10 h-10 rounded-xl bg-gradient-brand text-white flex items-center justify-center shadow-md shadow-brand-500/25 hover:shadow-lg disabled:opacity-50 transition-all">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* Quick Actions */}
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Quick Actions</h3>
                <div className="space-y-2">
                  {['Generate Social Copy', 'Create Storyboard', 'Design Visuals', 'Export Package'].map((action, i) => (
                    <button key={action} className={`w-full text-left text-sm font-medium rounded-xl px-4 py-3 transition-all ${i === 0 ? 'bg-gradient-brand text-white shadow-md shadow-brand-500/20 hover:shadow-lg' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300'}`}>
                      {action}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pro Tips */}
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Pro Tips</h3>
                <ul className="space-y-2.5">
                  {['Be specific about your target audience', 'Mention preferred platforms', 'Share brand guidelines if available'].map((tip) => (
                    <li key={tip} className="flex items-start gap-2.5 text-sm text-gray-600">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-brand-500 mt-0.5 shrink-0"><circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15" /><path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Extracted direction */}
              {extractedDirection && (
                <div className="card-elevated p-5 border-brand-200 bg-brand-50/50">
                  <h4 className="text-sm font-semibold text-brand-800 mb-3">Extracted Creative Direction</h4>
                  {extractedDirection.suggestedPrompt && <p className="text-sm text-gray-700 mb-2"><span className="font-medium">Prompt:</span> {extractedDirection.suggestedPrompt}</p>}
                  {extractedDirection.suggestedPlatform && <p className="text-sm text-gray-700 mb-2"><span className="font-medium">Platform:</span> {extractedDirection.suggestedPlatform.replace(/_/g, ' ')}</p>}
                  {extractedDirection.suggestedTone && <p className="text-sm text-gray-700 mb-2"><span className="font-medium">Tone:</span> {extractedDirection.suggestedTone}</p>}
                  {extractedDirection.keyThemes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {extractedDirection.keyThemes.map((theme, i) => <span key={i} className="pill-brand">{theme}</span>)}
                    </div>
                  )}
                  <button onClick={() => onUseCreativeDirection(extractedDirection)} className="btn-primary w-full !py-2.5 !text-sm">
                    Generate Content Package
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="section-wrapper pb-4">
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
        </div>
      )}
    </div>
  );
}
