const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const {
  queryMsirdnName,
  queryMobileMoney,
  verifyGhanaCard,
  verifyVoterId,
  verifyChenosis,
  verifyBankAccount,
  BANK_CODES,
} = require('../lib/hubtel-verification');

const router = Router();

router.get('/msisdn/:phone', authenticate, async (req, res) => {
  try {
    const { phone } = req.params;
    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    const result = await queryMsirdnName({
      phone,
      accountNumber: school.hubtelMerchantAccount,
      credentials: { clientId: school.hubtelSmsClientId || school.hubtelClientId, clientSecret: school.hubtelSmsClientSecret || school.hubtelClientSecret },
    });
    res.json(result);
  } catch (err) {
    console.error('MSISDN query error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/mobile-money/:phone', authenticate, async (req, res) => {
  try {
    const { phone } = req.params;
    const { channel } = req.query;
    if (!channel) return res.status(400).json({ error: 'channel query param required (mtn, vodafone, airteltigo)' });

    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    const result = await queryMobileMoney({
      phone,
      channel,
      accountNumber: school.hubtelMerchantAccount,
      credentials: { clientId: school.hubtelSmsClientId || school.hubtelClientId, clientSecret: school.hubtelSmsClientSecret || school.hubtelClientSecret },
    });
    res.json(result);
  } catch (err) {
    console.error('Mobile money verify error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/ghana-card', authenticate, async (req, res) => {
  try {
    const { ghanaCardNumber, surname, firstnames, gender, dateOfBirth } = req.body;
    if (!ghanaCardNumber || !surname || !firstnames || !gender || !dateOfBirth) {
      return res.status(400).json({ error: 'ghanaCardNumber, surname, firstnames, gender, and dateOfBirth required' });
    }

    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    const result = await verifyGhanaCard({
      ghanaCardNumber, surname, firstnames, gender, dateOfBirth,
      accountNumber: school.hubtelMerchantAccount,
      credentials: { clientId: school.hubtelSmsClientId || school.hubtelClientId, clientSecret: school.hubtelSmsClientSecret || school.hubtelClientSecret },
    });
    res.json(result);
  } catch (err) {
    console.error('Ghana Card verify error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/voter-id', authenticate, async (req, res) => {
  try {
    const { voterIdCardNumber, surname, othernames, sex, dateOfBirth } = req.body;
    if (!voterIdCardNumber || !surname || !othernames || !sex || !dateOfBirth) {
      return res.status(400).json({ error: 'voterIdCardNumber, surname, othernames, sex, and dateOfBirth required' });
    }

    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    const result = await verifyVoterId({
      voterIdCardNumber, surname, othernames, sex, dateOfBirth,
      accountNumber: school.hubtelMerchantAccount,
      credentials: { clientId: school.hubtelSmsClientId || school.hubtelClientId, clientSecret: school.hubtelSmsClientSecret || school.hubtelClientSecret },
    });
    res.json(result);
  } catch (err) {
    console.error('Voter ID verify error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/chenosis/:phone', authenticate, async (req, res) => {
  try {
    const { phone } = req.params;
    const { consentType } = req.query;

    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    const result = await verifyChenosis({
      phone,
      consentType: consentType || 'sms',
      accountNumber: school.hubtelMerchantAccount,
      credentials: { clientId: school.hubtelSmsClientId || school.hubtelClientId, clientSecret: school.hubtelSmsClientSecret || school.hubtelClientSecret },
    });
    res.json(result);
  } catch (err) {
    console.error('Chenosis verify error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/bank-account/:bankCode/:accountNumber', authenticate, async (req, res) => {
  try {
    const { bankCode, accountNumber: bankAccountNumber } = req.params;

    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    if (!school) return res.status(404).json({ error: 'School not found' });

    const result = await verifyBankAccount({
      bankCode,
      bankAccountNumber,
      accountNumber: school.hubtelMerchantAccount,
      credentials: { clientId: school.hubtelSmsClientId || school.hubtelClientId, clientSecret: school.hubtelSmsClientSecret || school.hubtelClientSecret },
    });
    res.json(result);
  } catch (err) {
    console.error('Bank account verify error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/bank-codes', authenticate, (req, res) => {
  res.json(BANK_CODES);
});

module.exports = router;
