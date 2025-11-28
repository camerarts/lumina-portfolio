
import React, { useEffect, useState, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { Photo, Theme } from '../types';
import { PhotoDetail } from './PhotoDetail';

interface PhotoModalProps {
  photo: Photo | null;
  onClose: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
  theme: Theme;
  slideDirection: 'left' | 'right';
  isAdmin?: boolean;
  onUpdatePhoto?: (photo: Photo) => void;
}

export const PhotoModal: React.FC<PhotoModalProps> = ({ 
  photo, 
  onClose, 
  onNext, 
  onPrev, 
  hasNext, 
  hasPrev, 
  theme,
  slideDirection,
  isAdmin,
  onUpdatePhoto
}) => {
  const isDark = theme === 'dark';
  
  // State to manage transitions
  const [activePhoto, setActivePhoto] = useState<Photo | null>(photo);
  const [exitingPhoto, setExitingPhoto] = useState<Photo | null>(null);
  const [animDirection, setAnimDirection] = useState<'left' | 'right'>(slideDirection);
  const [isFirstOpen, setIsFirstOpen] = useState(true);

  // Drag/Swipe State
  const dragStartX = useRef<number | null>(null);
  const isDragging = useRef(false);

  // Sync prop changes to state for animations
  useEffect(() => {
    if (photo && activePhoto && photo.id !== activePhoto.id) {
      setExitingPhoto(activePhoto);
      setActivePhoto(photo);
      setAnimDirection(slideDirection);
      setIsFirstOpen(false); // Navigation occurred, so disable fade-in fallback
    } else if (photo && !activePhoto) {
      // First open
      setActivePhoto(photo);
      setExitingPhoto(null);
      setIsFirstOpen(true);
    } else if (photo && activePhoto && photo.id === activePhoto.id && photo !== activePhoto) {
      // Deep update (e.g. rating change) without transition
      setActivePhoto(photo);
    }
  }, [photo, slideDirection, activePhoto]);

  // Handle Close - Reset states
  useEffect(() => {
    if (!photo) {
      setActivePhoto(null);
      setExitingPhoto(null);
      setIsFirstOpen(true);
    }
  }, [photo]);

  // Lock body scroll
  useEffect(() => {
    if (photo) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!photo) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && onNext) onNext();
      if (e.key === 'ArrowLeft' && onPrev) onPrev();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [photo, onClose, onNext, onPrev]);

  // --- Input Handlers (Mouse & Touch) ---
  
  const handleStart = (clientX: number) => {
    dragStartX.current = clientX;
    isDragging.current = true;
  };

  const handleEnd = (clientX: number) => {
    if (!isDragging.current || dragStartX.current === null) return;
    
    const deltaX = clientX - dragStartX.current;
    const threshold = 50; // px to trigger swipe

    if (deltaX > threshold && hasPrev) {
      onPrev?.();
    } else if (deltaX < -threshold && hasNext) {
      onNext?.();
    }

    isDragging.current = false;
    dragStartX.current = null;
  };

  // Mouse
  const handleMouseDown = (e: React.MouseEvent) => handleStart(e.clientX);
  const handleMouseUp = (e: React.MouseEvent) => handleEnd(e.clientX);
  const handleMouseLeave = () => { isDragging.current = false; dragStartX.current = null; };

  // Touch
  const handleTouchStart = (e: React.TouchEvent) => handleStart(e.touches[0].clientX);
  const handleTouchEnd = (e: React.TouchEvent) => handleEnd(e.changedTouches[0].clientX);

  if (!photo || !activePhoto) return null;

  const arrowClass = `
    absolute top-1/2 -translate-y-1/2 z-[120] p-4 
    transition-all duration-300
    opacity-50 hover:opacity-100 hover:scale-110 active:scale-95
    cursor-pointer outline-none select-none
    ${isDark ? 'text-white' : 'text-black'}
  `;

  return (
    <div 
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center animate-fade-in overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* 1. Solid Background (Grey for Light, Dark for Dark) matching reference */}
      <div className={`absolute inset-0 z-0 transition-colors duration-500
        ${isDark ? 'bg-[#1a1a1a]' : 'bg-[#E5E5E5]'}
      `} />

      {/* Background click to close */}
      <div className="absolute inset-0 z-10" onClick={onClose} />

      {/* Top Right Controls */}
      <div className="absolute top-6 right-6 z-[120] flex items-center gap-2">
        <button 
          className={`p-3 rounded-full transition-all hover:scale-110 
            ${isDark ? 'bg-black/20 text-white hover:bg-black/40' : 'bg-white/20 text-black hover:bg-white/40'}
            backdrop-blur-md shadow-lg
          `}
        >
          <MoreHorizontal size={24} />
        </button>
        <button 
          onClick={onClose}
          className={`p-3 rounded-full transition-all hover:rotate-90 
            ${isDark ? 'bg-black/20 text-white hover:bg-black/40' : 'bg-white/20 text-black hover:bg-white/40'}
            backdrop-blur-md shadow-lg
          `}
        >
          <X size={28} strokeWidth={1} />
        </button>
      </div>

      {/* Navigation Arrows - Flat Design */}
      {hasPrev && (
        <div
          onClick={(e) => { e.stopPropagation(); onPrev?.(); }}
          className={`${arrowClass} left-2 md:left-8`}
          title="Previous"
        >
          <ChevronLeft size={48} strokeWidth={0.7} />
        </div>
      )}

      {hasNext && (
        <div
          onClick={(e) => { e.stopPropagation(); onNext?.(); }}
          className={`${arrowClass} right-2 md:right-8`}
          title="Next"
        >
          <ChevronRight size={48} strokeWidth={0.7} />
        </div>
      )}

      {/* Main Content Area */}
      <div 
        className="relative z-[110] w-full h-full flex flex-col pointer-events-none"
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        
        {/* Image Display Area (Relative for absolute images) */}
        <div className="flex-1 w-full relative overflow-hidden perspective-[2000px] pointer-events-auto cursor-grab active:cursor-grabbing">
          
          {/* Exiting Photo (Old) */}
          {exitingPhoto && (
            <div 
              key={`exit-${exitingPhoto.id}`}
              className={`absolute inset-0 flex items-center justify-center p-0 md:p-2 will-change-transform
                ${animDirection === 'right' ? 'animate-slide-out-left' : 'animate-slide-out-right'}
              `}
              style={{ zIndex: 1 }}
              onAnimationEnd={() => setExitingPhoto(null)}
            >
              <img 
                src={exitingPhoto.url} 
                alt={exitingPhoto.title} 
                className="max-w-full max-h-full object-contain shadow-[0_20px_50px_-12px_rgba(0,0,0,0.25)] backface-hidden"
                draggable={false}
                style={{ 
                  transform: 'translate3d(0,0,0)',
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden' 
                }}
              />
            </div>
          )}

          {/* Active Photo (New) */}
          <div 
            key={`active-${activePhoto.id}`}
            className={`absolute inset-0 flex items-center justify-center p-0 md:p-2 will-change-transform
              ${exitingPhoto // Only animate if there is an exiting photo (navigation)
                  ? (animDirection === 'right' ? 'animate-slide-in-right' : 'animate-slide-in-left')
                  : (isFirstOpen ? 'animate-fade-in' : '') 
              }
            `}
            style={{ zIndex: 2 }}
          >
             <img 
              src={activePhoto.url} 
              alt={activePhoto.title} 
              className="max-w-full max-h-full object-contain pointer-events-auto shadow-[0_20px_50px_-12px_rgba(0,0,0,0.25)] select-none hover:scale-[1.01] transition-transform duration-500 ease-out backface-hidden"
              draggable={false}
              loading="eager"
              style={{ 
                transform: 'translate3d(0,0,0)',
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden' 
              }}
            />
          </div>
        </div>
        
        {/* Bottom Detail Strip - Transparent & Floating */}
        <div className="w-full pointer-events-auto pb-8 pt-4">
          <div className="max-w-7xl mx-auto px-6">
             <PhotoDetail 
               exif={activePhoto.exif} 
               rating={activePhoto.rating} 
               theme={theme} 
               isAdmin={isAdmin}
               onRate={(newRating) => onUpdatePhoto?.({ ...activePhoto, rating: newRating })}
             />
          </div>
        </div>
      </div>
    </div>
  );
};
