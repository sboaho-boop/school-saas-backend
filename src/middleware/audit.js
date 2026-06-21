const prisma = require('../lib/prisma');

const SENSITIVE_KEYS = ['password', 'token', 'twoFactorSecret', 'verificationCode', 'otp', 'secret'];

function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const sanitized = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const key of Object.keys(sanitized)) {
    if (SENSITIVE_KEYS.includes(key)) { sanitized[key] = '[REDACTED]'; continue; }
    if (typeof sanitized[key] === 'object') sanitized[key] = sanitize(sanitized[key]);
  }
  return sanitized;
}

async function logAudit(req, action, resource, resourceId, details = '') {
  try {
    const clean = typeof details === 'object' ? sanitize(details) : details;
    await prisma.auditLog.create({
      data: {
        schoolId: req.schoolId,
        userId: req.user.id,
        userName: req.user.name,
        action,
        resource,
        resourceId,
        details: typeof clean === 'object' ? JSON.stringify(clean) : String(clean),
      },
    });
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

function audit(action, resource) {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = function (body) {
      const resourceId = req.params.id || body?.id || '';
      logAudit(req, action, resource, resourceId, { body: req.body, result: body });
      return originalJson(body);
    };
    next();
  };
}

module.exports = { audit, logAudit };
