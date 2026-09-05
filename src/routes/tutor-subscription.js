const { Router } = require('express');
const prisma = require('../lib/prisma');
const { authenticateTutor } = require('./tutor-auth');
const { PLANS, LIMITS } = require('../lib/tutor-plans');
const {
  preapprovalInitiate,
  preapprovalVerifyOtp,
  preapprovalStatus,
  preapprovalCancel,
} = require('../lib/hubtel-direct-debit');
const { createCheckout } = require('../lib/hubtel-payment');
const { publicBaseUrl, publicFrontendUrl } = require('../lib/urls');

const router = Router();

const CHANNELS = ['mtn-gh', 'vodafone-gh'];

const isApproved = (status) => /APPROVED|ACTIVE|SUCCESS|AUTHORIZED/i.test(status || '');
const isSuccessResponse = (code) => {
  const c = String(code || '');
  return c === '0000' || /^succ/i.test(c) || '2000' === c;
};

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  return digits.startsWith('233') ? digits : `233${digits.replace(/^0/, '')}`;
}

async function activatePlan(userId, plan) {
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  return prisma.tutorUser.update({
    where: { id: userId },
    data: {
      plan,
      subscriptionStart: now,
      subscriptionEnd: periodEnd,
      dailyUsage: 0,
      dailyUsageDate: '',
      hubtelPreapprovalStatus: 'APPROVED',
    },
  });
}

function getHubtelCredentials() {
  const clientId = process.env.HUBTEL_CLIENT_ID || '';
  const clientSecret = process.env.HUBTEL_CLIENT_SECRET || '';
  const collectionAccount = process.env.HUBTEL_MERCHANT_ACCOUNT || '';
  if (!clientId || !clientSecret || !collectionAccount) {
    throw new Error('Hubtel credentials are not configured in the environment');
  }
  return { hubtelClientId: clientId, hubtelClientSecret: clientSecret, hubtelMerchantAccount: collectionAccount };
}

router.get('/plans', (req, res) => {
  res.json({
    pro: { id: 'pro', name: PLANS.pro.name, priceGHS: PLANS.pro.amount, interval: PLANS.pro.interval },
    unlimited: { id: 'unlimited', name: PLANS.unlimited.name, priceGHS: PLANS.unlimited.amount, interval: PLANS.unlimited.interval },
  });
});

// 1. User pays by Mobile Money: initiate a Hubtel direct-debit preapproval.
router.post('/init', authenticateTutor, async (req, res) => {
  try {
    const { plan, phone, channel } = req.body;
    if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan. Use "pro" or "unlimited".' });
    if (!phone || !CHANNELS.includes(channel)) {
      return res.status(400).json({ error: 'Phone and channel required (mtn-gh or vodafone-gh).' });
    }

    const user = await prisma.tutorUser.findUnique({
      where: { id: req.userId },
      select: { id: true, name: true, email: true, plan: true, hubtelPreapprovalStatus: true, hubtelClientReference: true },
    });
    if (!user) return res.status(404).json({ error: 'Account not found' });

    const msisdn = normalizePhone(phone);
    const clientReferenceId = `TKSUB-${user.id}-${Date.now()}`;

    const result = await preapprovalInitiate({
      phone: msisdn,
      channel,
      callbackUrl: `${publicBaseUrl(req)}/api/tutor/subscription/webhook/preapproval`,
      clientReferenceId,
      schoolCredentials: getHubtelCredentials(),
    });

    if (String(result.responseCode) !== '2000') {
      return res.status(400).json({ error: result.message || 'Could not start the approval. Check the number and try again.', code: result.responseCode });
    }

    // paystackPlan is reused as a "pending plan" during the Hubtel approval flow.
    await prisma.tutorUser.update({
      where: { id: user.id },
      data: {
        paystackPlan: plan,
        hubtelPhone: msisdn,
        hubtelChannel: channel,
        hubtelPreApprovalId: result.data?.hubtelPreApprovalId || null,
        hubtelClientReference: clientReferenceId,
        hubtelPreapprovalStatus: 'PENDING',
      },
    });

    res.json({
      message: result.data?.verificationType === 'USSD'
        ? 'Approval request sent to your phone. Approve it to continue.'
        : 'An OTP has been sent to your phone. Enter it below.',
      verificationType: result.data?.verificationType,
      otpPrefix: result.data?.otpPrefix || null,
      hubtelPreApprovalId: result.data?.hubtelPreApprovalId,
      clientReferenceId,
    });
  } catch (err) {
    console.error('Subscription init error:', err.message);
    res.status(500).json({ error: err.message || 'Could not start the payment.' });
  }
});

