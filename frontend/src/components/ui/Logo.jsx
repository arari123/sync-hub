import React from 'react';
import { Layers } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Link } from 'react-router-dom';

const Logo = ({ className, size = 'default', asLink = true }) => {
    const isLarge = size === 'large';

    const content = (
        <div className={cn('inline-flex items-center gap-2.5 select-none', className)}>
            <div className={cn(
                'relative flex items-center justify-center rounded-xl border border-primary/35 bg-primary text-primary-foreground shadow-sm transition-all',
                isLarge ? 'h-12 w-12' : 'h-8 w-8'
            )}>
                <span className={cn(
                    'absolute rounded-full border border-primary-foreground/30',
                    isLarge ? 'h-9 w-9' : 'h-6 w-6'
                )}
                />
                <Layers className={cn('relative', isLarge ? 'h-6 w-6' : 'h-4 w-4')} />
            </div>
            <div className="flex flex-col leading-none">
                <span className={cn('font-extrabold tracking-tight text-foreground', isLarge ? 'text-2xl' : 'text-lg')}>
                    Sync-Hub
                </span>
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Industrial AI
                </span>
            </div>
        </div>
    );

    if (asLink) {
        return <Link to="/home" className="transition-opacity hover:opacity-90">{content}</Link>;
    }

    return content;
};

export default Logo;
