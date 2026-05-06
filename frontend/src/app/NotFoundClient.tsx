'use client';

import Link from 'next/link';
import { AlertCircle, ArrowLeft, Home } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function NotFound() {
    return (
        <div className="min-h-[80vh] flex items-center justify-center p-4">
            <div className="max-w-xl w-full text-center space-y-8 animate-fade-in-up">
                <div className="relative inline-block">
                    <h1 className="text-[12rem] font-black leading-none text-primary/5 select-none">404</h1>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <AlertCircle className="w-24 h-24 text-primary animate-bounce-in" />
                    </div>
                </div>

                <div className="space-y-4">
                    <h2 className="text-5xl font-poppins font-black tracking-tight">Lost in the sauce?</h2>
                    <p className="text-xl text-foreground/60 leading-relaxed mx-auto max-w-md">
                        The page you're looking for was either drunk and wandered off, or never existed in this wholesale catalog.
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6">
                    <Button variant="outline" size="lg" className="rounded-full w-full sm:w-auto h-14 px-10 font-black gap-2" onClick={() => window.history.back()}>
                        <ArrowLeft className="w-5 h-5" />
                        Go Back
                    </Button>
                    <Link href="/">
                        <Button size="lg" className="rounded-full w-full sm:w-auto h-14 px-10 font-black gap-2 shadow-xl shadow-primary/20">
                            <Home className="w-5 h-5" />
                            Return Home
                        </Button>
                    </Link>
                </div>
            </div>
        </div>
    );
}