// 1b. Web Checkout alternative: create a hosted Hubtel checkout session
//     (customer pays immediately via MoMo/card on pay.hubtel.com). No
//     Direct Debit/Preapproval needed, works with standard payment keys.
router.post('/checkout/init', authenticateTutor, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan. Use "pro" or "unlimited".' });

    const user = await prisma.tutorUser.findUnique({
      where: { id: req.userId },
      select: { id: true, name: true, email: true },
    });
    if (!user) return res.status(404).json({ error: 'Account not found' });

    const userKey = String(user.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(-6);
    const reference = `TKCHK-${Date.now().toString(36)}${userKey}`.slice(0, 32);
    const checker = createCheckout({
      amount: PLANS[plan].amount,
      title: PLANS[plan].name + ' Subscription',
      description: `${PLANS[plan].name} subscription for ${PLANS[plan].interval} (GHS ${PLANS[plan].amount})`,
      clientReference: reference,
      payeeName: user.name || '',
      payeeEmail: user.email || '',
      callbackUrl: `${publicBaseUrl(req)}/api/tutor/subscription/webhook/checkout`,
      returnUrl: `${publicFrontendUrl()}/tutor/dashboard?billing=success`,
      cancellationUrl: `${publicFrontendUrl()}/tutor/dashboard?billing=cancelled`,
      schoolCredentials: getHubtelCredentials(),
    });

    const result = await checker;
    if (!result.checkoutUrl) {
      return res.status(502).json({ error: 'Hubtel did not return a checkout URL.' });
    }

    await prisma.tutorUser.update({
      where: { id: user.id },
      data: {
        paystackPlan: plan,
        hubtelClientReference: reference,
        hubtelPreapprovalStatus: 'PENDING',
      },
    });

    res.json({ success: true, checkoutUrl: result.checkoutUrl, checkoutId: result.checkoutId, clientReference: reference });
  } catch (err) {
    console.error('Subscription checkout init error:', err.message);
    res.status(500).json({ error: err.message || 'Could not start the payment.' });
  }
});

// 1c. Web Checkout webhook: confirmed payment activates the plan for a month.
router.post('/webhook/checkout', async (req, res) => {
  try {
    const data = req.body.Data || req.body || {};
    const clientReference = data.ClientReference || data.clientReference || data.OrderId || data.CheckoutId;
    const status = String(data.Status || data.status || data.Message || '').toUpperCase();
    const code = String(data.ResponseCode || data.responseCode || '');
    const paid = code === '0000' || /SUCCESS|COMPLETED|PAID/i.test(status);

    if (clientReference && String(clientReference).startsWith('TKCHK-')) {
      if (paid) {
        const user = await prisma.tutorUser.findUnique({ where: { hubtelClientReference: clientReference } });
        const plan = user?.paystackPlan && PLANS[user.paystackPlan] ? user.paystackPlan : 'pro';
        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 1);
        await prisma.tutorUser.update({
          where: { id: user.id },
          data: {
            plan,
            subscriptionStart: now,
            subscriptionEnd: periodEnd,
            dailyUsage: 0,
            dailyUsageDate: '',
            hubtelPreapprovalStatus: 'APPROVED',
          },
        });
        console.log(`Tutor checkout paid: ${clientReference} -> ${plan}`);
      } else {
        console.log(`Tutor checkout not paid: ${clientReference} (${status || code})`);
      }
    }
    res.status(200).json({ message: 'OK' });
  } catch (err) {
    console.error('Tutor checkout webhook error:', err.message);
    res.status(200).json({ message: 'OK' });
  }
});

