import React, { useState } from 'react';

interface CreditCardProps {
    cardNumber: string;
    cardHolder: string;
    expiryDate: string;
    csv: string;
    isFlipped?: boolean;
    variant?: 'blue' | 'black' | 'gold' | 'platinum';
}

const CreditCard: React.FC<CreditCardProps> = ({
    cardNumber = '0000 0000 0000 0000',
    cardHolder = 'YOUR NAME',
    expiryDate = 'MM/YY',
    csv = '000',
    isFlipped = false,
    variant = 'blue',
}) => {
    // Determine background based on variant
    const getBackground = () => {
        switch (variant) {
            case 'black': return 'bg-gradient-to-br from-gray-900 via-gray-800 to-black';
            case 'gold': return 'bg-gradient-to-br from-yellow-600 via-yellow-500 to-yellow-200';
            case 'platinum': return 'bg-gradient-to-br from-slate-400 via-slate-300 to-slate-100';
            default: return 'bg-gradient-to-br from-blue-900 via-blue-700 to-blue-500';
        }
    };

    return (
        <div className="relative w-80 h-48 perspective-1000 mx-auto">
            <div
                className={`relative w-full h-full transition-transform duration-700 transform-style-3d ${isFlipped ? 'rotate-y-180' : ''}`}
            >
                {/* Front Side */}
                <div className={`absolute w-full h-full rounded-2xl shadow-xl overflow-hidden backface-hidden ${getBackground()}`}>
                    {/* Glass Effect Overlay */}
                    <div className="absolute inset-0 bg-white/10 backdrop-blur-[1px]" />

                    {/* Chip */}
                    <div className="absolute top-6 start-6 w-12 h-9 bg-gradient-to-br from-yellow-200 to-yellow-500 rounded-md border border-yellow-600/30 flex items-center justify-center overflow-hidden">
                        <div className="w-full h-[1px] bg-black/10 absolute top-1/3" />
                        <div className="w-full h-[1px] bg-black/10 absolute bottom-1/3" />
                        <div className="h-full w-[1px] bg-black/10 absolute start-1/3" />
                        <div className="h-full w-[1px] bg-black/10 absolute end-1/3" />
                    </div>

                    {/* Contactless Icon */}
                    <div className="absolute top-6 end-6 text-white/80">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2C8.13 2 4.46 3.17 1.42 5.14C2.39 6.2 3.16 7.42 3.71 8.76C6.12 7.03 8.97 6.09 12 6.09C15.03 6.09 17.88 7.03 20.29 8.76C20.84 7.42 21.61 6.2 22.58 5.14C19.54 3.17 15.87 2 12 2ZM12 7.73C10.08 7.73 8.26 8.32 6.74 9.38C7.54 10.59 8.16 11.93 8.56 13.36C9.59 12.87 10.76 12.6 12 12.6C13.24 12.6 14.41 12.87 15.44 13.36C15.84 11.93 16.46 10.59 17.26 9.38C15.74 8.32 13.92 7.73 12 7.73ZM12 14.23C11.53 14.23 11.08 14.3 10.65 14.41C10.97 15.39 11.41 16.32 11.96 17.18C12.51 16.32 12.96 15.39 13.28 14.41C12.86 14.3 12.42 14.23 12 14.23ZM14.07 16.35C14.07 16.35 14.07 16.35 14.07 16.35C13.43 17.96 12.72 19.34 12 20.44C11.27 19.34 10.56 17.96 9.93 16.36C9.93 16.36 9.93 16.36 9.92 16.35C10.56 17.26 11.26 18.06 12 18.78C12.74 18.06 13.44 17.26 14.07 16.35Z" fill="currentColor" />
                        </svg>
                    </div>

                    {/* Logo (Visa) */}
                    <div className="absolute top-2 end-6 text-white font-bold italic text-2xl tracking-tighter opacity-90">
                        VISA
                    </div>

                    {/* Card Number */}
                    <div className="absolute top-[55%] start-0 w-full text-center px-4">
                        <div className="text-white font-mono text-xl tracking-[0.15em] drop-shadow-md">
                            {cardNumber}
                        </div>
                    </div>

                    {/* Bottom Info */}
                    <div className="absolute bottom-6 start-6 end-6 flex justify-between items-end text-white">
                        <div className="flex flex-col">
                            <div className="text-[10px] font-black tracking-widest text-white/40 uppercase">Ali FMCG Commercial</div>
                            <span className="font-medium tracking-wider text-sm">{cardHolder.toUpperCase()}</span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-[9px] uppercase tracking-widest opacity-80 mb-0.5">Expires</span>
                            <span className="font-mono text-sm">{expiryDate}</span>
                        </div>
                    </div>
                </div>

                {/* Back Side */}
                <div className={`absolute w-full h-full rounded-2xl shadow-xl overflow-hidden backface-hidden rotate-y-180 bg-gradient-to-br from-gray-800 to-gray-900`}>
                    {/* Magnetic Strip */}
                    <div className="absolute top-6 start-0 w-full h-10 bg-black" />

                    {/* Signature Strip & CVV */}
                    <div className="absolute top-24 start-4 end-4 h-9 bg-white flex items-center justify-end px-3">
                        <span className="font-mono text-black font-bold tracking-widest">{csv}</span>
                    </div>
                    <span className="absolute top-[88px] end-6 text-[9px] text-white/70">CVV</span>

                    {/* Hologram/Security */}
                    <div className="absolute bottom-6 end-6 w-12 h-12 opacity-50 flex items-center justify-center">
                        <div className="w-12 h-8 border border-white/20 rounded-full" />
                    </div>

                    {/* Contact Info */}
                    <div className="absolute bottom-4 start-4 end-16 text-[8px] text-gray-400 text-justify leading-tight">
                        This card is property of Ali FMCG Inc. Use subject to terms and conditions. If found, please return to any branch or call support.
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CreditCard;
