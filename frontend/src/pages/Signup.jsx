import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, getErrorMessage } from '../lib/api';
import { isAuthenticated } from '../lib/session';

const Signup = () => {
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);

    if (isAuthenticated()) {
        return <Navigate to="/" replace />;
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
        <div className="mx-auto flex min-h-[70vh] w-full max-w-md items-center">
            <div className="w-full rounded-xl border bg-card p-6 shadow-sm">
                <h1 className="mb-2 text-2xl font-bold">메일 인증 가입</h1>
                <p className="mb-6 text-sm text-muted-foreground">
                    지정된 도메인 이메일만 가입할 수 있습니다.
                </p>

                <form className="space-y-4" onSubmit={onSubmit}>
                    <div className="space-y-1">
                        <label className="text-sm font-medium" htmlFor="full-name">이름(선택)</label>
                        <input
                            id="full-name"
                            type="text"
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                            value={fullName}
                            onChange={(event) => setFullName(event.target.value)}
                            placeholder="홍길동"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium" htmlFor="signup-email">이메일</label>
                        <input
                            id="signup-email"
                            type="email"
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="name@company.com"
                            autoComplete="email"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium" htmlFor="signup-password">비밀번호</label>
                        <input
                            id="signup-password"
                            type="password"
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            autoComplete="new-password"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium" htmlFor="signup-password-confirm">비밀번호 확인</label>
                        <input
                            id="signup-password-confirm"
                            type="password"
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                            value={passwordConfirm}
                            onChange={(event) => setPasswordConfirm(event.target.value)}
                            autoComplete="new-password"
                        />
                    </div>

                    {error && <p className="text-sm text-destructive">{error}</p>}
                    {result && (
                        <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
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
                                    className="font-medium text-primary hover:underline"
                                >
                                    개발용 인증 링크 열기
                                </a>
                            )}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isLoading ? '처리 중...' : '가입 요청'}
                    </button>
                </form>

                <p className="mt-4 text-sm text-muted-foreground">
                    이미 계정이 있다면{' '}
                    <Link className="font-medium text-primary hover:underline" to="/login">
                        로그인
                    </Link>
                </p>
            </div>
        </div>
    );
};

export default Signup;
