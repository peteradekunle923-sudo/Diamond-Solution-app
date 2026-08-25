import React, { useState, useRef } from 'react';
import { Upload, X, Image as ImageIcon, Link as LinkIcon, Loader2, Check } from 'lucide-react';
import { compressImage } from '../lib/imageUtils';
import { cn } from '../lib/utils';

interface ImageUploaderProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  placeholderText?: string;
  className?: string;
  aspectRatio?: 'square' | 'video' | 'wide';
}

export function ImageUploader({
  value,
  onChange,
  label = 'Upload Picture',
  placeholderText = 'Click to upload or drag & drop (JPG, PNG, WebP)',
  className = '',
  aspectRatio = 'square'
}: ImageUploaderProps) {
  const [isCompressing, setIsCompressing] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file (JPG, PNG, WebP).');
      return;
    }

    try {
      setIsCompressing(true);
      const compressedBase64 = await compressImage(file, 480, 480, 0.78);
      onChange(compressedBase64);
    } catch (err) {
      console.error('Failed to process image:', err);
      alert('Failed to process image file. Please try a different image.');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleUrlSubmit = () => {
    if (urlInput.trim()) {
      onChange(urlInput.trim());
      setUrlInput('');
      setShowUrlInput(false);
    }
  };

  const aspectClass = aspectRatio === 'video' ? 'aspect-video' : aspectRatio === 'wide' ? 'aspect-[2/1]' : 'aspect-square';

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">
            {label}
          </label>
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="text-[10px] font-bold text-red-500 hover:text-red-700 flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3 h-3" /> Remove Picture
            </button>
          )}
        </div>
      )}

      {value ? (
        <div className="relative group rounded-2xl overflow-hidden border-2 border-[#D8E3FF] bg-[#EEF3FF]/40 p-2">
          <div className={cn("relative w-full rounded-xl overflow-hidden bg-white shadow-xs max-h-48 flex items-center justify-center", aspectClass)}>
            <img
              src={value}
              alt="Preview"
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
              onError={(e) => {
                // If broken link, inform
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <div className="absolute inset-0 bg-[#0B1E3D]/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="bg-white text-[#0B1E3D] px-3 py-1.5 rounded-xl font-bold text-xs shadow-lg hover:bg-[#EEF3FF] transition-all flex items-center gap-1 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" /> Replace
              </button>
              <button
                type="button"
                onClick={() => onChange('')}
                className="bg-red-500 text-white px-3 py-1.5 rounded-xl font-bold text-xs shadow-lg hover:bg-red-600 transition-all flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" /> Delete
              </button>
            </div>
          </div>
          <div className="text-[10px] font-bold text-slate-400 text-center mt-1.5 flex items-center justify-center gap-1">
            <Check className="w-3 h-3 text-emerald-500" /> Picture Loaded Successfully
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "relative border-2 border-dashed rounded-2xl p-5 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-2.5",
            isDragOver
              ? "border-[#2563EB] bg-[#EEF3FF]"
              : "border-[#D8E3FF] bg-[#EEF3FF]/40 hover:bg-[#EEF3FF] hover:border-[#2563EB]/50"
          )}
        >
          {isCompressing ? (
            <div className="py-4 flex flex-col items-center gap-2">
              <Loader2 className="w-7 h-7 text-[#2563EB] animate-spin" />
              <span className="text-xs font-bold text-[#2563EB]">Optimizing image...</span>
            </div>
          ) : (
            <>
              <div className="w-12 h-12 rounded-2xl bg-white border border-[#D8E3FF] flex items-center justify-center text-[#2563EB] shadow-xs">
                <ImageIcon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-700">{placeholderText}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Optimized for fast dashboard display</p>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="bg-[#2563EB] text-white px-3.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-[#1d4ed8] shadow-xs cursor-pointer"
                >
                  Choose File
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowUrlInput(!showUrlInput);
                  }}
                  className="bg-white border border-[#D8E3FF] text-slate-700 px-3.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-slate-50 shadow-xs flex items-center gap-1 cursor-pointer"
                >
                  <LinkIcon className="w-3 h-3" /> Or Web URL
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {showUrlInput && !value && (
        <div className="p-3 bg-white border border-[#D8E3FF] rounded-xl space-y-2">
          <label className="text-[10px] font-bold text-slate-500 block">Paste Direct Image URL</label>
          <div className="flex gap-2">
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://images.unsplash.com/..."
              className="flex-1 bg-[#EEF3FF] border border-[#D8E3FF] rounded-lg px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-[#2563EB]"
            />
            <button
              type="button"
              onClick={handleUrlSubmit}
              disabled={!urlInput.trim()}
              className="bg-[#2563EB] text-white px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40 cursor-pointer"
            >
              Apply
            </button>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png, image/jpeg, image/webp, image/gif, image/svg+xml"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
          }
        }}
      />
    </div>
  );
}

export default ImageUploader;
