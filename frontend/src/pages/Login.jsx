import React, { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, getErrorMessage } from '../lib/api';
import { isAuthenticated, setSession } from '../lib/session';
import Logo from '../components/ui/Logo';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

const Login = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    if (isAuthenticated()) {
        return <Navigate to="/home" replace />;
    }

    const fromPath = location.state?.from || '/home';

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
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full items-center justify-center px-4 py-8">
            <div className="auth-shell app-enter lg:grid-cols-[0.95fr_1.05fr]">
                <aside className="auth-aside hidden lg:flex lg:flex-col lg:justify-between">
                    <div className="space-y-4">
                        <span className="chip-pill">Access Portal</span>
                        <h1 className="text-3xl font-extrabold leading-tight text-slate-900">
                            실시간 프로젝트 데이터와
                            <br />
                            지식 검색을 한 번에.
                        </h1>
                        <p className="max-w-sm text-sm leading-relaxed text-slate-600">
                            Sync-Hub는 예산, 안건, 사양 데이터를 통합해 빠른 의사결정을 지원합니다.
                        </p>
                    </div>
                    <div className="space-y-2 text-xs text-slate-600">
                        <p>보안 이메일 인증 기반 계정 정책 적용</p>
                        <p>프로젝트별 권한/버전 이력 기반 작업 추적</p>
                    </div>
                </aside>

                <div className="p-6 sm:p-8 lg:p-10">
                    <div className="mb-6 flex items-center justify-between">
                        <Logo asLink={false} />
                        <span className="chip-pill">LOGIN</span>
                    </div>

                    <p className="mb-6 text-sm text-muted-foreground">
                        승인된 회사 이메일로 로그인하세요.
                    </p>

                    <form className="space-y-4" onSubmit={onSubmit}>
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-slate-700" htmlFor="email">이메일</label>
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                placeholder="name@company.com"
                                autoComplete="email"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-slate-700" htmlFor="password">비밀번호</label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                placeholder="비밀번호 입력"
                                autoComplete="current-password"
                            />
                        </div>

                        {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

                        <Button type="submit" disabled={isLoading} className="w-full">
                            {isLoading ? '로그인 중...' : '로그인'}
                        </Button>
                    </form>

                    <p className="mt-5 text-sm text-muted-foreground">
                        계정이 없다면{' '}
                        <Link className="font-semibold text-primary hover:underline" to="/signup">
                            메일 인증 가입
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Login;
