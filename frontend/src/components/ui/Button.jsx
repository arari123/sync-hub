import React from 'react';
import { cn } from '../../lib/utils';
import { Loader2 } from 'lucide-react';

const Button = React.forwardRef(({ className, variant = 'default', size = 'default', children, isLoading, disabled, ...props }, ref) => {
    const variants = {
        default: 'border border-primary/80 bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
        ghost: 'border border-transparent hover:border-border hover:bg-accent hover:text-accent-foreground',
        outline: 'border border-input bg-card text-foreground hover:bg-accent hover:text-accent-foreground',
        secondary: 'border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80',
    };

    const sizes = {
        default: 'h-9 px-3.5 py-2',
        sm: 'h-8 rounded-md px-3',
        lg: 'h-10 rounded-md px-6',
        icon: 'h-9 w-9',
    };

    return (
        <button
            className={cn(
                'inline-flex items-center justify-center rounded-md text-sm font-semibold tracking-tight ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50',
                variants[variant],
                sizes[size],
                className
            )}
            ref={ref}
            disabled={disabled || isLoading}
            {...props}
        >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {children}
        </button>
    );
});

Button.displayName = 'Button';

export { Button };
