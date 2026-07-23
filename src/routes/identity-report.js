const { Router } = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { getIdentityReport } = require('../lib/hubtel-identity-report');

const router = Router();

router.post('/check', authenticate, requireRole('headteacher', 'admin', 'accountant'), async (req, res) => {
  try {
    const {
      nationalIds,
      names,
      numberAndEmail,
      dateOfBirth,
      gender,
      reasonForRequest,
      requestVerification,
      ghanaCardNumber,
      identitySource,
      reportType,
    } = req.body;

    if (!nationalIds || !names || !numberAndEmail || !dateOfBirth || !gender || !ghanaCardNumber) {
      return res.status(400).json({ error: 'nationalIds, names, numberAndEmail, dateOfBirth, gender, and ghanaCardNumber required' });
    }

    const apiId = process.env.CREDIT_SCORE_API_ID;
    const apiKey = process.env.CREDIT_SCORE_API_KEY;
    if (!apiId || !apiKey) {
      return res.status(503).json({ error: 'Identity report API not configured. Set CREDIT_SCORE_API_ID and CREDIT_SCORE_API_KEY.' });
    }

    const result = await getIdentityReport({
      nationalIds,
      names,
      numberAndEmail,
      dateOfBirth,
      gender,
      reasonForRequest: reasonForRequest || 'KYC',
      requestVerification: requestVerification !== false,
      ghanaCardNumber,
      identitySource: identitySource || 'General Report',
      reportType: reportType || 'CreditReport',
      requestedBy: req.user.name || req.user.email || 'Admin',
      credentials: { apiId, apiKey },
    });
    res.json(result);
  } catch (err) {
    console.error('Identity report error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
