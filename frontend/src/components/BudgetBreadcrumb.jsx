import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const BudgetBreadcrumb = ({ items = [] }) => (
    <nav className="min-w-0 flex items-center gap-1.5 text-sm text-muted-foreground" aria-label="breadcrumb">
        {items.map((item, index) => (
            <React.Fragment key={`${item.label}-${index}`}>
                {index > 0 && <ChevronRight className="h-3 w-3" />}
                {item.to ? (
                    <Link to={item.to} className="font-medium hover:text-primary">
                        {item.label}
                    </Link>
                ) : (
                    <span className="font-semibold text-foreground/90">{item.label}</span>
                )}
            </React.Fragment>
        ))}
    </nav>
);

export default BudgetBreadcrumb;
