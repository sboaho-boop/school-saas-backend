const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');

const router = Router();

router.get('/hubtel', authenticate, async (req, res) => {
  try {
    const school = await prisma.school.findUnique({
      where: { id: req.schoolId },
      select: {
        hubtelClientId: true,
        hubtelClientSecret: true,
        hubtelMerchantAccount: true,
        hubtelDisbursementAccount: true,
        hubtelSmsClientId: true,
        hubtelSmsClientSecret: true,
      },
    });
    if (!school) return res.status(404).json({ error: 'School not found' });
    res.json({ credentials: school });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/hubtel', authenticate, requireRole('headteacher', 'admin', 'accountant'), async (req, res) => {
  try {
    const { hubtelClientId, hubtelClientSecret, hubtelMerchantAccount, hubtelDisbursementAccount, hubtelSmsClientId, hubtelSmsClientSecret } = req.body;
    const school = await prisma.school.update({
      where: { id: req.schoolId },
      data: {
        hubtelClientId: hubtelClientId || '',
        hubtelClientSecret: hubtelClientSecret || '',
        hubtelMerchantAccount: hubtelMerchantAccount || '',
        hubtelDisbursementAccount: hubtelDisbursementAccount || '',
        hubtelSmsClientId: hubtelSmsClientId || '',
        hubtelSmsClientSecret: hubtelSmsClientSecret || '',
      },
      select: {
        hubtelClientId: true,
        hubtelClientSecret: true,
        hubtelMerchantAccount: true,
        hubtelDisbursementAccount: true,
        hubtelSmsClientId: true,
        hubtelSmsClientSecret: true,
      },
    });
    res.json({ message: 'Hubtel credentials saved', credentials: school });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
