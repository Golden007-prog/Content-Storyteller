import type { ImageConcept } from '@content-storyteller/shared';

export interface VisualDirectionProps { imageConcepts: ImageConcept[]; imageUrls?: string[]; }

export function VisualDirection({ imageConcepts, imageUrls }: VisualDirectionProps) {
  const hasImages = !!imageUrls && imageUrls.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-600" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r=".5" /><circle cx="17.5" cy="10.5" r=".5" /><circle cx="8.5" cy="7.5" r=".5" /><circle cx="6.5" cy="12.5" r=".5" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" /></svg>
        </div>
        <h3 className="text-base font-semibold text-gray-900">Visual Direction</h3>
      </div>
      {hasImages && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {imageUrls.map((url, i) => (
            <img
              key={`img-${i}`}
              src={url}
              alt={`Generated image ${i + 1}`}
              loading="lazy"
              className="rounded-lg max-h-64 w-full object-cover border border-gray-200"
            />
          ))}
        </div>
      )}
      {imageConcepts.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {imageConcepts.map((concept, i) => (
            <div key={i} className="card p-4 hover:shadow-md transition-shadow">
              <h4 className="text-sm font-semibold text-gray-900 mb-2">{concept.conceptName}</h4>
              <p className="text-sm text-gray-600 leading-relaxed mb-3">{concept.visualDirection}</p>
              <span className="pill-brand">{concept.style}</span>
            </div>
          ))}
        </div>
      ) : (
        !hasImages && <p className="text-sm text-gray-400 italic">No image concepts available yet.</p>
      )}
    </div>
  );
}
