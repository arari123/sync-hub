import React, { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, getErrorMessage } from '../lib/api';
import { isAuthenticated, setSession } from '../lib/session';

const Login = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    if (isAuthenticated()) {
        return <Navigate to="/" replace />;
    }

    const fromPath = location.state?.from || '/';

    const onSubmit = async (event) => {
        event.preventDefault();
        if (!email.trim() || !password.trim()) {
            setError('이메일과 비밀번호를 입력해 주세요.');
            return;
        }

        setIsLoading(true);
        setError('');
        try {
            const response = await api.post('/auth/login', {
                email: email.trim(),
                password,
            });
            const payload = response.data || {};
            setSession(payload.access_token || '', payload.user || null);
            navigate(fromPath, { replace: true });
        } catch (err) {
            setError(getErrorMessage(err, '로그인에 실패했습니다.'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="mx-auto flex min-h-[70vh] w-full max-w-md items-center">
            <div className="w-full rounded-xl border bg-card p-6 shadow-sm">
                <h1 className="mb-2 text-2xl font-bold">Sync-Hub 로그인</h1>
                <p className="mb-6 text-sm text-muted-foreground">
                    승인된 회사 이메일로 로그인하세요.
                </p>

                <form className="space-y-4" onSubmit={onSubmit}>
                    <div className="space-y-1">
                        <label className="text-sm font-medium" htmlFor="email">이메일</label>
                        <input
                            id="email"
                            type="email"
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="name@company.com"
                            autoComplete="email"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium" htmlFor="password">비밀번호</label>
                        <input
                            id="password"
                            type="password"
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="비밀번호 입력"
                            autoComplete="current-password"
                        />
                    </div>

                    {error && <p className="text-sm text-destructive">{error}</p>}

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isLoading ? '로그인 중...' : '로그인'}
                    </button>
                </form>

                <p className="mt-4 text-sm text-muted-foreground">
                    계정이 없다면{' '}
                    <Link className="font-medium text-primary hover:underline" to="/signup">
                        메일 인증 가입
                    </Link>
                </p>
            </div>
        </div>
    );
};

export default Login;
