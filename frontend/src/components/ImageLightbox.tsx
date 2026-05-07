'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
    images: string[];
    /** Index of the image to start on. -1 / null / undefined = closed. */
    startIndex: number | null;
    onClose: () => void;
    /** Optional alt text used for every image. */
    alt?: string;
}

/**
 * Full-screen image lightbox.
 *
 * - Click the backdrop or the X button to close.
 * - Arrow keys / on-screen arrows navigate when there are multiple images.
 * - Esc closes.
 * - Body scroll is locked while open (avoids the awkward dual-scrollbar
 *   issue when the page behind is long).
 */
export default function ImageLightbox({ images, startIndex, onClose, alt }: Props) {
    const isOpen = startIndex !== null && startIndex !== undefined && startIndex >= 0 && images.length > 0;
    const [index, setIndex] = React.useState(0);

    React.useEffect(() => {
        if (isOpen) setIndex(Math.min(startIndex!, images.length - 1));
    }, [isOpen, startIndex, images.length]);

    // Lock body scroll while open, restore on close/unmount
    React.useEffect(() => {
        if (!isOpen) return;
        const original = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = original; };
    }, [isOpen]);

    const next = React.useCallback(() => {
        setIndex(i => (i + 1) % images.length);
    }, [images.length]);

    const prev = React.useCallback(() => {
        setIndex(i => (i - 1 + images.length) % images.length);
    }, [images.length]);

    React.useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowRight') next();
            else if (e.key === 'ArrowLeft') prev();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen, onClose, next, prev]);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
                    onClick={onClose}
                >
                    {/* Close button */}
                    <button
                        onClick={(e) => { e.stopPropagation(); onClose(); }}
                        className="absolute top-4 right-4 sm:top-6 sm:right-6 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur text-white flex items-center justify-center transition-all z-10"
                        aria-label="Close"
                    >
                        <X size={22} />
                    </button>

                    {/* Image counter */}
                    {images.length > 1 && (
                        <div className="absolute top-4 left-4 sm:top-6 sm:left-6 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur text-white text-[12px] font-bold z-10">
                            {index + 1} / {images.length}
                        </div>
                    )}

                    {/* Prev arrow */}
                    {images.length > 1 && (
                        <button
                            onClick={(e) => { e.stopPropagation(); prev(); }}
                            className="absolute left-4 sm:left-8 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur text-white flex items-center justify-center transition-all z-10"
                            aria-label="Previous image"
                        >
                            <ChevronLeft size={26} />
                        </button>
                    )}

                    {/* Next arrow */}
                    {images.length > 1 && (
                        <button
                            onClick={(e) => { e.stopPropagation(); next(); }}
                            className="absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur text-white flex items-center justify-center transition-all z-10"
                            aria-label="Next image"
                        >
                            <ChevronRight size={26} />
                        </button>
                    )}

                    {/* Image */}
                    <motion.img
                        key={images[index]}
                        src={images[index]}
                        alt={alt || `Image ${index + 1}`}
                        referrerPolicy="no-referrer"
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.18 }}
                        className="max-w-full max-h-full object-contain rounded-xl"
                        onClick={(e) => e.stopPropagation()}
                    />

                    {/* Thumbnail strip */}
                    {images.length > 1 && (
                        <div className="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 flex gap-2 max-w-full overflow-x-auto px-4 py-2 bg-white/5 backdrop-blur rounded-2xl">
                            {images.map((src, i) => (
                                <button
                                    key={src + i}
                                    onClick={(e) => { e.stopPropagation(); setIndex(i); }}
                                    className={`shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                                        i === index ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'
                                    }`}
                                >
                                    <img src={src} alt="" referrerPolicy="no-referrer" className="w-full h-full object-contain bg-white/90" />
                                </button>
                            ))}
                        </div>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
}