// 2. Verify OTP (if the flow uses one) and activate the plan once approved.
router.post('/confirm', authenticateTutor, async (req, res) => {
  try {
    const { otpCode } = req.body;
    const user = await prisma.tutorUser.findUnique({ where: { id: req.userId } });
    if (!user?.hubtelClientReference) return res.status(400).json({ error: 'Start a subscription first.' });

    if (otpCode) {
      const otpResult = await preapprovalVerifyOtp({
        phone: user.hubtelPhone,
        hubtelPreApprovalId: user.hubtelPreApprovalId,
        clientReferenceId: user.hubtelClientReference,
        otpCode,
        schoolCredentials: getHubtelCredentials(),
      });
      if (!isSuccessResponse(otpResult.responseCode)) {
        return res.status(400).json({ error: otpResult.message || 'OTP verification failed', code: otpResult.responseCode });
      }
    }

    const statusResult = await preapprovalStatus({
      clientReferenceId: user.hubtelClientReference,
      schoolCredentials: getHubtelCredentials(),
    });
    const status = statusResult.data?.preapprovalStatus || statusResult.data?.status || '';

    if (isApproved(status)) {
      const plan = user.paystackPlan && PLANS[user.paystackPlan] ? user.paystackPlan : 'pro';
      await activatePlan(user.id, plan);
      const { subscriptionEnd } = await prisma.tutorUser.findUnique({ where: { id: user.id } });
      return res.json({ success: true, plan, subscriptionEnd });
    }

    res.json({ success: false, pending: true, preapprovalStatus: status, message: 'Approval not confirmed yet. Check your phone and try again.' });
  } catch (err) {
    console.error('Subscription confirm error:', err.message);
    res.status(500).json({ error: err.message || 'Could not confirm the payment.' });
  }
});

// 2b. Read-only check of the preapproval status (used to poll after approving).
router.get('/preapproval-status', authenticateTutor, async (req, res) => {
  try {
    const user = await prisma.tutorUser.findUnique({ where: { id: req.userId } });
    if (!user?.hubtelClientReference) return res.json({ preapprovalStatus: 'NONE', plan: user?.plan || 'free' });

    const statusResult = await preapprovalStatus({
      clientReferenceId: user.hubtelClientReference,
      schoolCredentials: getHubtelCredentials(),
    });
    const status = statusResult.data?.preapprovalStatus || statusResult.data?.status || 'PENDING';

    if (isApproved(status) && user.plan === 'free') {
      const plan = user.paystackPlan && PLANS[user.paystackPlan] ? user.paystackPlan : 'pro';
      await activatePlan(user.id, plan);
      const updated = await prisma.tutorUser.findUnique({ where: { id: user.id } });
      return res.json({ preapprovalStatus: status, plan: updated.plan, subscriptionEnd: updated.subscriptionEnd });
    }

    await prisma.tutorUser.update({
      where: { id: user.id },
      data: { hubtelPreapprovalStatus: status === 'NONE' ? 'PENDING' : status },
    }).catch(() => {});

    res.json({ preapprovalStatus: status, plan: user.plan });
  } catch (err) {
    console.error('Preapproval status error:', err.message);
    res.status(500).json({ error: err.message || 'Could not check payment status.' });
  }
});

// 3. Cancel auto-renewal (the current paid period stays active).
router.post('/cancel', authenticateTutor, async (req, res) => {
  try {
    const user = await prisma.tutorUser.findUnique({ where: { id: req.userId } });
    if (user?.hubtelPhone) {
      await preapprovalCancel({ phone: user.hubtelPhone, schoolCredentials: getHubtelCredentials() }).catch(() => {});
    }
    await prisma.tutorUser.update({
      where: { id: req.userId },
      data: { hubtelPreapprovalStatus: 'CANCELLED' },
    });
    res.json({ success: true, message: 'Auto-renewal cancelled. Your current plan stays until it expires.' });
  } catch (err) {
    console.error('Subscription cancel error:', err.message);
    res.status(500).json({ error: err.message || 'Could not cancel.' });
  }
});

