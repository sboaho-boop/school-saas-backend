const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'fallback-secret';

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role, schoolId: user.schoolId }, SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { signToken, verifyToken };
