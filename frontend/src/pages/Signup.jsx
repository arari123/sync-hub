import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, getErrorMessage } from '../lib/api';
import { isAuthenticated } from '../lib/session';
import Logo from '../components/ui/Logo';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

const Signup = () => {
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);

    if (isAuthenticated()) {
        return <Navigate to="/home" replace />;
    }

    const onSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setResult(null);

        if (!email.trim() || !password.trim()) {
            setError('이메일과 비밀번호를 입력해 주세요.');
            return;
        }
        if (password.length < 8) {
            setError('비밀번호는 8자 이상이어야 합니다.');
            return;
        }
        if (password !== passwordConfirm) {
            setError('비밀번호 확인이 일치하지 않습니다.');
            return;
        }

        setIsLoading(true);
        try {
            const response = await api.post('/auth/signup', {
                full_name: fullName.trim(),
                email: email.trim(),
                password,
            });
            setResult(response.data || null);
        } catch (err) {
            setError(getErrorMessage(err, '가입 요청 처리에 실패했습니다.'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full items-center justify-center px-4 py-8">
            <div className="auth-shell app-enter lg:grid-cols-[1fr_1.1fr]">
                <aside className="auth-aside hidden lg:flex lg:flex-col lg:justify-between">
                    <div className="space-y-4">
                        <span className="chip-pill">Onboarding</span>
                        <h1 className="text-3xl font-extrabold leading-tight text-slate-900">
                            조직 단위 워크스페이스를
                            <br />
                            안전하게 시작하세요.
                        </h1>
                        <p className="max-w-sm text-sm leading-relaxed text-slate-600">
                            회사 도메인 인증을 통과한 계정만 프로젝트 데이터에 접근할 수 있습니다.
                        </p>
                    </div>
                    <div className="space-y-2 text-xs text-slate-600">
                        <p>도메인 정책 기반 자동 승인/차단</p>
                        <p>이메일 인증 후 즉시 로그인 가능</p>
                    </div>
                </aside>

                <div className="p-6 sm:p-8 lg:p-10">
                    <div className="mb-6 flex items-center justify-between">
                        <Logo asLink={false} />
                        <span className="chip-pill">SIGNUP</span>
                    </div>

                    <p className="mb-6 text-sm text-muted-foreground">
                        지정된 도메인 이메일만 가입할 수 있습니다.
                    </p>

                    <form className="space-y-4" onSubmit={onSubmit}>
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-slate-700" htmlFor="full-name">이름(선택)</label>
                            <Input
                                id="full-name"
                                type="text"
                                value={fullName}
                                onChange={(event) => setFullName(event.target.value)}
                                placeholder="홍길동"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-slate-700" htmlFor="signup-email">이메일</label>
                            <Input
                                id="signup-email"
                                type="email"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                placeholder="name@company.com"
                                autoComplete="email"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-slate-700" htmlFor="signup-password">비밀번호</label>
                            <Input
                                id="signup-password"
                                type="password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                autoComplete="new-password"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-slate-700" htmlFor="signup-password-confirm">비밀번호 확인</label>
                            <Input
                                id="signup-password-confirm"
                                type="password"
                                value={passwordConfirm}
                                onChange={(event) => setPasswordConfirm(event.target.value)}
                                autoComplete="new-password"
                            />
                        </div>

                        {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
                        {result && (
                            <div className="space-y-2 rounded-md border border-primary/25 bg-primary/8 p-3 text-sm">
                                <p>{result.message || '가입 요청이 완료되었습니다.'}</p>
                                {!result.email_sent && (
                                    <p className="text-muted-foreground">
                                        SMTP 미설정으로 메일 발송이 생략되었습니다.
                                    </p>
                                )}
                                {result.debug_verify_link && (
                                    <a
                                        href={result.debug_verify_link}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="font-semibold text-primary hover:underline"
                                    >
                                        개발용 인증 링크 열기
                                    </a>
                                )}
                            </div>
                        )}

                        <Button type="submit" disabled={isLoading} className="w-full">
                            {isLoading ? '처리 중...' : '가입 요청'}
                        </Button>
                    </form>

                    <p className="mt-5 text-sm text-muted-foreground">
                        이미 계정이 있다면{' '}
                        <Link className="font-semibold text-primary hover:underline" to="/login">
                            로그인
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Signup;
