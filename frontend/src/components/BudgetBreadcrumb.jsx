import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const BudgetBreadcrumb = ({ items = [] }) => (
    <nav className="mb-3 flex items-center gap-1 text-[11px] text-muted-foreground" aria-label="breadcrumb">
        {items.map((item, index) => (
            <React.Fragment key={`${item.label}-${index}`}>
                {index > 0 && <ChevronRight className="h-3 w-3" />}
                {item.to ? (
                    <Link to={item.to} className="hover:text-foreground">
                        {item.label}
                    </Link>
                ) : (
                    <span className="text-foreground">{item.label}</span>
                )}
            </React.Fragment>
        ))}
    </nav>
);

export default BudgetBreadcrumb;
