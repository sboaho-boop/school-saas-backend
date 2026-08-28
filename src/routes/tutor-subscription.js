const { Router } = require('express');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { authenticateTutor } = require('./tutor-auth');

const router = Router();

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || '';
const PAYSTACK_BASE = 'https://api.paystack.co';

const PLANS = {
  pro: {
    planCode: process.env.PAYSTACK_PLAN_PRO_CODE || 'pro',
    amount: Number(process.env.PAYSTACK_PLAN_PRO_AMOUNT) || 19,
    name: 'Teacher Kofi Pro',
    interval: 'monthly',
  },
  unlimited: {
    planCode: process.env.PAYSTACK_PLAN_UNLIMITED_CODE || 'unlimited',
    amount: Number(process.env.PAYSTACK_PLAN_UNLIMITED_AMOUNT) || 39,
    name: 'Teacher Kofi Unlimited',
    interval: 'monthly',
  },
};

router.get('/plans', (req, res) => {
  res.json({
    pro: { id: 'pro', name: PLANS.pro.name, priceGHS: PLANS.pro.amount, interval: PLANS.pro.interval },
    unlimited: { id: 'unlimited', name: PLANS.unlimited.name, priceGHS: PLANS.unlimited.amount, interval: PLANS.unlimited.interval },
  });
});

router.post('/init', authenticateTutor, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan. Use "pro" or "unlimited".' });

    const user = await prisma.tutorUser.findUnique({ where: { id: req.userId }, select: { email: true, name: true } });

    const planConfig = PLANS[plan];

    const initRes = await fetch(PAYSTACK_BASE + '/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + PAYSTACK_SECRET,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: user.email,
        amount: planConfig.amount * 100,
        plan: planConfig.planCode,
        metadata: { userId: req.userId, plan, userName: user.name },
        callback_url: (process.env.FRONTEND_URL || 'http://localhost:3000') + '/tutor/dashboard?upgraded=1',
      }),
    });

    const data = await initRes.json();
    if (!data.status) {
      return res.status(400).json({ error: data.message || 'Payment initialization failed' });
    }

    res.json({ authorization_url: data.data.authorization_url, reference: data.data.reference, access_code: data.data.access_code });
  } catch (err) {
    console.error('Paystack init error:', err.message);
    res.status(500).json({ error: 'Payment initialization failed' });
  }
});

router.post('/verify', authenticateTutor, async (req, res) => {
  try {
    const { reference } = req.body;
    if (!reference) return res.status(400).json({ error: 'Reference required' });

    const verifyRes = await fetch(PAYSTACK_BASE + '/transaction/verify/' + reference, {
      headers: { Authorization: 'Bearer ' + PAYSTACK_SECRET },
    });

    const data = await verifyRes.json();
    if (!data.status || data.data.status !== 'success') {
      return res.status(400).json({ error: 'Payment not successful' });
    }

    const meta = data.data.metadata || {};
    const plan = meta.plan || req.body.plan;
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await prisma.tutorUser.update({
      where: { id: meta.userId || req.userId },
      data: {
        plan: plan,
        subscriptionStart: now,
        subscriptionEnd: periodEnd,
        dailyUsage: 0,
        dailyUsageDate: '',
      },
    });

    res.json({ success: true, plan, subscriptionEnd: periodEnd });
  } catch (err) {
    console.error('Paystack verify error:', err.message);
    res.status(500).json({ error: 'Verification failed' });
  }
});

router.post('/webhook', async (req, res) => {
  try {
    if (!PAYSTACK_SECRET) return res.sendStatus(200);

    const hash = crypto.createHmac('sha512', PAYSTACK_SECRET).update(JSON.stringify(req.body)).digest('hex');
    if (hash !== req.headers['x-paystack-signature']) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = req.body;
    if (event.event === 'subscription.create' || event.event === 'charge.success') {
      const meta = event.data?.metadata || {};
      const userId = meta.userId;
      if (userId) {
        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 1);
        await prisma.tutorUser.update({
          where: { id: userId },
          data: {
            plan: meta.plan || 'pro',
            subscriptionStart: now,
            subscriptionEnd: periodEnd,
            dailyUsage: 0,
            dailyUsageDate: '',
            paystackCustomerCode: event.data?.customer?.customer_code || null,
            paystackSubscriptionCode: event.data?.subscription?.subscription_code || null,
          },
        }).catch(() => {});
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Paystack webhook error:', err.message);
    res.sendStatus(200);
  }
});

router.get('/status', authenticateTutor, async (req, res) => {
  try {
    const user = await prisma.tutorUser.findUnique({
      where: { id: req.userId },
      select: { plan: true, subscriptionStart: true, subscriptionEnd: true, dailyUsage: true, dailyUsageDate: true },
    });

    const today = new Date().toISOString().slice(0, 10);
    const usage = user?.dailyUsageDate === today ? user?.dailyUsage || 0 : 0;

    const limits = { free: 5, pro: 100, unlimited: -1 };
    const limit = limits[user?.plan] ?? 5;

    res.json({
      plan: user?.plan || 'free',
      subscriptionStart: user?.subscriptionStart,
      subscriptionEnd: user?.subscriptionEnd,
      dailyUsage: usage,
      dailyLimit: limit,
      remaining: limit === -1 ? -1 : Math.max(0, limit - usage),
      isActive: user?.plan !== 'free' && (!user?.subscriptionEnd || new Date(user.subscriptionEnd) > new Date()),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
