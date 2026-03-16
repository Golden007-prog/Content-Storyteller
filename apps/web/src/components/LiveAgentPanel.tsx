import React, { useState, useRef, useCallback } from 'react';
import { startLiveSession, sendLiveInput, stopLiveSession } from '../api/client';
import type { TranscriptEntry, ExtractedCreativeDirection } from '@content-storyteller/shared';
import { HeroSection } from './layout/HeroSection';
import { AudioEqualizer } from './AudioEqualizer';

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
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => { transcriptEndRef.current?.scrollIntoView?.({ behavior: 'smooth' }); }, [transcript]);

  React.useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSpeechSupported(!!SR);
  }, []);

  const handleStartSession = useCallback(async () => {
    setError(null); setTranscript([]); setExtractedDirection(null); setSessionEnded(false);
    try { const res = await startLiveSession(); setSessionId(res.sessionId); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to start session'); }
  }, []);

  const handleSendText = useCallback(async () => {
    if (!sessionId || !inputText.trim() || isProcessing) return;
    setError(null); setIsProcessing(true);
    try {
      const res = await sendLiveInput(sessionId, inputText.trim());
      setTranscript(res.transcript);
      setInputText('');

      // Play audio if available
      if (res.audioBase64) {
        try {
          const audio = new Audio(`data:audio/pcm;base64,${res.audioBase64}`);
          audio.onended = () => setIsSpeaking(false);
          setIsSpeaking(true);
          await audio.play();
        } catch {
          setIsSpeaking(false);
        }
      }
    }
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

  const toggleMic = useCallback(() => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setError('Speech recognition is not supported in this browser. Please type your message instead.');
      return;
    }
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event: any) => {
      const results = event.results;
      let transcript = '';
      for (let i = 0; i < results.length; i++) {
        transcript += results[i][0].transcript;
      }
      setInputText(transcript);
    };
    recognition.onerror = () => {
      setIsRecording(false);
      setError('Speech recognition error. Please try again or type your message.');
    };
    recognition.onend = () => {
      setIsRecording(false);
    };
    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }, [isRecording]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText(); }
  };

  const handleExploreTrends = useCallback(async () => {
    if (!sessionId || isProcessing) return;
    setInputText("What's trending right now? Show me the top trends for content creation.");
    // Auto-send after a brief tick so the input is visible
    setTimeout(() => {
      handleSendText();
    }, 0);
  }, [sessionId, isProcessing, handleSendText]);

  /**
   * Detect trend references in agent text (hashtags, trend keywords).
   * Returns JSX with highlighted trend indicators.
   */
  const renderMessageWithTrendIndicators = (text: string, role: string) => {
    if (role === 'user') return text;

    // Highlight hashtags
    const parts = text.split(/(#\w+)/g);
    const hasTrendContent = parts.some((p) => p.startsWith('#'));

    return (
      <span>
        {parts.map((part, i) =>
          part.startsWith('#') ? (
            <span key={i} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-brand-100 text-brand-700 font-medium text-xs mx-0.5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></svg>
              {part}
            </span>
          ) : (
            <React.Fragment key={i}>{part}</React.Fragment>
          ),
        )}
        {hasTrendContent && (
          <span className="inline-flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-semibold uppercase tracking-wide">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
            Trend
          </span>
        )}
      </span>
    );
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
                      {renderMessageWithTrendIndicators(entry.text, entry.role)}
                      {entry.role === 'agent' && i === transcript.length - 1 && (
                        <span className="inline-block ml-2 align-middle">
                          <AudioEqualizer active={isSpeaking} />
                        </span>
                      )}
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
                  <button
                    onClick={handleExploreTrends}
                    disabled={isProcessing || sessionEnded}
                    className="w-full text-left text-sm font-medium rounded-xl px-4 py-3 transition-all bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-md shadow-green-500/20 hover:shadow-lg disabled:opacity-50 flex items-center gap-2"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
                    Explore Trends
                  </button>
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
