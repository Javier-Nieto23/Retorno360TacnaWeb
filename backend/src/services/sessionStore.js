const crypto = require('crypto');

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const parsedTimeoutMs = Number.parseInt(process.env.SESSION_TIMEOUT_MS || '', 10);
const SESSION_TIMEOUT_MS = Number.isFinite(parsedTimeoutMs) && parsedTimeoutMs > 0
    ? parsedTimeoutMs
    : DEFAULT_TIMEOUT_MS;

const sessions = new Map();

function cleanupExpiredSessions(now = Date.now()) {
    for (const [token, session] of sessions.entries()) {
        if (now >= session.expiresAt) {
            sessions.delete(token);
        }
    }
}

function createSession(userId) {
    const now = Date.now();
    cleanupExpiredSessions(now);

    const token = crypto.randomBytes(48).toString('hex');
    const issuedAt = now;
    const expiresAt = issuedAt + SESSION_TIMEOUT_MS;

    sessions.set(token, {
        userId: Number(userId),
        issuedAt,
        expiresAt,
    });

    return {
        token,
        issuedAt,
        expiresAt,
        timeoutMs: SESSION_TIMEOUT_MS,
    };
}

function validateSession(userId, token) {
    const normalizedUserId = Number(userId);
    const normalizedToken = String(token || '').trim();

    if (!normalizedUserId || !normalizedToken) {
        return { valid: false, reason: 'missing' };
    }

    const session = sessions.get(normalizedToken);
    if (!session) {
        return { valid: false, reason: 'invalid' };
    }

    if (session.userId !== normalizedUserId) {
        sessions.delete(normalizedToken);
        return { valid: false, reason: 'invalid' };
    }

    if (Date.now() >= session.expiresAt) {
        sessions.delete(normalizedToken);
        return { valid: false, reason: 'expired' };
    }

    return { valid: true, session };
}

function destroySession(token) {
    const normalizedToken = String(token || '').trim();
    if (normalizedToken) {
        sessions.delete(normalizedToken);
    }
}

module.exports = {
    SESSION_TIMEOUT_MS,
    createSession,
    validateSession,
    destroySession,
};
