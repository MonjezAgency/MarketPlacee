'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    User, Building2, Globe, ShieldCheck, 
    Upload, Camera, CheckCircle2, AlertCircle, 
    ArrowRight, ArrowLeft, Loader2, RefreshCcw,
    ScanFace, FileText, Smartphone, LayoutDashboard,
    ChevronRight, X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/lib/auth';

type Step = 1 | 2 | 3 | 4 | 5;

export default function KYCPage() {
    const router = useRouter();
    const { user, isAuthReady } = useAuth();

    // If platform staff or supplier accidentally land here, send them home.
    // Admins/owners shouldn't see KYC at all (they're the platform itself).
    React.useEffect(() => {
        if (!isAuthReady || !user) return;
        const role = (user.role || '').toUpperCase();
        const teamRoles = ['ADMIN', 'OWNER', 'MODERATOR', 'SUPPORT', 'EDITOR', 'DEVELOPER', 'LOGISTICS'];
        if (teamRoles.includes(role)) {
            router.replace('/admin');
        } else if (role === 'SUPPLIER') {
            router.replace('/supplier');
        }
    }, [isAuthReady, user, router]);

    // Helper used by all "Back to Dashboard" buttons so each role lands in
    // its own dashboard rather than always /dashboard/customer.
    const dashboardHref = (() => {
        const role = (user?.role || '').toUpperCase();
        if (['ADMIN','OWNER','MODERATOR','SUPPORT','EDITOR','DEVELOPER','LOGISTICS'].includes(role)) return '/admin';
        if (role === 'SUPPLIER') return '/supplier';
        return '/dashboard/customer';
    })();

    const [step, setStep] = React.useState<Step>(1);
    const [isLoading, setIsLoading] = React.useState(false);
    const [status, setStatus] = React.useState<'IDLE' | 'VERIFYING' | 'SUCCESS' | 'FAILURE' | 'UNDER_REVIEW'>('IDLE');
    const videoRef = React.useRef<HTMLVideoElement>(null);
    const [stream, setStream] = React.useState<MediaStream | null>(null);
    const [isCameraActive, setIsCameraActive] = React.useState(false);
    const [captureType, setCaptureType] = React.useState<'FRONT' | 'BACK' | 'FACE' | null>(null);

    // Form State
    const [formData, setFormData] = React.useState({
        fullName: '',
        companyName: '',
        country: 'Romania',
        idType: 'National ID',
        frontImage: null as File | null,
        backImage: null as File | null
    });

    const [bioProgress, setBioProgress] = React.useState(0);

    const validateStep = () => {
        if (step === 1) {
            if (!formData.fullName || !formData.companyName) {
                toast.error('Please fill in all personal details');
                return false;
            }
        }
        if (step === 2) {
            if (!formData.frontImage || !formData.backImage) {
                toast.error('Please upload both front and back document images');
                return false;
            }
        }
        if (step === 3 && bioProgress < 4) {
            toast.error('Please complete all biometric movements');
            return false;
        }
        return true;
    };

    const nextStep = () => {
        if (validateStep()) setStep(prev => (prev + 1) as Step);
    };

    const prevStep = () => setStep(prev => (prev - 1) as Step);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'front' | 'back') => {
        const file = e.target.files?.[0];
        if (file) {
            setFormData(prev => ({ ...prev, [type === 'front' ? 'frontImage' : 'backImage']: file }));
            toast.success(`${type === 'front' ? 'Front' : 'Back'} image uploaded`);
        }
    };

    const startCamera = async (type: 'FRONT' | 'BACK' | 'FACE') => {
        try {
            const s = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    facingMode: type === 'FACE' ? 'user' : 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                } 
            });
            setStream(s);
            setCaptureType(type);
            setIsCameraActive(true);
        } catch (err) {
            toast.error('Camera access denied');
        }
    };

    const stopCamera = () => {
        if (stream) stream.getTracks().forEach(track => track.stop());
        setStream(null);
        setIsCameraActive(false);
        setCaptureType(null);
    };

    const capturePhoto = () => {
        if (!videoRef.current) return;
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(videoRef.current, 0, 0);
        
        canvas.toBlob((blob) => {
            if (blob) {
                const file = new File([blob], `captured_${captureType?.toLowerCase()}.jpg`, { type: 'image/jpeg' });
                if (captureType === 'FRONT') setFormData(prev => ({ ...prev, frontImage: file }));
                if (captureType === 'BACK') setFormData(prev => ({ ...prev, backImage: file }));
                if (captureType === 'FACE') setBioProgress(prev => Math.min(prev + 1, 4));
                
                toast.success('Photo captured');
                if (captureType !== 'FACE') stopCamera();
            }
        }, 'image/jpeg');
    };

    const startBioAutoProgress = () => {
        setBioProgress(0);
        let current = 0;
        const interval = setInterval(() => {
            current += 1;
            setBioProgress(current);
            if (current >= 4) {
                clearInterval(interval);
                toast.success('Identity verified successfully');
            }
        }, 3000);
        return interval;
    };

    React.useEffect(() => {
        if (stream && videoRef.current) {
            videoRef.current.srcObject = stream;
        }
    }, [stream, isCameraActive]);

    React.useEffect(() => {
        return () => {
            if (stream) stream.getTracks().forEach(track => track.stop());
        };
    }, [stream]);

    React.useEffect(() => {
        let interval: any;
        if (step === 3 && !isCameraActive) {
            startCamera('FACE');
            interval = startBioAutoProgress();
        } else if (step !== 3 && isCameraActive && captureType === 'FACE') {
            stopCamera();
        }
        return () => clearInterval(interval);
    }, [step]);
    const handleSubmit = async () => {
        setIsLoading(true);
        setStatus('VERIFYING');
        
        // Simulate ~5 seconds of verification
        await new Promise(resolve => setTimeout(resolve, 4000));
        
        // Randomly succeed or fail for demo
        const isSuccess = Math.random() > 0.2;
        if (isSuccess) {
            setStatus('SUCCESS');
        } else {
            setStatus('FAILURE');
        }
        setIsLoading(false);
    };

    if (status === 'VERIFYING') {
        return (
            <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center space-y-8">
                <div className="relative">
                    <div className="w-24 h-24 rounded-full border-4 border-slate-100 border-t-[#00BFA6] animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <ScanFace className="text-[#00BFA6]" size={32} />
                    </div>
                </div>
                <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-[#0F172A]">Verifying your identity...</h2>
                    <p className="text-slate-500 max-w-sm mx-auto">Our AI system is cross-referencing your documents with your biometric data.</p>
                </div>
                <div className="w-64 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: '100%' }}
                        transition={{ duration: 4 }}
                        className="h-full bg-[#00BFA6]"
                    />
                </div>
            </div>
        );
    }

    if (status === 'SUCCESS') {
        return (
            <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center space-y-8">
                <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-24 h-24 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500"
                >
                    <CheckCircle2 size={48} />
                </motion.div>
                <div className="space-y-2">
                    <h2 className="text-3xl font-black text-[#0F172A]">You are now verified!</h2>
                    <p className="text-slate-500 max-w-sm mx-auto">Your account is fully authorized for B2B transactions. You can now access global pricing.</p>
                </div>
                <button 
                    onClick={() => router.push(dashboardHref)}
                    className="h-14 px-12 rounded-2xl bg-[#00BFA6] text-white font-bold shadow-lg shadow-[#00BFA6]/20 transition-all active:scale-95"
                >
                    Back to Dashboard
                </button>
            </div>
        );
    }

    if (status === 'FAILURE') {
        return (
            <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center space-y-8">
                <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-24 h-24 rounded-full bg-red-50 flex items-center justify-center text-red-500"
                >
                    <AlertCircle size={48} />
                </motion.div>
                <div className="space-y-2">
                    <h2 className="text-3xl font-black text-[#0F172A]">Verification Failed</h2>
                    <p className="text-slate-500 max-w-sm mx-auto">Document quality was too low or biometric mismatch detected. Please ensure you are in a well-lit area.</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                    <button 
                        onClick={() => setStatus('IDLE')}
                        className="h-14 px-12 rounded-2xl bg-[#0F172A] text-white font-bold transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                        <RefreshCcw size={18} />
                        Retry Verification
                    </button>
                    <button 
                        onClick={() => setStatus('UNDER_REVIEW')}
                        className="h-14 px-12 rounded-2xl bg-white border border-slate-200 text-slate-600 font-bold transition-all hover:bg-slate-50 active:scale-95"
                    >
                        Request Manual Review
                    </button>
                </div>
            </div>
        );
    }

    if (status === 'UNDER_REVIEW') {
        return (
            <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center space-y-8">
                <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-24 h-24 rounded-full bg-amber-50 flex items-center justify-center text-amber-500"
                >
                    <AlertCircle size={48} />
                </motion.div>
                <div className="space-y-2">
                    <h2 className="text-3xl font-black text-[#0F172A]">Under Review</h2>
                    <p className="text-slate-500 max-w-sm mx-auto">Your verification has been flagged for manual review. An agent will contact you within 24 hours.</p>
                </div>
                <button 
                    onClick={() => router.push(dashboardHref)}
                    className="h-14 px-12 rounded-2xl bg-[#0F172A] text-white font-bold transition-all active:scale-95"
                >
                    Back to Dashboard
                </button>
            </div>
        );
    }

    return (
        <main className="min-h-screen bg-[#F8FAFC] py-16 px-6">
            <div className="max-w-[720px] mx-auto space-y-10">
                {/* Header */}
                <div className="text-center space-y-4">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#00BFA6]/10 text-[#00BFA6] rounded-full text-xs font-bold uppercase tracking-widest">
                        <ShieldCheck size={14} />
                        Identity Assurance
                    </div>
                    <h1 className="text-4xl font-black text-[#0F172A]">Identity Verification</h1>
                    <p className="text-[#6B7280] max-w-md mx-auto">Complete these 4 steps to unlock full marketplace features and enterprise logistics.</p>
                </div>

                {/* Progress Tracker */}
                <div className="flex items-center justify-between px-4">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="flex items-center flex-1 last:flex-none">
                            <div className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300",
                                step === i ? "bg-[#00BFA6] text-white shadow-lg shadow-[#00BFA6]/20 scale-110" : 
                                step > i ? "bg-[#22C55E] text-white" : "bg-white border-2 border-slate-200 text-slate-400"
                            )}>
                                {step > i ? <CheckCircle2 size={18} /> : i}
                            </div>
                            {i < 4 && (
                                <div className="flex-1 h-[2px] mx-4 bg-slate-200">
                                    <div className={cn("h-full bg-[#00BFA6] transition-all duration-500", step > i ? "w-full" : "w-0")} />
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Step Content */}
                <div className="bg-white border border-[#E6EAF0] rounded-[32px] p-8 sm:p-12 shadow-sm relative overflow-hidden">
                    <AnimatePresence mode="wait">
                        {step === 1 && (
                            <motion.div 
                                key="step1"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-8"
                            >
                                <div className="space-y-1">
                                    <h2 className="text-xl font-bold text-[#0F172A]">Personal Information</h2>
                                    <p className="text-sm text-slate-500">Provide your legal registration details</p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[12px] font-bold text-slate-400 uppercase tracking-widest">Full Name</label>
                                        <input 
                                            type="text" 
                                            placeholder="Alex Sterling"
                                            className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-[#00BFA6] transition-all"
                                            value={formData.fullName}
                                            onChange={e => setFormData({...formData, fullName: e.target.value})}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[12px] font-bold text-slate-400 uppercase tracking-widest">Company Name</label>
                                        <input 
                                            type="text" 
                                            placeholder="Sterling Global LLC"
                                            className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-[#00BFA6] transition-all"
                                            value={formData.companyName}
                                            onChange={e => setFormData({...formData, companyName: e.target.value})}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[12px] font-bold text-slate-400 uppercase tracking-widest">Country</label>
                                        <select 
                                            className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-[#00BFA6] transition-all appearance-none"
                                            value={formData.country}
                                            onChange={e => setFormData({...formData, country: e.target.value})}
                                        >
                                            <option>Romania</option>
                                            <option>Germany</option>
                                            <option>Netherlands</option>
                                            <option>United Kingdom</option>
                                            <option>Egypt</option>
                                            <option>United Arab Emirates</option>
                                            <option>Saudi Arabia</option>
                                            <option>United States</option>
                                            <option>France</option>
                                            <option>Italy</option>
                                            <option>Spain</option>
                                            <option>Turkey</option>
                                            <option>Jordan</option>
                                            <option>Qatar</option>
                                        </select>
                                    </div>
                                    <div className="space-y-3">
                                         <label className="text-[12px] font-bold text-[#6B7280] uppercase tracking-widest">ID Type</label>
                                         <div className="grid grid-cols-1 gap-3">
                                             {['National ID', 'Passport', 'Driver License'].map((type) => (
                                                 <label 
                                                     key={type}
                                                     className={cn(
                                                         "flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all",
                                                         formData.idType === type ? "border-[#00BFA6] bg-teal-50/30 shadow-sm" : "border-slate-100 hover:border-slate-200"
                                                     )}
                                                 >
                                                     <div className={cn(
                                                         "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                                                         formData.idType === type ? "border-[#00BFA6]" : "border-slate-300"
                                                     )}>
                                                         {formData.idType === type && <div className="w-2.5 h-2.5 rounded-full bg-[#00BFA6]" />}
                                                     </div>
                                                     <span className="text-sm font-bold text-slate-700">{type}</span>
                                                     <input 
                                                         type="radio" 
                                                         name="idType" 
                                                         className="hidden" 
                                                         checked={formData.idType === type}
                                                         onChange={() => setFormData({...formData, idType: type})}
                                                     />
                                                 </label>
                                             ))}
                                         </div>
                                     </div>
                                </div>
                            </motion.div>
                        )}

                        {step === 2 && (
                            <motion.div 
                                key="step2"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-8"
                            >
                                <div className="space-y-1">
                                    <h2 className="text-xl font-bold text-[#0F172A]">Document Upload</h2>
                                    <p className="text-sm text-slate-500">Upload clear photos of your {formData.idType}</p>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div className="space-y-3">
                                        <label className="text-[12px] font-bold text-slate-400 uppercase tracking-widest">Front Image</label>
                                        <div 
                                            onClick={() => document.getElementById('front-upload')?.click()}
                                            className={cn(
                                                "h-[160px] border-2 border-dashed rounded-[20px] flex flex-col items-center justify-center text-center p-4 transition-all cursor-pointer group",
                                                formData.frontImage ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:border-[#00BFA6]/50"
                                            )}
                                        >
                                            {formData.frontImage ? (
                                                <>
                                                    <CheckCircle2 size={32} className="text-emerald-500 mb-2" />
                                                    <p className="text-xs font-bold text-emerald-600">{formData.frontImage.name}</p>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); setFormData(prev => ({ ...prev, frontImage: null })) }}
                                                        className="mt-2 text-[10px] font-bold text-slate-400 hover:text-red-500"
                                                    >
                                                        Remove
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <Upload className="text-slate-300 group-hover:text-[#00BFA6] transition-all mb-2" size={32} />
                                                    <p className="text-xs font-bold text-slate-500">Tap to upload front</p>
                                                    <div className="mt-4 flex gap-2">
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); startCamera('FRONT') }}
                                                            className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[10px] font-bold flex items-center gap-1"
                                                        >
                                                            <Camera size={12} /> Take Photo
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                            <input id="front-upload" type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'front')} />
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[12px] font-bold text-[#6B7280] uppercase tracking-widest">Back Image</label>
                                        <div 
                                            onClick={() => document.getElementById('back-upload')?.click()}
                                            className={cn(
                                                "h-[160px] border-2 border-dashed rounded-[20px] flex flex-col items-center justify-center text-center p-4 transition-all cursor-pointer group",
                                                formData.backImage ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:border-[#00BFA6]/50"
                                            )}
                                        >
                                            {formData.backImage ? (
                                                <>
                                                    <CheckCircle2 size={32} className="text-emerald-500 mb-2" />
                                                    <p className="text-xs font-bold text-emerald-600">{formData.backImage.name}</p>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); setFormData(prev => ({ ...prev, backImage: null })) }}
                                                        className="mt-2 text-[10px] font-bold text-slate-400 hover:text-red-500"
                                                    >
                                                        Remove
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <Upload className="text-slate-300 group-hover:text-[#00BFA6] transition-all mb-2" size={32} />
                                                    <p className="text-xs font-bold text-slate-500">Tap to upload back</p>
                                                    <div className="mt-4 flex gap-2">
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); startCamera('BACK') }}
                                                            className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[10px] font-bold flex items-center gap-1"
                                                        >
                                                            <Camera size={12} /> Take Photo
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                            <input id="back-upload" type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'back')} />
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {step === 3 && (
                            <motion.div 
                                key="step3"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-10 flex flex-col items-center"
                            >
                                <div className="space-y-1 text-center">
                                    <h2 className="text-xl font-bold text-[#0F172A]">Face Verification</h2>
                                    <p className="text-sm text-slate-500">Follow the biometric instructions below</p>
                                </div>
                                
                                <div className="relative">
                                    {/* Scanning Ring */}
                                    <svg className="absolute -inset-4 w-[252px] h-[252px] -rotate-90 z-10 pointer-events-none">
                                        <circle
                                            cx="126"
                                            cy="126"
                                            r="120"
                                            stroke="currentColor"
                                            strokeWidth="4"
                                            fill="transparent"
                                            className="text-slate-100"
                                        />
                                        <motion.circle
                                            cx="126"
                                            cy="126"
                                            r="120"
                                            stroke="currentColor"
                                            strokeWidth="6"
                                            fill="transparent"
                                            strokeDasharray="754"
                                            initial={{ strokeDashoffset: 754 }}
                                            animate={{ strokeDashoffset: 754 - (754 * (bioProgress / 4)) }}
                                            transition={{ duration: 1, ease: "easeInOut" }}
                                            className="text-[#00BFA6] stroke-round"
                                        />
                                    </svg>

                                    <div className="w-[220px] h-[220px] rounded-full border-[2px] border-white p-1 overflow-hidden bg-slate-900 flex items-center justify-center relative shadow-2xl">
                                        <video 
                                            ref={videoRef} 
                                            autoPlay 
                                            playsInline 
                                            muted
                                            className="w-full h-full object-cover rounded-full scale-x-[-1]"
                                        />
                                        {!isCameraActive && (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 gap-3">
                                                <Camera className="text-slate-700" size={48} />
                                                <button 
                                                    onClick={() => startCamera('FACE')}
                                                    className="text-[10px] font-bold text-[#00BFA6] underline uppercase tracking-widest"
                                                >
                                                    Enable Camera
                                                </button>
                                            </div>
                                        )}
                                        {/* Biometric Mesh Simulation */}
                                        {isCameraActive && bioProgress < 4 && (
                                            <motion.div 
                                                animate={{ opacity: [0.2, 0.5, 0.2] }}
                                                transition={{ repeat: Infinity, duration: 2 }}
                                                className="absolute inset-0 border-[1px] border-[#00BFA6]/30 rounded-full flex items-center justify-center"
                                            >
                                                <div className="w-full h-[1px] bg-[#00BFA6]/20 absolute top-1/3" />
                                                <div className="w-full h-[1px] bg-[#00BFA6]/20 absolute top-2/3" />
                                                <div className="h-full w-[1px] bg-[#00BFA6]/20 absolute left-1/3" />
                                                <div className="h-full w-[1px] bg-[#00BFA6]/20 absolute left-2/3" />
                                            </motion.div>
                                        )}
                                    </div>
                                    <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 w-full">
                                        <div className="bg-[#0F172A] text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg z-10">
                                            {isCameraActive ? 'BIOMETRIC SCAN ACTIVE' : 'CAMERA OFF'}
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-12 w-full text-center space-y-6">
                                    <AnimatePresence mode="wait">
                                        {bioProgress < 4 ? (
                                            <motion.div 
                                                key={bioProgress}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -10 }}
                                                className="space-y-2"
                                            >
                                                <p className="text-[12px] font-black text-[#00BFA6] uppercase tracking-[0.2em]">Current Instruction</p>
                                                <h3 className="text-3xl font-black text-[#0F172A]">
                                                    {['Move head left', 'Move head right', 'Look up', 'Look down'][bioProgress]}
                                                </h3>
                                                <div className="flex items-center justify-center gap-1 mt-4">
                                                    {[0, 1, 2, 3].map((i) => (
                                                        <div key={i} className={cn(
                                                            "w-8 h-1 rounded-full transition-all duration-500",
                                                            bioProgress > i ? "bg-[#22C55E]" : 
                                                            bioProgress === i ? "bg-[#00BFA6] w-12" : "bg-slate-100"
                                                        )} />
                                                    ))}
                                                </div>
                                            </motion.div>
                                        ) : (
                                            <motion.div 
                                                initial={{ scale: 0.9, opacity: 0 }}
                                                animate={{ scale: 1, opacity: 1 }}
                                                className="space-y-2"
                                            >
                                                <div className="w-12 h-12 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                                    <CheckCircle2 size={24} />
                                                </div>
                                                <h3 className="text-2xl font-black text-[#0F172A]">Biometric Scan Complete</h3>
                                                <p className="text-sm text-slate-500 font-medium">Your identity has been verified against your documents.</p>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </motion.div>
                        )}

                        {step === 4 && (
                            <motion.div 
                                key="step4"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-8"
                            >
                                <div className="space-y-1">
                                    <h2 className="text-xl font-bold text-[#0F172A]">Review & Submit</h2>
                                    <p className="text-sm text-slate-500">Confirm your details before submission</p>
                                </div>
                                
                                <div className="space-y-4">
                                    <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
                                        <div className="grid grid-cols-2 gap-6">
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Full Name</p>
                                                <p className="text-sm font-bold text-slate-700">{formData.fullName || 'Not provided'}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Company</p>
                                                <p className="text-sm font-bold text-slate-700">{formData.companyName || 'Not provided'}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Location</p>
                                                <p className="text-sm font-bold text-slate-700">{formData.country}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Document</p>
                                                <p className="text-sm font-bold text-slate-700">{formData.idType}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-100 rounded-2xl text-blue-700">
                                        <Smartphone size={20} className="shrink-0" />
                                        <p className="text-xs font-medium leading-relaxed">
                                            By submitting, you agree to our biometric data processing policy for AML/KYC compliance.
                                        </p>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Camera Overlay Modal */}
                    <AnimatePresence>
                        {isCameraActive && captureType !== 'FACE' && (
                            <div className="fixed inset-0 bg-black/90 z-[100] flex flex-col items-center justify-center p-6">
                                <div className="w-full max-w-[500px] aspect-[3/4] bg-slate-800 rounded-3xl overflow-hidden relative border-4 border-[#00BFA6]">
                                    <video 
                                        ref={videoRef} 
                                        autoPlay 
                                        playsInline 
                                        muted
                                        className="w-full h-full object-cover"
                                    />
                                    <div className="absolute inset-0 border-[40px] border-black/40 pointer-events-none">
                                        <div className="w-full h-full border-2 border-dashed border-white/50 rounded-2xl" />
                                    </div>
                                </div>
                                <div className="mt-8 flex flex-col items-center gap-6 text-white text-center">
                                    <div>
                                        <h3 className="text-xl font-bold">Capture {captureType} Document</h3>
                                        <p className="text-sm text-slate-400 mt-1">Ensure the ID is within the frame and text is readable</p>
                                    </div>
                                    <div className="flex items-center gap-8">
                                        <button onClick={stopCamera} className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all">
                                            <X size={24} />
                                        </button>
                                        <button 
                                            onClick={capturePhoto}
                                            className="w-20 h-20 rounded-full bg-white border-8 border-slate-700 flex items-center justify-center active:scale-95 transition-all shadow-2xl"
                                        >
                                            <div className="w-full h-full rounded-full border-2 border-slate-900" />
                                        </button>
                                        <div className="w-14 h-14" /> {/* Spacer */}
                                    </div>
                                </div>
                            </div>
                        )}
                    </AnimatePresence>

                    {/* Navigation Buttons */}
                    <div className="mt-12 flex gap-4 pt-8 border-t border-slate-100">
                        {step > 1 && (
                            <button 
                                onClick={prevStep}
                                className="flex-1 h-14 rounded-2xl bg-white border border-slate-200 text-[#0F172A] font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                            >
                                <ArrowLeft size={18} />
                                Back
                            </button>
                        )}
                        <button 
                            onClick={step === 4 ? handleSubmit : nextStep}
                            className="flex-[2] h-14 rounded-2xl bg-[#0F172A] text-white font-bold shadow-xl shadow-[#0F172A]/20 transition-all hover:bg-slate-800 active:scale-95 flex items-center justify-center gap-2"
                        >
                            {step === 4 ? 'Submit Verification' : 'Continue'}
                            <ArrowRight size={18} />
                        </button>
                    </div>
                </div>
            </div>
        </main>
    );
}
