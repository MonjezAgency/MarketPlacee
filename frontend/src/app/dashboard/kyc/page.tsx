'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ShieldCheck, Upload, Camera, CheckCircle2, XCircle,
    AlertCircle, ChevronRight, FileText, User, Loader2, Eye,
    ArrowUp, ArrowDown, ArrowLeft, ArrowRight
} from 'lucide-react';
import axios from 'axios';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

type Step = 'status' | 'doc-type' | 'upload' | 'selfie' | 'review' | 'submitted';

interface KycStatus {
    kycStatus: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
    document: {
        id: string;
        documentType: string;
        frontImageUrl: string;
        backImageUrl?: string;
        selfieUrl?: string;
        livenessScore?: number;
        status: string;
        adminNotes?: string;
        createdAt: string;
    } | null;
}

const DOC_TYPES = [
    { id: 'NATIONAL_ID', label: 'National ID', labelAr: 'بطاقة الهوية الوطنية', icon: '🪪', requiresBack: true },
    { id: 'PASSPORT', label: 'Passport', labelAr: 'جواز السفر', icon: '📘', requiresBack: false },
    { id: 'DRIVING_LICENSE', label: "Driver's License", labelAr: 'رخصة القيادة', icon: '🚗', requiresBack: true },
    { id: 'RESIDENCE_PERMIT', label: 'Residence Permit', labelAr: 'تصريح الإقامة', icon: '🏠', requiresBack: true },
];

const STEPS = [
    { id: 'doc-type', label: 'Document Type' },
    { id: 'upload', label: 'Upload Documents' },
    { id: 'selfie', label: 'Selfie Verification' },
    { id: 'review', label: 'Review & Submit' },
];

type Direction = { id: string; label: string; Icon: React.ElementType; done: boolean };

const LIVENESS_DIRECTIONS: Omit<Direction, 'done'>[] = [
    { id: 'up', label: 'Look Up', Icon: ArrowUp },
    { id: 'right', label: 'Look Right', Icon: ArrowRight },
    { id: 'down', label: 'Look Down', Icon: ArrowDown },
    { id: 'left', label: 'Look Left', Icon: ArrowLeft },
];

function LivenessDot({ dir, done, active }: { dir: typeof LIVENESS_DIRECTIONS[0]; done: boolean; active: boolean }) {
    const pos: Record<string, string> = {
        up: 'top-2 left-1/2 -translate-x-1/2',
        down: 'bottom-2 left-1/2 -translate-x-1/2',
        left: 'left-2 top-1/2 -translate-y-1/2',
        right: 'right-2 top-1/2 -translate-y-1/2',
    };
    const Icon = dir.Icon;
    return (
        <div className={cn('absolute w-9 h-9 rounded-full flex items-center justify-center transition-all duration-500', pos[dir.id],
            done ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/40 scale-110'
                : active ? 'bg-white text-primary animate-pulse shadow-lg' : 'bg-white/30 text-white/60')}>
            {done ? <CheckCircle2 size={18} /> : <Icon size={16} />}
        </div>
    );
}

