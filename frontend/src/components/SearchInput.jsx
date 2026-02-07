import React, { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';

const SearchInput = ({ initialQuery = '', className, autoFocus }) => {
    const [query, setQuery] = useState(initialQuery);
    const navigate = useNavigate();

    const handleSearch = (e) => {
        e.preventDefault();
        if (query.trim()) {
            navigate(`/search?q=${encodeURIComponent(query)}`);
        }
    };

    return (
        <form onSubmit={handleSearch} className={cn("relative w-full max-w-2xl mx-auto flex items-center", className)}>
            <div className="relative w-full">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-muted-foreground">
                    <Search className="h-5 w-5" />
                </div>
                <Input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="What are you looking for?"
                    className="pl-10 h-12 rounded-full shadow-sm hover:shadow-md transition-shadow border-muted-foreground/20 text-lg"
                    autoFocus={autoFocus}
                />
            </div>
        </form>
    );
};

export default SearchInput;
