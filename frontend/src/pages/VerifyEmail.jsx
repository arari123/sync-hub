import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, getErrorMessage } from '../lib/api';
import Logo from '../components/ui/Logo';

const VerifyEmail = () => {
    const [searchParams] = useSearchParams();
    const [isLoading, setIsLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        const token = searchParams.get('token') || '';
        if (!token.trim()) {
            setIsLoading(false);
            setError('인증 토큰이 없습니다.');
            return;
        }

        const verify = async () => {
            setIsLoading(true);
            setError('');
            try {
                const response = await api.post('/auth/verify-email', { token });
                setMessage(response?.data?.message || '이메일 인증이 완료되었습니다.');
            } catch (err) {
                setError(getErrorMessage(err, '이메일 인증에 실패했습니다.'));
            } finally {
                setIsLoading(false);
            }
        };

        verify();
    }, [searchParams]);

    return (
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full items-center justify-center px-4 py-8">
            <div className="auth-shell app-enter max-w-3xl lg:grid-cols-[1fr_1fr]">
                <aside className="auth-aside hidden lg:flex lg:flex-col lg:justify-between">
                    <div className="space-y-4">
                        <span className="chip-pill">Verification</span>
                        <h1 className="text-3xl font-extrabold leading-tight text-slate-900">
                            이메일 인증 후
                            <br />
                            안전하게 작업을 시작하세요.
                        </h1>
                        <p className="text-sm leading-relaxed text-slate-600">
                            인증된 계정만 프로젝트 데이터와 예산 워크플로우에 접근할 수 있습니다.
                        </p>
                    </div>
                </aside>

                <div className="p-6 sm:p-8 lg:p-10">
                    <div className="mb-6 flex items-center justify-between">
                        <Logo asLink={false} />
                        <span className="chip-pill">VERIFY</span>
                    </div>

                    <h2 className="mb-3 text-2xl font-bold">이메일 인증</h2>
                    {isLoading ? (
                        <p className="text-sm text-muted-foreground">인증 처리 중입니다...</p>
                    ) : error ? (
                        <div className="space-y-3">
                            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
                            <Link className="text-sm font-semibold text-primary hover:underline" to="/signup">
                                가입 페이지로 이동
                            </Link>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <p className="rounded-md border border-primary/25 bg-primary/8 px-3 py-2 text-sm text-slate-700">{message}</p>
                            <Link className="text-sm font-semibold text-primary hover:underline" to="/login">
                                로그인 페이지로 이동
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VerifyEmail;
