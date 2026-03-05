import React from 'react';
import { Layers } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Link } from 'react-router-dom';

const Logo = ({ className, size = 'default', asLink = true, showSubtitle = true, variant = 'default' }) => {
    const isLarge = size === 'large';
    const isTopbar = variant === 'topbar';

    const content = (
        <div className={cn('inline-flex items-center select-none', isTopbar ? 'gap-2' : 'gap-2.5', className)}>
            <div className={cn(
                'relative flex items-center justify-center overflow-hidden rounded-xl border transition-all',
                isTopbar
                    ? 'h-9 w-9 border-cyan-200/70 bg-gradient-to-br from-cyan-500 via-sky-500 to-indigo-600 text-white shadow-[0_8px_18px_-10px_rgba(6,182,212,0.9)]'
                    : 'border-primary/35 bg-primary text-primary-foreground shadow-sm',
                !isTopbar && (isLarge ? 'h-12 w-12' : 'h-8 w-8')
            )}>
                {isTopbar && (
                    <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/35 via-white/10 to-transparent" />
                )}
                <span className={cn(
                    'absolute border',
                    isTopbar
                        ? 'h-6 w-6 rounded-lg border-white/30'
                        : 'rounded-full border-primary-foreground/30',
                    !isTopbar && (isLarge ? 'h-9 w-9' : 'h-6 w-6')
                )}
                />
                <Layers className={cn('relative', isLarge ? 'h-6 w-6' : 'h-4 w-4')} />
                {isTopbar && <span className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-amber-200/95" />}
            </div>
            <div className="flex flex-col leading-none">
                <span className={cn(
                    'font-extrabold text-foreground',
                    isLarge ? 'text-2xl tracking-tight' : isTopbar ? 'text-sm uppercase tracking-[0.08em]' : 'text-lg tracking-tight'
                )}>
                    Sync-Hub
                </span>
                {showSubtitle && (
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Industrial AI
                    </span>
                )}
            </div>
        </div>
    );

    if (asLink) {
        return <Link to="/home" className="transition-opacity hover:opacity-90">{content}</Link>;
    }

    return content;
};

export default Logo;
