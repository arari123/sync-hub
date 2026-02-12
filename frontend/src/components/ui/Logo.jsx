import React from 'react';
import { Layers, Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Link } from 'react-router-dom';

const Logo = ({ className, size = 'default', asLink = true }) => {
    const isLarge = size === 'large';

    const content = (
        <div className={cn("inline-flex items-center gap-2 select-none", className)}>
            <div className={cn(
                "relative flex items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-all",
                isLarge ? "h-12 w-12" : "h-8 w-8"
            )}>
                <Layers className={cn("absolute", isLarge ? "h-6 w-6" : "h-4 w-4")} />
                <Sparkles className={cn(
                    "absolute text-blue-200 animate-pulse",
                    isLarge ? "-top-1 -right-1 h-4 w-4" : "-top-0.5 -right-0.5 h-2.5 w-2.5"
                )} />
            </div>
            <div className="flex flex-col leading-none">
                <span className={cn("font-bold tracking-tight text-foreground", isLarge ? "text-2xl" : "text-lg")}>
                    Sync-Hub
                </span>
            </div>
        </div>
    );

    if (asLink) {
        return <Link to="/home" className="hover:opacity-90 transition-opacity">{content}</Link>;
    }

    return content;
};

export default Logo;
