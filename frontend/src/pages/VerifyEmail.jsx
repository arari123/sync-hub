import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, getErrorMessage } from '../lib/api';

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
        <div className="mx-auto flex min-h-[70vh] w-full max-w-md items-center">
            <div className="w-full rounded-xl border bg-card p-6 shadow-sm">
                <h1 className="mb-2 text-2xl font-bold">이메일 인증</h1>
                {isLoading ? (
                    <p className="text-sm text-muted-foreground">인증 처리 중입니다...</p>
                ) : error ? (
                    <div className="space-y-3">
                        <p className="text-sm text-destructive">{error}</p>
                        <Link className="text-sm font-medium text-primary hover:underline" to="/signup">
                            가입 페이지로 이동
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <p className="text-sm">{message}</p>
                        <Link className="text-sm font-medium text-primary hover:underline" to="/login">
                            로그인 페이지로 이동
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
};

export default VerifyEmail;
