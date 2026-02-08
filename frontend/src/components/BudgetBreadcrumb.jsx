import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';

const BudgetBreadcrumb = ({ items = [], className = '' }) => (
    <nav
        className={cn('mb-3 overflow-x-auto text-[11px] text-muted-foreground', className)}
        aria-label="breadcrumb"
    >
        <div className="flex min-w-max items-center gap-1 whitespace-nowrap">
            {items.map((item, index) => (
                <React.Fragment key={`${item.label}-${index}`}>
                    {index > 0 && <ChevronRight className="h-3 w-3 shrink-0" />}
                    {item.to ? (
                        <Link to={item.to} className="shrink-0 hover:text-foreground">
                            {item.label}
                        </Link>
                    ) : (
                        <span className="shrink-0 text-foreground">{item.label}</span>
                    )}
                </React.Fragment>
            ))}
        </div>
    </nav>
);

export default BudgetBreadcrumb;
