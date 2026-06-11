const prisma = require('../lib/prisma');

async function logAudit(req, action, resource, resourceId, details = '') {
  try {
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        userName: req.user.name,
        action,
        resource,
        resourceId,
        details: typeof details === 'object' ? JSON.stringify(details) : String(details),
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
