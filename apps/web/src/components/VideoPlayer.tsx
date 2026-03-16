export interface VideoPlayerProps { signedUrl: string; }

export function VideoPlayer({ signedUrl }: VideoPlayerProps) {
  return (
    <div className="w-full max-w-2xl mx-auto">
      <video className="w-full rounded-2xl shadow-lg border border-gray-100" controls preload="metadata" src={signedUrl}>
        Your browser does not support the video element.
      </video>
    </div>
  );
}
