import Sidebar from '@/components/dashboard/Sidebar';

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex h-screen bg-[#F7F9FC] overflow-hidden">
            <Sidebar role="buyer" />
            <main className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="p-8 pb-24">
                    {children}
                </div>
            </main>
        </div>
    );
}
