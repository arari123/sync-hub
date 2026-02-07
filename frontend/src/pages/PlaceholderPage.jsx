import React from 'react';
import { Wrench } from 'lucide-react';

const PlaceholderPage = ({ title = '준비 중', description = '이 페이지는 준비 중입니다.' }) => {
    return (
        <section className="mx-auto max-w-3xl rounded-2xl border bg-card p-8 shadow-sm">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Wrench className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        </section>
    );
};

export default PlaceholderPage;
