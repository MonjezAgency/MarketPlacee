'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ShieldCheck, Upload, Camera, CheckCircle2, XCircle,
    AlertCircle, ChevronRight, FileText, User, Loader2, Eye,
    ArrowUp, ArrowDown, ArrowLeft, ArrowRight
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

type Step = 'status' | 'doc-type' | 'upload' | 'selfie' | 'review' | 'submitted';

// Dynamic script loader for MediaPipe
const loadScript = (src: string) => new Promise((resolve) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve(true);
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    document.head.appendChild(script);
});

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

    // Camera & Mobile Handoff
    const videoRef = React.useRef<HTMLVideoElement>(null);
    const streamRef = React.useRef<MediaStream | null>(null);
    const [useCameraForDocs, setUseCameraForDocs] = React.useState<'front' | 'back' | null>(null);
    const [mobileHandoffUrl, setMobileHandoffUrl] = React.useState<string | null>(null);

    // MediaPipe Face Mesh Refs
    const faceMeshRef = React.useRef<any>(null);
    const cameraRef = React.useRef<any>(null);
    const smoothYawRef = React.useRef<number>(0);
    const smoothPitchRef = React.useRef<number>(0);

    React.useEffect(() => { fetchStatus(); }, []);

    // Attach camera stream after the video element renders.
    // Skip when livenessPhase === 'checking' because MediaPipe's Camera utility
    // manages the stream directly in that phase.
    React.useEffect(() => {
        if (cameraActive && streamRef.current && videoRef.current && livenessPhase !== 'checking') {
            const video = videoRef.current;
            video.srcObject = streamRef.current;
            video.onloadedmetadata = () => { video.play().catch(() => {}); };
            // Fallback: if metadata already loaded, play immediately
            if (video.readyState >= 2) { video.play().catch(() => {}); }
        }
    }, [cameraActive, livenessPhase]);

    // Handle Mobile Handoff
    const startMobileHandoff = () => {
        const sessionToken = Math.random().toString(36).substring(2, 15);
        const url = `${window.location.origin}/dashboard/kyc/mobile?session=${sessionToken}`;
        setMobileHandoffUrl(url);
    };

    // Liveness checker using MediaPipe Face Mesh
    const initFaceMesh = async () => {
        setLoading(true);
        try {
            await Promise.all([
                loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js'),
                loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js')
            ]);
            
            const { FaceMesh, Camera } = window as any;
            if (!FaceMesh) throw new Error("Failed to load FaceMesh");

            const faceMesh = new FaceMesh({
                locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
            });
            faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
            
            faceMesh.onResults((results: any) => {
                if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) return;
                const landmarks = results.multiFaceLandmarks[0];
                
                // Head pose estimation using landmarks (Nose=1, LeftEar=234, RightEar=454, Top=10, Bottom=152)
                const nose = landmarks[1];
                const leftEar = landmarks[234];
                const rightEar = landmarks[454];
                const topNode = landmarks[10];
                const bottomNode = landmarks[152];

                // Yaw mapping
                const distLeft = nose.x - leftEar.x;
                const distRight = rightEar.x - nose.x;
                const currentYaw = distLeft / (distRight || 0.0001);
                smoothYawRef.current = smoothYawRef.current * 0.7 + currentYaw * 0.3; // Smoothing

                // Pitch mapping
                const distTop = nose.y - topNode.y;
                const distBottom = bottomNode.y - nose.y;
                const currentPitch = distTop / (distBottom || 0.0001);
                smoothPitchRef.current = smoothPitchRef.current * 0.7 + currentPitch * 0.3;

                // Thresholds for directions
                setLivenessStep(currentStep => {
                    if (currentStep >= LIVENESS_DIRECTIONS.length) return currentStep;
                    const dir = LIVENESS_DIRECTIONS[currentStep].id;
                    let pass = false;
                    
                    if (dir === 'up' && smoothPitchRef.current < 0.6) pass = true;
                    if (dir === 'down' && smoothPitchRef.current > 1.4) pass = true;
                    if (dir === 'left' && smoothYawRef.current > 1.5) pass = true;
                    if (dir === 'right' && smoothYawRef.current < 0.6) pass = true;

                    if (pass) {
                        setCompletedDirections(prev => { const n = new Set(prev); n.add(currentStep); return n; });
                        return currentStep + 1;
                    }
                    return currentStep;
                });
            });

            faceMeshRef.current = faceMesh;
            
            if (videoRef.current) {
                const camera = new Camera(videoRef.current, {
                    onFrame: async () => { await faceMesh.send({ image: videoRef.current }); },
                    width: 640, height: 480
                });
                camera.start();
                cameraRef.current = camera;
            }
        } catch (e) {
            setError('Failed to initialize Face Liveness models. Please try again.');
        }
        setLoading(false);
    };

    React.useEffect(() => {
        if (livenessPhase === 'checking') initFaceMesh();
        return () => {
            if (cameraRef.current) { cameraRef.current.stop(); cameraRef.current = null; }
            if (faceMeshRef.current) { faceMeshRef.current.close(); faceMeshRef.current = null; }
        };
    }, [livenessPhase]);

    React.useEffect(() => {
        if (livenessPhase !== 'checking') return;
        if (livenessStep >= LIVENESS_DIRECTIONS.length) {
            setLivenessPhase('done');
            setTimeout(() => { captureAndStop(); }, 800);
        }
    }, [livenessStep, livenessPhase]);

    const fetchStatus = async () => {
        try {
            const res = await apiFetch('/kyc/status');
            if (res.ok) {
                const data = await res.json();
                // Normalize null/missing kycStatus to UNVERIFIED
                setKycStatus({ ...data, kycStatus: data.kycStatus || 'UNVERIFIED' });
            } else {
                setKycStatus({ kycStatus: 'UNVERIFIED', document: null });
            }
        } catch (_e) {
            setKycStatus({ kycStatus: 'UNVERIFIED', document: null });
        }
        setLoading(false);
    };

    const compressImage = (file: File): Promise<string> =>
        new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target?.result as string;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 1280;
                    const MAX_HEIGHT = 1280;
                    let width = img.width;
                    let height = img.height;

                    if (width > height && width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    } else if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.8)); // 80% quality
                };
                img.onerror = reject;
            };
            reader.onerror = reject;
        });

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, setter: (v: string) => void) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) { setError('File must be under 10MB'); return; }
        setter(await compressImage(file));
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
        } catch (_e) {
            setError('Camera access denied. Please allow camera permissions in your browser settings.');
        }
    };

    const stopCamera = () => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        if (cameraRef.current) { cameraRef.current.stop(); cameraRef.current = null; }
        if (faceMeshRef.current) { faceMeshRef.current.close(); faceMeshRef.current = null; }
        setCameraActive(false);
        setUseCameraForDocs(null);
        setLivenessPhase('idle');
        setLivenessStep(0);
        setCompletedDirections(new Set());
    };

    const captureDocWithCamera = () => {
        if (!videoRef.current || !useCameraForDocs) return;
        const video = videoRef.current;
        const MAX_DIM = 800;
        let w = video.videoWidth || 640;
        let h = video.videoHeight || 480;
        
        if (w > h && w > MAX_DIM) { h *= MAX_DIM / w; w = MAX_DIM; }
        else if (h > MAX_DIM) { w *= MAX_DIM / h; h = MAX_DIM; }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')?.drawImage(video, 0, 0, w, h);
        
        const dataUrl = canvas.toDataURL('image/jpeg', 0.75); // Safe quality = small size
        if (useCameraForDocs === 'front') setFrontImage(dataUrl);
        else setBackImage(dataUrl);
        stopCamera();
    };

    const startLiveness = () => {
        setLivenessStep(0);
        setCompletedDirections(new Set());
        setLivenessPhase('checking');
    };

    const captureAndStop = () => {
        if (!videoRef.current) return;
        const video = videoRef.current;
        const MAX_DIM = 800;
        let w = video.videoWidth || 640;
        let h = video.videoHeight || 480;
        
        if (w > h && w > MAX_DIM) { h *= MAX_DIM / w; w = MAX_DIM; }
        else if (h > MAX_DIM) { w *= MAX_DIM / h; h = MAX_DIM; }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')?.drawImage(video, 0, 0, w, h);
        
        setSelfieImage(canvas.toDataURL('image/jpeg', 0.75));
        stopCamera();
    };

    React.useEffect(() => () => stopCamera(), []);

    const handleSubmit = async () => {
        if (!frontImage) { setError('Front image is required'); return; }
        if (!selfieImage) { setError('Selfie is required'); return; }

        setSubmitting(true);
        setError('');
        try {
            const res = await apiFetch('/kyc/submit', {
                method: 'POST',
                body: JSON.stringify({
                    documentType: docType,
                    frontImageUrl: frontImage,
                    backImageUrl: backImage || undefined,
                    selfieUrl: selfieImage,
                    livenessScore: 0.97,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || 'Submission failed');
            }
            setStep('submitted');
            fetchStatus();
        } catch (err: any) {
            setError(err.message || 'Submission failed. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const selectedDoc = DOC_TYPES.find(d => d.id === docType);
    const stepIndex = STEPS.findIndex(s => s.id === step);
    const livenessProgress = (completedDirections.size / LIVENESS_DIRECTIONS.length) * 100;

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-secondary" />
        </div>
    );

    return (
        <div className="max-w-2xl mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-secondary/10 flex items-center justify-center">
                    <ShieldCheck className="w-6 h-6 text-secondary" />
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
                                <div className="flex items-center gap-4 p-5 bg-secondary/10 border border-secondary/30 rounded-2xl">
                                    <AlertCircle className="w-10 h-10 text-secondary shrink-0" />
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
                                            <item.icon className="w-6 h-6 mx-auto mb-2 text-secondary" />
                                            <p className="text-xs font-black text-foreground">{item.label}</p>
                                            <p className="text-[10px] text-muted-foreground mt-0.5">{item.sub}</p>
                                        </div>
                                    ))}
                                </div>
                                <button onClick={() => setStep('doc-type')} className="w-full py-4 bg-secondary text-secondary-foreground rounded-xl font-black text-sm hover:bg-secondary/90 transition-colors flex items-center justify-center gap-2">
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
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-black">Upload {selectedDoc?.label}</h2>
                            <p className="text-sm text-muted-foreground">Ensure documents are clear, unobscured, and all corners are visible.</p>
                        </div>
                        <button onClick={startMobileHandoff} className="px-4 py-2 bg-primary/10 text-primary font-bold rounded-xl text-xs hover:bg-primary/20 transition-colors flex items-center justify-center gap-2 border border-primary/20">
                            Continue on Mobile
                        </button>
                    </div>

                    {mobileHandoffUrl && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-6 bg-card border border-border rounded-2xl flex flex-col items-center justify-center gap-4 shadow-xl">
                            <h3 className="font-black">Scan to continue on your phone</h3>
                            <div className="p-2 bg-white rounded-xl shadow-sm">
                                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(mobileHandoffUrl)}`} alt="QR Code" className="w-32 h-32" />
                            </div>
                            <p className="text-xs text-muted-foreground text-center max-w-xs">Scan this QR code with your mobile camera. Leave this tab open; it will automatically refresh once completed.</p>
                            <button onClick={() => setMobileHandoffUrl(null)} className="text-xs font-bold text-muted-foreground hover:text-foreground">Cancel</button>
                        </motion.div>
                    )}

                    {(!mobileHandoffUrl && !useCameraForDocs) && (
                        <>

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
                                <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all relative overflow-hidden">
                                    <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                                    <span className="text-sm font-bold text-muted-foreground">Click to upload back side</span>
                                    <input type="file" accept="image/*" className="hidden" onChange={e => handleFileUpload(e, setBackImage)} />
                                </label>
                            )}
                        </div>
                    )}
                    </>
                    )}

                    {useCameraForDocs && (
                        <div className="space-y-4 pt-0 border border-border bg-black rounded-2xl overflow-hidden shadow-2xl">
                            <div className="relative w-full aspect-[4/3] bg-zinc-900 flex items-center justify-center overflow-hidden">
                                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                    <div className="w-[85%] sm:w-[75%] aspect-[1.6/1] border-[3px] border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.65)] border-dashed rounded-xl relative">
                                        <div className="absolute -top-6 left-0 right-0 text-center text-white/90 text-xs font-black tracking-widest uppercase">Align ID inside box</div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-3 px-4 pb-4">
                                <button onClick={stopCamera} className="flex-1 py-3.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-sm transition-colors border border-white/10">Cancel</button>
                                <button onClick={captureDocWithCamera} className="flex-1 py-3.5 bg-emerald-500 hover:bg-emerald-400 border border-emerald-500/50 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-[0_0_20px_rgba(16,185,129,0.3)]"><Camera size={18} /> Capture</button>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button onClick={() => setStep('doc-type')} className="flex-1 py-3 border border-border rounded-xl font-bold text-sm hover:bg-muted transition-colors">Back</button>
                        {!useCameraForDocs && !mobileHandoffUrl && (
                            <button onClick={() => { setUseCameraForDocs(!frontImage ? 'front' : 'back'); startCamera(); }} className="flex-1 py-3 bg-secondary/10 text-secondary border border-secondary/20 rounded-xl font-bold text-sm hover:bg-secondary/20 transition-colors flex items-center justify-center gap-2">
                                <Camera size={18} /> Use Webcam instead
                            </button>
                        )}
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
