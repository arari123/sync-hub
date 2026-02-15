import { api } from './api';

function toFilenameFromDisposition(disposition) {
    if (!disposition) return '';
    const value = String(disposition);

    const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match && utf8Match[1]) {
        try {
            return decodeURIComponent(utf8Match[1]);
        } catch (error) {
            return utf8Match[1];
        }
    }

    const plainMatch = value.match(/filename=\"?([^\";]+)\"?/i);
    return plainMatch && plainMatch[1] ? plainMatch[1] : '';
}

export async function downloadFromApi(endpoint, preferredFilename) {
    const response = await api.get(endpoint, { responseType: 'blob' });
    const blob = response.data;

    const headerName =
        preferredFilename ||
        toFilenameFromDisposition(response.headers?.['content-disposition']) ||
        'download';

    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = headerName;
    document.body.appendChild(link);
    link.click();
    link.remove();

    // Revoke async to avoid interfering with download in some browsers.
    window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 2500);
}

