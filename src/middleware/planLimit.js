const prisma = require('../lib/prisma');

const PLANS = {
  free: { studentLimit: 30, staffLimit: 10 },
  pro: { studentLimit: 200, staffLimit: 50 },
  enterprise: { studentLimit: 999999, staffLimit: 999999 },
};

function checkPlanLimit(resource) {
  return async (req, res, next) => {
    try {
      const sub = await prisma.subscription.findUnique({ where: { schoolId: req.schoolId } });
      if (!sub) return next();
      const limits = PLANS[sub.plan] || PLANS.free;

      if (resource === 'student') {
        const count = await prisma.student.count({ where: { schoolId: req.schoolId } });
        if (count >= limits.studentLimit) {
          return res.status(403).json({
            error: `Plan limit reached. You can only have ${limits.studentLimit} students on the ${sub.plan} plan. Upgrade to add more.`,
          });
        }
      }

      if (resource === 'staff') {
        const count = await prisma.staff.count({ where: { schoolId: req.schoolId } });
        if (count >= limits.staffLimit) {
          return res.status(403).json({
            error: `Plan limit reached. You can only have ${limits.staffLimit} staff members on the ${sub.plan} plan. Upgrade to add more.`,
          });
        }
      }

      next();
    } catch (err) {
      console.error('Plan limit check error:', err);
      next();
    }
  };
}

module.exports = { checkPlanLimit };
