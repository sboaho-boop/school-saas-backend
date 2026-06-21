const { verifyToken } = require('../lib/jwt');
const prisma = require('../lib/prisma');

async function authenticate(req, res, next) {
  let token = null;
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    token = header.split(' ')[1];
  } else if (req.cookies && req.cookies.edu_token) {
    token = req.cookies.edu_token;
  }
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    req.schoolId = user.schoolId;
    const staff = await prisma.staff.findFirst({ where: { email: user.email, schoolId: user.schoolId } });
    req.staff = staff || null;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

function requireStaffType(...types) {
  return (req, res, next) => {
    if (!req.staff || !types.includes(req.staff.staffType)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole, requireStaffType };
