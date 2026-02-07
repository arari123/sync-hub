import React, { useCallback, useEffect, useState } from 'react';
import { Activity, Database, Server, ShieldCheck, ShieldX, Sparkles, Loader2 } from 'lucide-react';
import { api, getErrorMessage, HEALTH_POLLING_INTERVAL_MS } from '../lib/api';
import { cn } from '../lib/utils';
import { Button } from './ui/Button';

const DEPENDENCY_LABELS = {
    db: 'Database',
    elasticsearch: 'Elasticsearch',
    ocr_worker: 'OCR Worker',
};

function getHealthTone(status, healthy) {
    if (status === 'healthy' || healthy) {
        return 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/30 dark:border-green-800';
    }
    if (status === 'degraded') {
        return 'text-yellow-600 bg-yellow-50 border-yellow-200 dark:text-yellow-400 dark:bg-yellow-950/30 dark:border-yellow-800';
    }
    return 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/30 dark:border-red-800';
}

function asDependencyArray(dependencies) {
    return Object.entries(dependencies || {}).map(([key, value]) => ({
        key,
        label: DEPENDENCY_LABELS[key] || key,
        healthy: Boolean(value?.healthy),
        required: Boolean(value?.required),
        mode: value?.mode || '',
        error: value?.error || '',
    }));
}

const HealthStatus = () => {
    const [healthStatus, setHealthStatus] = useState('unknown');
    const [healthDependencies, setHealthDependencies] = useState([]);
    const [healthError, setHealthError] = useState('');
    const [isLoadingHealth, setIsLoadingHealth] = useState(false);

    const loadHealthDetails = useCallback(async () => {
        setIsLoadingHealth(true);
        setHealthError('');

        try {
            const response = await api.get('/health/detail');
            const payload = response.data || {};
            setHealthStatus(payload.status || 'unknown');
            setHealthDependencies(asDependencyArray(payload.dependencies));
        } catch (error) {
            setHealthStatus('unknown');
            setHealthDependencies([]);
            setHealthError(getErrorMessage(error, '운영 상태를 가져오지 못했습니다.'));
        } finally {
            setIsLoadingHealth(false);
        }
    }, []);

    useEffect(() => {
        loadHealthDetails();
        const intervalId = window.setInterval(loadHealthDetails, HEALTH_POLLING_INTERVAL_MS);
        return () => window.clearInterval(intervalId);
    }, [loadHealthDetails]);

    return (
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-4 text-sm">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold leading-none tracking-tight">System Health</h3>
                <Button variant="ghost" size="sm" onClick={loadHealthDetails} className="h-6 w-6 p-0">
                    {isLoadingHealth ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                </Button>
            </div>

            <div className={cn("flex items-center gap-2 p-2 rounded-md border mb-3 font-bold", getHealthTone(healthStatus, false))}>
                {healthStatus === 'healthy' ? <ShieldCheck size={16} /> : <ShieldX size={16} />}
                <span>{healthStatus.toUpperCase()}</span>
            </div>

            {healthError && <p className="text-xs text-destructive mb-2">{healthError}</p>}

            <div className="space-y-2">
                {healthDependencies.map((dependency) => (
                    <div key={dependency.key} className={cn("flex items-center justify-between p-2 rounded border", getHealthTone('', dependency.healthy))}>
                        <div className="flex items-center gap-2">
                            {dependency.key === 'db' && <Database size={14} />}
                            {dependency.key === 'elasticsearch' && <Server size={14} />}
                            {dependency.key === 'ocr_worker' && <Activity size={14} />}
                            <span>{dependency.label}</span>
                        </div>
                        <span className="text-xs font-mono">{dependency.healthy ? 'OK' : 'ERR'}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default HealthStatus;