// Hubtel preapproval webhook (approval lifecycle).
router.post('/webhook/preapproval', async (req, res) => {
  try {
    const data = req.body;
    const clientReference = data.ClientReferenceId || data.ClientReference;
    if (clientReference && String(clientReference).startsWith('TKSUB-')) {
      await prisma.tutorUser.updateMany({
        where: { hubtelClientReference: clientReference },
        data: { hubtelPreapprovalStatus: data.PreapprovalStatus || data.Status || data.preapprovalStatus || 'UNKNOWN' },
      });
      console.log(`Tutor preapproval ${clientReference}: ${data.PreapprovalStatus}`);
    }
    res.status(200).json({ message: 'OK' });
  } catch (err) {
    console.error('Tutor preapproval webhook error:', err.message);
    res.status(200).json({ message: 'OK' });
  }
});

// Hubtel charge webhook (auto-renewal success extends the plan by one month).
router.post('/webhook/charge', async (req, res) => {
  try {
    const data = req.body.Data || req.body;
    const clientReference = data.ClientReference || data.OrderId || data.ClientReferenceId;
    const status = data.Status || data.Message || '';
    const code = String(data.ResponseCode || '');
    const charged = code === '0000' || /success/i.test(status);

    if (clientReference && String(clientReference).startsWith('TKCHG-')) {
      const parts = String(clientReference).split('-');
      const plan = parts[1];
      const userId = parts[2];
      if (charged) {
        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 1);
        await prisma.tutorUser.update({
          where: { id: userId },
          data: {
            plan: PLANS[plan] ? plan : undefined,
            subscriptionStart: now,
            subscriptionEnd: periodEnd,
            dailyUsage: 0,
            dailyUsageDate: '',
            hubtelRenewalReference: null,
          },
        });
        console.log(`Tutor renewal charged: ${clientReference}`);
      } else {
        await prisma.tutorUser.update({
          where: { id: userId },
          data: { hubtelRenewalReference: null },
        }).catch(() => {});
      }
    }
    res.status(200).json({ message: 'OK' });
  } catch (err) {
    console.error('Tutor charge webhook error:', err.message);
    res.status(200).json({ message: 'OK' });
  }
});

// Current plan + usage status (also surfaces auto-renew info).
router.get('/status', authenticateTutor, async (req, res) => {
  try {
    const user = await prisma.tutorUser.findUnique({
      where: { id: req.userId },
      select: {
        plan: true,
        subscriptionStart: true,
        subscriptionEnd: true,
        dailyUsage: true,
        dailyUsageDate: true,
        hubtelPhone: true,
        hubtelChannel: true,
        hubtelPreapprovalStatus: true,
      },
    });

    const today = new Date().toISOString().slice(0, 10);
    const usage = user?.dailyUsageDate === today ? user?.dailyUsage || 0 : 0;
    const limit = user?.plan ? (LIMITS[user.plan] ?? 5) : 5;
    const active = user?.plan !== 'free' && (!user?.subscriptionEnd || new Date(user.subscriptionEnd) > new Date());

    res.json({
      plan: user?.plan || 'free',
      subscriptionStart: user?.subscriptionStart,
      subscriptionEnd: user?.subscriptionEnd,
      dailyUsage: usage,
      dailyLimit: limit,
      remaining: limit === -1 ? -1 : Math.max(0, limit - usage),
      isActive: active,
      autoRenew: user?.hubtelPreapprovalStatus === 'APPROVED',
      paymentPhone: user?.hubtelPhone || null,
      paymentChannel: user?.hubtelChannel || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;