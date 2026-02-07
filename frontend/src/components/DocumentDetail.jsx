import React, { useEffect, useState } from 'react';
import { api, getErrorMessage } from '../lib/api';
import { Loader2, File } from 'lucide-react';

const DocumentDetail = ({ result }) => {
    const [docDetails, setDocDetails] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!result) return;

        const fetchDetails = async () => {
            setLoading(true);
            setError('');
            try {
                const response = await api.get(`/documents/${result.doc_id}`);
                setDocDetails(response.data);
            } catch (err) {
                setError(getErrorMessage(err, 'Failed to load document details.'));
            } finally {
                setLoading(false);
            }
        };

        fetchDetails();
    }, [result]);

    if (!result) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 border rounded-lg bg-muted/10">
                <File className="h-12 w-12 mb-4 opacity-20" />
                <p>Select a document to view details</p>
            </div>
        );
    }

    return (
        <div className="bg-card border rounded-lg shadow-sm h-fit sticky top-4">
            <div className="p-4 border-b bg-muted/30">
                <h2 className="font-semibold ml-1">Document Details</h2>
            </div>

            <div className="p-4 space-y-4">
                {loading ? (
                    <div className="flex items-center justify-center py-8 text-primary">
                        <Loader2 className="h-6 w-6 animate-spin mr-2" />
                        <span>Loading details...</span>
                    </div>
                ) : error ? (
                    <div className="p-4 bg-destructive/10 text-destructive rounded-md text-sm">
                        {error}
                    </div>
                ) : (
                    <div className="space-y-4 text-sm">
                        <div className="grid grid-cols-1 gap-1">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filename</span>
                            <p className="font-medium break-all">{result.filename}</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-1">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">ID</span>
                                <p className="font-mono text-xs bg-muted p-1 rounded w-fit">{result.doc_id}</p>
                            </div>
                            <div className="grid gap-1">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</span>
                                <p className="capitalize">{docDetails?.status || 'Unknown'}</p>
                            </div>
                        </div>

                        <div className="grid gap-1">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">File Path</span>
                            <p className="text-xs font-mono text-muted-foreground bg-muted p-2 rounded break-all">
                                {docDetails?.file_path || 'Not available'}
                            </p>
                        </div>

                        {result.match_points && result.match_points.length > 0 && (
                            <div className="grid gap-2">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Match Points</span>
                                <div className="flex flex-wrap gap-2">
                                    {result.match_points.map((point, i) => (
                                        <span key={i} className="px-2 py-1 bg-accent/50 text-accent-foreground rounded-full text-xs">
                                            {point}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default DocumentDetail;
