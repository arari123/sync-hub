import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';

const BudgetBreadcrumb = ({ items = [], className = '' }) => (
    <nav
        className={cn('mb-3 flex items-center gap-1 whitespace-nowrap text-[11px] text-muted-foreground', className)}
        aria-label="breadcrumb"
    >
        {items.map((item, index) => (
            <React.Fragment key={`${item.label}-${index}`}>
                {index > 0 && <ChevronRight className="h-3 w-3 shrink-0" />}
                {item.to ? (
                    <Link to={item.to} className="shrink-0 whitespace-nowrap hover:text-foreground">
                        {item.label}
                    </Link>
                ) : (
                    <span className="shrink-0 whitespace-nowrap text-foreground">{item.label}</span>
                )}
            </React.Fragment>
        ))}
    </nav>
);

export default BudgetBreadcrumb;
