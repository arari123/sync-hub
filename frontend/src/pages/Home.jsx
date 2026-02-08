import React from 'react';
import SearchInput from '../components/SearchInput';
import UploadWidget from '../components/UploadWidget';
import { UploadCloud } from 'lucide-react';
import Logo from '../components/ui/Logo';

const SHOW_TEMP_DOCUMENT_UPLOAD = true;

const Home = () => {
    return (
        <div className="flex flex-col items-center justify-center min-h-[80vh] gap-12">
            <div className="text-center space-y-4 max-w-2xl px-4 animate-in fade-in zoom-in duration-500">
                <div className="flex justify-center mb-6">
                    <Logo size="large" asLink={false} />
                </div>
                <p className="text-lg text-muted-foreground">
                    PDF/Excel 문서를 업로드하고 자연어 검색으로 필요한 내용을 빠르게 찾으세요.
                </p>
            </div>

            <div className="w-full px-4 animate-in slide-in-from-bottom-4 duration-700 delay-150">
                <SearchInput className="shadow-lg" autoFocus />
            </div>

            {SHOW_TEMP_DOCUMENT_UPLOAD && (
                <div className="w-full max-w-3xl px-4">
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-muted-foreground mb-2">
                            <UploadCloud size={16} />
                            <h3 className="text-sm font-medium uppercase tracking-wider">문서 업로드</h3>
                            <span className="rounded-full border border-muted-foreground/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                임시
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground -mt-1">
                            메인 페이지의 임시 업로드 영역입니다. 추후 이동하거나 제거할 수 있습니다.
                        </p>
                        <UploadWidget />
                    </div>
                </div>
            )}
        </div>
    );
};

export default Home;