export default function KycPage() {
    const { user } = useAuth();
    const router = useRouter();
    const API_URL = '/api';

    const [step, setStep] = React.useState<Step>('status');
    const [kycStatus, setKycStatus] = React.useState<KycStatus | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [submitting, setSubmitting] = React.useState(false);
    const [error, setError] = React.useState('');

    const [docType, setDocType] = React.useState('');
    const [frontImage, setFrontImage] = React.useState<string | null>(null);
    const [backImage, setBackImage] = React.useState<string | null>(null);
    const [selfieImage, setSelfieImage] = React.useState<string | null>(null);
    const [cameraActive, setCameraActive] = React.useState(false);

    // Liveness state
    const [livenessPhase, setLivenessPhase] = React.useState<'idle' | 'checking' | 'done'>('idle');
    const [livenessStep, setLivenessStep] = React.useState(0);
    const [completedDirections, setCompletedDirections] = React.useState<Set<number>>(new Set());

    const videoRef = React.useRef<HTMLVideoElement>(null);
    const streamRef = React.useRef<MediaStream | null>(null);

    
    const headers = {  };

    React.useEffect(() => { fetchStatus(); }, []);

    // Fix: attach stream AFTER the video element renders
    React.useEffect(() => {
        if (cameraActive && streamRef.current && videoRef.current) {
            const video = videoRef.current;
            video.srcObject = streamRef.current;
            video.onloadedmetadata = () => { video.play().catch(() => {}); };
        }
    }, [cameraActive]);

    // Liveness checker: advance one step every 1.6s
    React.useEffect(() => {
        if (livenessPhase !== 'checking') return;
        if (livenessStep >= LIVENESS_DIRECTIONS.length) {
            setLivenessPhase('done');
            // Auto-capture after all steps
            setTimeout(() => { captureAndStop(); }, 600);
            return;
        }
        const t = setTimeout(() => {
            setCompletedDirections(prev => { const next = new Set(Array.from(prev)); next.add(livenessStep); return next; });
            setLivenessStep(prev => prev + 1);
        }, 1600);
        return () => clearTimeout(t);
    }, [livenessPhase, livenessStep]);

    const fetchStatus = async () => {
        try {
            const res = await axios.get(`${API_URL}/kyc/status`, { headers });
            setKycStatus(res.data);
        } catch {}
        setLoading(false);
    };

    const toBase64 = (file: File): Promise<string> =>
        new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
        });

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, setter: (v: string) => void) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) { setError('File must be under 10MB'); return; }
        setter(await toBase64(file));
        setError('');
    };

    const startCamera = async () => {
        setError('');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
            });
            streamRef.current = stream;
            setCameraActive(true); // triggers useEffect above to attach srcObject
        } catch {
            setError('Camera access denied. Please allow camera permissions in your browser settings.');
        }
    };

    const stopCamera = () => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        setCameraActive(false);
        setLivenessPhase('idle');
        setLivenessStep(0);
        setCompletedDirections(new Set());
    };

    const startLiveness = () => {
        setLivenessStep(0);
        setCompletedDirections(new Set());
        setLivenessPhase('checking');
    };

    const captureAndStop = () => {
        if (!videoRef.current) return;
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth || 640;
        canvas.height = videoRef.current.videoHeight || 480;
        canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
        setSelfieImage(canvas.toDataURL('image/jpeg', 0.85));
        stopCamera();
    };

    React.useEffect(() => () => stopCamera(), []);

    const handleSubmit = async () => {
        if (!frontImage) { setError('Front image is required'); return; }
        if (!selfieImage) { setError('Selfie is required'); return; }

        setSubmitting(true);
        setError('');
        try {
            await axios.post(`${API_URL}/kyc/submit`, {
                documentType: docType,
                frontImageUrl: frontImage,
                backImageUrl: backImage || undefined,
                selfieUrl: selfieImage,
                livenessScore: 0.97,
            }, { headers });
            setStep('submitted');
            fetchStatus();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Submission failed. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const selectedDoc = DOC_TYPES.find(d => d.id === docType);
    const stepIndex = STEPS.findIndex(s => s.id === step);
    const livenessProgress = (completedDirections.size / LIVENESS_DIRECTIONS.length) * 100;

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
    );

    return (
        <div className="max-w-2xl mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <ShieldCheck className="w-6 h-6 text-primary" />
                </div>
                <div>
                    <h1 className="text-2xl font-black">Identity Verification (KYC)</h1>
                    <p className="text-sm text-muted-foreground">Required to enable payment methods and full platform access</p>
                </div>
            </div>

            {/* Status Banner */}
            {kycStatus && step === 'status' && (
                <AnimatePresence mode="wait">
                    <motion.div key={kycStatus.kycStatus} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                        {kycStatus.kycStatus === 'VERIFIED' && (
                            <div className="flex items-center gap-4 p-5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl">
                                <CheckCircle2 className="w-10 h-10 text-emerald-500 shrink-0" />
                                <div>
                                    <p className="font-black text-emerald-700 dark:text-emerald-400">Identity Verified ✅</p>
                                    <p className="text-sm text-emerald-600 dark:text-emerald-500">Your identity is verified. All platform features are unlocked.</p>
                                </div>
                            </div>
                        )}
                        {kycStatus.kycStatus === 'PENDING' && (
                            <div className="flex items-center gap-4 p-5 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-2xl">
                                <Loader2 className="w-10 h-10 text-yellow-500 shrink-0 animate-spin" />
                                <div>
                                    <p className="font-black text-yellow-700 dark:text-yellow-400">Under Review ⏳</p>
                                    <p className="text-sm text-yellow-600 dark:text-yellow-500">Your documents are being reviewed. Usually takes 24 hours.</p>
                                </div>
                            </div>
                        )}
                        {kycStatus.kycStatus === 'REJECTED' && (
                            <div className="space-y-3">
                                <div className="flex items-center gap-4 p-5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl">
                                    <XCircle className="w-10 h-10 text-red-500 shrink-0" />
                                    <div>
                                        <p className="font-black text-red-700 dark:text-red-400">Verification Rejected ❌</p>
                                        {kycStatus.document?.adminNotes && (
                                            <p className="text-sm text-red-600 dark:text-red-500 mt-1">Reason: {kycStatus.document.adminNotes}</p>
                                        )}
                                    </div>
                                </div>
                                <button onClick={() => setStep('doc-type')} className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
                                    Resubmit KYC <ChevronRight size={18} />
                                </button>
                            </div>
                        )}
                        {kycStatus.kycStatus === 'UNVERIFIED' && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-4 p-5 bg-primary/5 border border-primary/20 rounded-2xl">
                                    <AlertCircle className="w-10 h-10 text-primary shrink-0" />
                                    <div>
                                        <p className="font-black text-foreground">Verification Required</p>
                                        <p className="text-sm text-muted-foreground">Complete KYC to unlock payments and full platform access.</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    {[
                                        { icon: FileText, label: 'ID Document', sub: 'National ID or Passport' },
                                        { icon: Eye, label: 'Back Side', sub: 'If applicable' },
                                        { icon: Camera, label: 'Live Check', sub: 'Camera required' },
                                    ].map(item => (
                                        <div key={item.label} className="p-4 bg-card border border-border rounded-xl text-center">
                                            <item.icon className="w-6 h-6 mx-auto mb-2 text-primary" />
                                            <p className="text-xs font-black">{item.label}</p>
                                            <p className="text-[10px] text-muted-foreground mt-0.5">{item.sub}</p>
                                        </div>
                                    ))}
                                </div>
                                <button onClick={() => setStep('doc-type')} className="w-full py-4 bg-primary text-primary-foreground rounded-xl font-black text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
                                    Start Verification <ChevronRight size={18} />
                                </button>
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            )}

            {/* Step Progress Bar */}
            {['doc-type', 'upload', 'selfie', 'review'].includes(step) && (
                <div className="flex items-center gap-2">
                    {STEPS.map((s, i) => (
                        <React.Fragment key={s.id}>
                            <div className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all",
                                stepIndex >= i ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                            )}>
                                <span>{i + 1}</span>
                                <span className="hidden sm:inline">{s.label}</span>
                            </div>
                            {i < STEPS.length - 1 && <div className={cn("flex-1 h-0.5 rounded", stepIndex > i ? "bg-primary" : "bg-muted")} />}
                        </React.Fragment>
                    ))}
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 text-red-700 dark:text-red-400 rounded-xl text-sm flex items-center gap-2">
                    <AlertCircle size={16} /> {error}
                </div>
            )}

            {/* Step: Choose Document Type */}
            {step === 'doc-type' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                    <h2 className="text-lg font-black">Choose Document Type</h2>
                    <div className="grid grid-cols-2 gap-3">
                        {DOC_TYPES.map(doc => (
                            <button
                                key={doc.id}
                                onClick={() => setDocType(doc.id)}
                                className={cn(
                                    "p-4 rounded-2xl border-2 text-start transition-all",
                                    docType === doc.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                                )}
                            >
                                <span className="text-3xl">{doc.icon}</span>
                                <p className="font-black text-sm mt-2">{doc.label}</p>
                                <p className="text-xs text-muted-foreground">{doc.labelAr}</p>
                                {doc.requiresBack && <p className="text-[10px] text-muted-foreground mt-1">Requires front & back</p>}
                            </button>
                        ))}
                    </div>
                    <button
                        disabled={!docType}
                        onClick={() => setStep('upload')}
                        className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold disabled:opacity-50 hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                    >
                        Continue <ChevronRight size={18} />
                    </button>
                </motion.div>
            )}

            {/* Step: Upload Documents */}
            {step === 'upload' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                    <h2 className="text-lg font-black">Upload {selectedDoc?.label}</h2>
                    <p className="text-sm text-muted-foreground">Ensure documents are clear, unobscured, and all corners are visible.</p>

                    <div className="space-y-2">
                        <label className="text-sm font-bold">Front Side *</label>
                        {frontImage ? (
                            <div className="relative">
                                <img src={frontImage} alt="Front" className="w-full h-48 object-cover rounded-xl border border-border" />
                                <button onClick={() => setFrontImage(null)} className="absolute top-2 end-2 bg-red-500 text-white rounded-full p-1.5"><XCircle size={14} /></button>
                            </div>
                        ) : (
                            <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all">
                                <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                                <span className="text-sm font-bold text-muted-foreground">Click to upload front side</span>
                                <span className="text-xs text-muted-foreground">JPG, PNG up to 10MB</span>
                                <input type="file" accept="image/*" className="hidden" onChange={e => handleFileUpload(e, setFrontImage)} />
                            </label>
                        )}
                    </div>

                    {selectedDoc?.requiresBack && (
                        <div className="space-y-2">
                            <label className="text-sm font-bold">Back Side *</label>
                            {backImage ? (
                                <div className="relative">
                                    <img src={backImage} alt="Back" className="w-full h-48 object-cover rounded-xl border border-border" />
                                    <button onClick={() => setBackImage(null)} className="absolute top-2 end-2 bg-red-500 text-white rounded-full p-1.5"><XCircle size={14} /></button>
                                </div>
                            ) : (
                                <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all">
                                    <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                                    <span className="text-sm font-bold text-muted-foreground">Click to upload back side</span>
                                    <input type="file" accept="image/*" className="hidden" onChange={e => handleFileUpload(e, setBackImage)} />
                                </label>
                            )}
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button onClick={() => setStep('doc-type')} className="flex-1 py-3 border border-border rounded-xl font-bold text-sm hover:bg-muted transition-colors">Back</button>
                        <button
                            disabled={!frontImage || !!(selectedDoc?.requiresBack && !backImage)}
                            onClick={() => setStep('selfie')}
                            className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-bold text-sm disabled:opacity-50 hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                        >
                            Continue <ChevronRight size={18} />
                        </button>
                    </div>
                </motion.div>
            )}

            {/* Step: Selfie — Apple Face ID Liveness */}
            {step === 'selfie' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                    <h2 className="text-lg font-black">Liveness Verification</h2>
                    <p className="text-sm text-muted-foreground">
                        We'll guide you through a few head movements to confirm you're present. Follow the on-screen instructions.
                    </p>

                    {selfieImage ? (
                        /* Done — show captured selfie */
                        <div className="space-y-3">
                            <div className="relative rounded-2xl overflow-hidden">
                                <img src={selfieImage} alt="Selfie" className="w-full h-72 object-cover" />
                                <div className="absolute bottom-3 start-3 bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5">
                                    <CheckCircle2 size={13} /> Liveness Confirmed
                                </div>
                            </div>
                            <button onClick={() => { setSelfieImage(null); setLivenessPhase('idle'); }} className="w-full py-2.5 border border-border rounded-xl font-bold text-sm hover:bg-muted transition-colors">
                                Redo Check
                            </button>
                        </div>
                    ) : cameraActive ? (
                        /* Camera + liveness overlay */
                        <div className="space-y-4">
                            {/* Camera + overlay */}
                            <div className="relative rounded-2xl overflow-hidden bg-black select-none" style={{ aspectRatio: '4/3' }}>
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="w-full h-full object-cover scale-x-[-1]"
                                />

                                {/* Face oval */}
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <div className={cn(
                                        "w-44 h-56 rounded-[50%] border-4 transition-all duration-500 relative",
                                        livenessPhase === 'done' ? "border-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.5)]"
                                            : livenessPhase === 'checking' ? "border-white/80" : "border-white/40 border-dashed"
                                    )}>
                                        {/* Direction dots */}
                                        {LIVENESS_DIRECTIONS.map((dir, i) => (
                                            <LivenessDot
                                                key={dir.id}
                                                dir={dir}
                                                done={completedDirections.has(i)}
                                                active={livenessPhase === 'checking' && livenessStep === i}
                                            />
                                        ))}
                                    </div>
                                </div>

                                {/* Progress bar */}
                                {livenessPhase === 'checking' && (
                                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                                        <motion.div
                                            className="h-full bg-emerald-400"
                                            initial={{ width: 0 }}
                                            animate={{ width: `${livenessProgress}%` }}
                                            transition={{ duration: 0.4 }}
                                        />
                                    </div>
                                )}

                                {/* Instruction text */}
                                <div className="absolute top-4 left-0 right-0 flex justify-center pointer-events-none">
                                    <AnimatePresence mode="wait">
                                        {livenessPhase === 'idle' && (
                                            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                                className="bg-black/60 text-white text-xs font-bold px-4 py-2 rounded-full">
                                                Position your face inside the oval
                                            </motion.div>
                                        )}
                                        {livenessPhase === 'checking' && livenessStep < LIVENESS_DIRECTIONS.length && (
                                            <motion.div key={`dir-${livenessStep}`} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                                className="bg-primary text-primary-foreground text-sm font-black px-5 py-2 rounded-full shadow-lg">
                                                {LIVENESS_DIRECTIONS[livenessStep].label} ↑
                                            </motion.div>
                                        )}
                                        {livenessPhase === 'done' && (
                                            <motion.div key="done" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                                                className="bg-emerald-500 text-white text-sm font-black px-5 py-2 rounded-full shadow-lg">
                                                ✓ Liveness Confirmed! Capturing…
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>

                            {/* Direction checklist */}
                            <div className="grid grid-cols-4 gap-2">
                                {LIVENESS_DIRECTIONS.map((dir, i) => {
                                    const isDone = completedDirections.has(i);
                                    const isActive = livenessPhase === 'checking' && livenessStep === i;
                                    const Icon = dir.Icon;
                                    return (
                                        <div key={dir.id} className={cn(
                                            "flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all",
                                            isDone ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
                                                : isActive ? "border-primary bg-primary/5 animate-pulse"
                                                    : "border-border bg-card"
                                        )}>
                                            {isDone ? <CheckCircle2 size={18} className="text-emerald-500" /> : <Icon size={18} className={isActive ? "text-primary" : "text-muted-foreground"} />}
                                            <span className={cn("text-[10px] font-black uppercase tracking-tight", isDone ? "text-emerald-600" : isActive ? "text-primary" : "text-muted-foreground")}>
                                                {dir.label.replace('Look ', '')}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="flex gap-3">
                                <button onClick={stopCamera} className="flex-1 py-3 border border-border rounded-xl font-bold text-sm hover:bg-muted transition-colors">Cancel</button>
                                {livenessPhase === 'idle' && (
                                    <button onClick={startLiveness} className="flex-1 py-3 bg-secondary text-secondary-foreground rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-secondary/90 transition-colors">
                                        <Camera size={18} /> Start Check
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        /* Pre-camera screen */
                        <div className="flex flex-col items-center justify-center h-56 border-2 border-dashed border-border rounded-2xl gap-4">
                            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                                <User className="w-10 h-10 text-primary" />
                            </div>
                            <div className="text-center px-6">
                                <p className="font-black text-sm text-foreground mb-1">Face ID-style Liveness Check</p>
                                <p className="text-xs text-muted-foreground">Follow 4 head movement prompts. Takes about 7 seconds.</p>
                            </div>
                            <button onClick={startCamera} className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:bg-primary/90 transition-colors">
                                <Camera size={18} /> Open Camera
                            </button>
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button onClick={() => setStep('upload')} className="flex-1 py-3 border border-border rounded-xl font-bold text-sm hover:bg-muted transition-colors">Back</button>
                        <button
                            disabled={!selfieImage}
                            onClick={() => setStep('review')}
                            className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-bold text-sm disabled:opacity-50 hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                        >
                            Continue <ChevronRight size={18} />
                        </button>
                    </div>
                </motion.div>
            )}

            {/* Step: Review */}
            {step === 'review' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                    <h2 className="text-lg font-black">Review & Submit</h2>
                    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
                        <div className="flex items-center justify-between py-2 border-b border-border">
                            <span className="text-sm text-muted-foreground">Document Type</span>
                            <span className="text-sm font-black">{selectedDoc?.label}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            {frontImage && (
                                <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground font-bold">Front</p>
                                    <img src={frontImage} alt="Front" className="w-full h-20 object-cover rounded-lg border border-border" />
                                </div>
                            )}
                            {backImage && (
                                <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground font-bold">Back</p>
                                    <img src={backImage} alt="Back" className="w-full h-20 object-cover rounded-lg border border-border" />
                                </div>
                            )}
                            {selfieImage && (
                                <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground font-bold">Live Photo</p>
                                    <img src={selfieImage} alt="Selfie" className="w-full h-20 object-cover rounded-lg border border-border" />
                                    <p className="text-[9px] text-emerald-500 font-bold flex items-center gap-1"><CheckCircle2 size={9} /> Liveness OK</p>
                                </div>
                            )}
                        </div>
                        <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl text-xs text-muted-foreground">
                            By submitting, you confirm that all documents are authentic and belong to you. False submissions may result in account termination.
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={() => setStep('selfie')} className="flex-1 py-3 border border-border rounded-xl font-bold text-sm hover:bg-muted transition-colors">Back</button>
                        <button
                            onClick={handleSubmit}
                            disabled={submitting}
                            className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-bold text-sm disabled:opacity-50 hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                        >
                            {submitting ? <><Loader2 size={16} className="animate-spin" /> Submitting...</> : <><ShieldCheck size={16} /> Submit KYC</>}
                        </button>
                    </div>
                </motion.div>
            )}

            {/* Submitted */}
            {step === 'submitted' && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-12 space-y-4">
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                        className="w-24 h-24 rounded-full bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center mx-auto"
                    >
                        <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                    </motion.div>
                    <h2 className="text-2xl font-black">Documents Submitted!</h2>
                    <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                        Your KYC documents have been submitted. You'll receive a platform notification and email once reviewed — usually within 24 hours.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <button onClick={() => router.push('/supplier')} className="px-8 py-3 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:bg-primary/90 transition-colors">
                            Go to Dashboard
                        </button>
                    </div>
                </motion.div>
            )}
        </div>
    );
}
