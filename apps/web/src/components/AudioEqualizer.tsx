import React from 'react';

interface AudioEqualizerProps {
  active: boolean;
}

const BAR_COUNT = 5;
const DELAYS = ['0ms', '150ms', '300ms', '100ms', '250ms'];

export function AudioEqualizer({ active }: AudioEqualizerProps) {
  return (
    <div className="inline-flex items-end gap-[2px] h-6" role="img" aria-label="Audio equalizer">
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <div
          key={i}
          className="w-[3px] rounded-full bg-brand-500"
          style={{
            height: '100%',
            animation: 'equalizerBounce 0.6s ease-in-out infinite alternate',
            animationDelay: DELAYS[i],
            animationPlayState: active ? 'running' : 'paused',
            transform: active ? undefined : 'scaleY(0.3)',
          }}
        />
      ))}
      <style>{`
        @keyframes equalizerBounce {
          0% { transform: scaleY(0.3); }
          100% { transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
}
