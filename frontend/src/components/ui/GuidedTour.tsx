'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, X, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Step {
    targetId: string;
    title: string;
    description: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
}

interface GuidedTourProps {
    steps: Step[];
    onComplete: () => void;
    onDismiss: () => void;
    show?: boolean;
}

export function GuidedTour({ steps, onComplete, onDismiss, show = true }: GuidedTourProps) {
    const [currentStep, setCurrentStep] = useState(0);
    const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onDismiss();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onDismiss]);

    useEffect(() => {
        if (!show || !isMounted) return;

        const updateRect = () => {
            const target = document.getElementById(steps[currentStep].targetId);
            if (target) {
                setTargetRect(target.getBoundingClientRect());
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        };

        updateRect();
        window.addEventListener('resize', updateRect);
        window.addEventListener('scroll', updateRect);
        
        // Polling for target existence (case of dynamic content)
        const interval = setInterval(updateRect, 500);

        return () => {
            window.removeEventListener('resize', updateRect);
            window.removeEventListener('scroll', updateRect);
            clearInterval(interval);
        };
    }, [currentStep, steps, show, isMounted]);

    if (!show || !isMounted || !targetRect) return null;

    const step = steps[currentStep];

    const next = () => {
        if (currentStep < steps.length - 1) {
            setCurrentStep(currentStep + 1);
        } else {
            onComplete();
        }
    };

    const prev = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] pointer-events-none">
            {/* Backdrop with Hole */}
            <div 
                className="absolute inset-0 bg-black/60 pointer-events-auto"
                style={{
                    clipPath: `polygon(
                        0% 0%, 0% 100%, 100% 100%, 100% 0%,
                        ${targetRect.left - 8}px 0%,
                        ${targetRect.left - 8}px ${targetRect.top - 8}px,
                        ${targetRect.right + 8}px ${targetRect.top - 8}px,
                        ${targetRect.right + 8}px ${targetRect.bottom + 8}px,
                        ${targetRect.left - 8}px ${targetRect.bottom + 8}px,
                        ${targetRect.left - 8}px 0%
                    )`
                }}
            />

            {/* Target Highlight Ring */}
            <motion.div
                layoutId="tour-highlight"
                initial={false}
                className="absolute border-2 border-[#14B8A6] rounded-xl shadow-[0_0_20px_rgba(20,184,166,0.5)]"
                style={{
                    top: targetRect.top - 8,
                    left: targetRect.left - 8,
                    width: targetRect.width + 16,
                    height: targetRect.height + 16,
                }}
            />

            {/* Tooltip Card */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentStep}
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute bg-white rounded-2xl shadow-2xl p-6 w-[320px] pointer-events-auto border border-[#E5E7EB]"
                    style={{
                        top: targetRect.bottom + 24,
                        left: Math.min(window.innerWidth - 344, Math.max(24, targetRect.left + (targetRect.width / 2) - 160)),
                    }}
                >
                    {/* Progress Bar */}
                    <div className="flex gap-1 mb-4">
                        {steps.map((_, i) => (
                            <div 
                                key={i} 
                                className={cn(
                                    "h-1 rounded-full flex-1 transition-all",
                                    i <= currentStep ? "bg-[#14B8A6]" : "bg-[#F1F5F9]"
                                )} 
                            />
                        ))}
                    </div>

                    <div className="flex items-start justify-between mb-2">
                        <h4 className="text-[16px] font-bold text-[#111827] flex items-center gap-2">
                            <Sparkles size={16} className="text-[#F59E0B]" />
                            {step.title}
                        </h4>
                        <button onClick={onDismiss} className="text-[#6B7280] hover:text-[#111827]">
                            <X size={18} />
                        </button>
                    </div>
                    
                    <p className="text-[13px] text-[#6B7280] leading-relaxed mb-6">
                        {step.description}
                    </p>

                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black text-[#94A3B8] uppercase tracking-widest">
                            Step {currentStep + 1} of {steps.length}
                        </span>
                        <div className="flex items-center gap-2">
                            {currentStep > 0 && (
                                <button 
                                    onClick={prev}
                                    className="h-9 px-3 rounded-lg border border-[#E5E7EB] text-[12px] font-bold hover:bg-[#F8FAFC] transition-all flex items-center gap-1"
                                >
                                    <ChevronLeft size={14} /> Back
                                </button>
                            )}
                            <button 
                                onClick={onDismiss}
                                className="h-9 px-3 text-[11px] font-bold text-[#94A3B8] hover:text-[#EF4444] uppercase tracking-wider transition-colors mr-1"
                            >
                                Skip Tour
                            </button>
                            <button 
                                onClick={next}
                                className="h-9 px-4 rounded-lg bg-[#14B8A6] text-white text-[12px] font-bold hover:bg-[#0D9488] transition-all flex items-center gap-1 shadow-lg shadow-[#14B8A6]/20"
                            >
                                {currentStep === steps.length - 1 ? 'Finish' : 'Next'} <ChevronRight size={14} />
                            </button>
                        </div>
                    </div>

                    {/* Arrow Pointer */}
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-t border-l border-[#E5E7EB] rotate-45" />
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
