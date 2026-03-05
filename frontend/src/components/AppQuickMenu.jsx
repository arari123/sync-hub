import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Database, Grid2x2, Plus } from 'lucide-react';
import { cn } from '../lib/utils';

export default function AppQuickMenu({ className }) {
    const [isOpen, setIsOpen] = useState(false);
    const rootRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return undefined;
        const onPointerDown = (event) => {
            if (!rootRef.current) return;
            if (rootRef.current.contains(event.target)) return;
            setIsOpen(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
        };
    }, [isOpen]);

    return (
        <div className={cn('relative z-[70]', className)} ref={rootRef}>
            <button
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                className="grid h-9 w-9 place-items-center rounded-full border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-card hover:text-primary"
                aria-label="빠른 메뉴"
                aria-expanded={isOpen}
            >
                <Grid2x2 className="h-4 w-4" />
            </button>

            {isOpen && (
                <div className="app-surface-soft absolute right-0 top-11 z-[90] w-60 p-3">
                    <div className="grid grid-cols-2 gap-2">
                        <Link
                            to="/project-management/projects/new"
                            onClick={() => setIsOpen(false)}
                            className="flex flex-col items-center gap-1 rounded-xl border border-border/70 bg-card/65 p-3 text-foreground transition-colors hover:bg-secondary"
                        >
                            <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
                                <Plus className="h-4 w-4" />
                            </span>
                            <span className="text-center text-xs font-semibold">새 프로젝트 생성</span>
                        </Link>

                        <Link
                            to="/data-hub"
                            onClick={() => setIsOpen(false)}
                            className="flex flex-col items-center gap-1 rounded-xl border border-border/70 bg-card/65 p-3 text-foreground transition-colors hover:bg-secondary"
                        >
                            <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-muted-foreground">
                                <Database className="h-4 w-4" />
                            </span>
                            <span className="text-center text-xs font-semibold">데이터 허브</span>
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}
