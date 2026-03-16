import React, { useCallback, useRef, useState } from 'react';

interface UploadFormProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
}

const ACCEPTED_TYPES = 'image/*,audio/*,video/*,application/pdf';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(type: string) {
  if (type.startsWith('image/')) return '🖼️';
  if (type.startsWith('video/')) return '🎬';
  if (type.startsWith('audio/')) return '🎵';
  if (type.includes('pdf')) return '📄';
  return '📎';
}

export function UploadForm({ files, onFilesChange }: UploadFormProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    onFilesChange([...files, ...Array.from(incoming)]);
  }, [files, onFilesChange]);

  const removeFile = useCallback((index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
  }, [files, onFilesChange]);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addFiles(e.target.files);
    if (inputRef.current) inputRef.current.value = '';
  }, [addFiles]);

  const handleZoneClick = useCallback(() => { inputRef.current?.click(); }, []);

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleZoneClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleZoneClick(); } }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition-all duration-200 ${
          isDragOver
            ? 'bg-brand-50 border-brand-400 shadow-inner'
            : 'border-gray-200 hover:border-brand-300 hover:bg-gray-50'
        }`}
      >
        <input ref={inputRef} type="file" multiple accept={ACCEPTED_TYPES} onChange={handleInputChange} className="hidden" aria-label="Upload files" />
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3 transition-colors ${isDragOver ? 'bg-brand-200' : 'bg-brand-100'}`}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-600" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-gray-900 mb-0.5">Drag & drop files or click to browse</p>
        <p className="text-xs text-gray-400">JPG, PNG, MP4, MP3, PDF — up to 50 MB each</p>
      </div>

      {/* File thumbnails */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2.5">
          {files.map((f, i) => (
            <div key={`${f.name}-${i}`} className="relative group">
              <div className="w-20 h-20 rounded-xl bg-gray-50 border border-gray-200 overflow-hidden flex items-center justify-center transition-shadow group-hover:shadow-md">
                {f.type.startsWith('image/') ? (
                  <img src={URL.createObjectURL(f)} alt={f.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center px-1">
                    <span className="text-lg">{fileIcon(f.type)}</span>
                    <p className="text-[10px] text-gray-500 font-medium mt-0.5 truncate max-w-[60px]">{f.name.split('.').pop()?.toUpperCase()}</p>
                    <p className="text-[9px] text-gray-400">{formatFileSize(f.size)}</p>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-800 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-red-600"
                aria-label={`Remove ${f.name}`}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
          ))}
          {/* Add more button */}
          <button
            type="button"
            onClick={handleZoneClick}
            className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400 hover:border-brand-300 hover:text-brand-500 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            <span className="text-[10px] font-medium mt-0.5">Add</span>
          </button>
        </div>
      )}
    </div>
  );
}
