import React from 'react';
import { cn } from '../../lib/utils';

const INPUT_COMMON_CLASS =
    'w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50';
const INPUT_BASE_CLASS = `flex h-9 ${INPUT_COMMON_CLASS}`;

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
    return (
        <input
            type={type}
            className={cn(
                INPUT_BASE_CLASS,
                className
            )}
            ref={ref}
            {...props}
        />
    );
});

Input.displayName = 'Input';

export { Input, INPUT_COMMON_CLASS, INPUT_BASE_CLASS };
