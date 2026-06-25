function normalizeRazonSocialId(value) {
    if (value === null || typeof value === 'undefined') return null;
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function extractCandidate(source) {
    if (source === null || typeof source === 'undefined') return null;

    if (typeof source === 'object') {
        return (
            source.razon_social_id
            ?? source.razonSocialId
            ?? source.id_razon_social
            ?? source.razonSocial?.id
            ?? null
        );
    }

    return source;
}

export function detectRazonSocialId(...sources) {
    for (const source of sources) {
        const candidate = extractCandidate(source);
        const normalized = normalizeRazonSocialId(candidate);
        if (normalized) {
            return String(normalized);
        }
    }
    return '—';
}
