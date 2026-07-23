const { Router } = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { getConsumerProfile } = require('../lib/hubtel-consumer-profile');

const router = Router();

router.post('/check', authenticate, requireRole('headteacher', 'admin', 'accountant'), async (req, res) => {
  try {
    const {
      ghanaCard,
      identifierName,
      identifierNationality,
      identifierDob,
      identifierMobileNumber,
      creditAmount,
      purposeOfCheck,
      typeOfCreditFacility,
      lenderReferenceId,
      voterId,
      passportNumber,
      driverLicenseNumber,
      ssnitNumber,
      nhisNumber,
      tin,
    } = req.body;

    if (!ghanaCard || !identifierDob || !creditAmount) {
      return res.status(400).json({ error: 'ghanaCard, identifierDob, and creditAmount required' });
    }

    const apiId = process.env.CREDIT_SCORE_API_ID;
    const apiKey = process.env.CREDIT_SCORE_API_KEY;
    if (!apiId || !apiKey) {
      return res.status(503).json({ error: 'Consumer profile API not configured. Set CREDIT_SCORE_API_ID and CREDIT_SCORE_API_KEY.' });
    }

    const result = await getConsumerProfile({
      ghanaCard,
      identifierName,
      identifierNationality,
      identifierDob,
      identifierMobileNumber,
      creditAmount,
      purposeOfCheck,
      typeOfCreditFacility,
      lenderReferenceId: lenderReferenceId || `EDU-${Date.now()}`,
      voterId,
      passportNumber,
      driverLicenseNumber,
      ssnitNumber,
      nhisNumber,
      tin,
      credentials: { apiId, apiKey },
    });
    res.json(result);
  } catch (err) {
    console.error('Consumer profile error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
