import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '../lib/utils';
import { useTheme } from '../lib/theme';

export default function ThemeToggleButton({ className = '' }) {
    const { isDark, toggleTheme } = useTheme();
    const ariaLabel = isDark ? '라이트 모드로 전환' : '다크 모드로 전환';

    return (
        <button
            type="button"
            onClick={() => toggleTheme()}
            aria-label={ariaLabel}
            title={ariaLabel}
            className={cn(
                'grid h-9 w-9 place-items-center rounded-full border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-card hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                className,
            )}
        >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
    );
}
