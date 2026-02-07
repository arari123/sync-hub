import React from 'react';
import SearchInput from '../components/SearchInput';
import UploadWidget from '../components/UploadWidget';
import HealthStatus from '../components/HealthStatus';
import { UploadCloud } from 'lucide-react';
import Logo from '../components/ui/Logo';

const SHOW_TEMP_PDF_UPLOAD = true;

const Home = () => {
    return (
        <div className="flex flex-col items-center justify-center min-h-[80vh] gap-12">
            <div className="text-center space-y-4 max-w-2xl px-4 animate-in fade-in zoom-in duration-500">
                <div className="flex justify-center mb-6">
                    <Logo size="large" asLink={false} />
                </div>
                <p className="text-lg text-muted-foreground">
                    Upload PDF documents and find exactly what you need with natural language search.
                </p>
            </div>

            <div className="w-full px-4 animate-in slide-in-from-bottom-4 duration-700 delay-150">
                <SearchInput className="shadow-lg" autoFocus />
            </div>

            {SHOW_TEMP_PDF_UPLOAD && (
                <div className="w-full max-w-3xl px-4 opacity-0 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-250 fill-mode-forwards">
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-muted-foreground mb-2">
                            <UploadCloud size={16} />
                            <h3 className="text-sm font-medium uppercase tracking-wider">PDF Upload</h3>
                            <span className="rounded-full border border-muted-foreground/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Temporary
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground -mt-1">
                            Temporary upload area on home page. It can be moved or removed later.
                        </p>
                        <UploadWidget />
                    </div>
                </div>
            )}

            <div className="w-full max-w-4xl mt-6 px-4 opacity-0 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300 fill-mode-forwards">
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-2">
                        <ActivityIcon />
                        <h3 className="text-sm font-medium uppercase tracking-wider">System Status</h3>
                    </div>
                    <HealthStatus />
                </div>
            </div>
        </div>
    );
};

const ActivityIcon = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
);

export default Home;
