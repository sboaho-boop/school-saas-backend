const express = require('express');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { sendSubscriptionAlert } = require('../lib/sms');
const { createCheckout } = require('../lib/hubtel-payment');

const PLANS = {
  free: { name: 'Starter', studentLimit: 100, staffLimit: 10, priceId: null, amount: 0 },
  pro: { name: 'Professional', studentLimit: 1000, staffLimit: 50, priceId: null, amount: 29900 },
  enterprise: { name: 'Enterprise', studentLimit: 999999, staffLimit: 999999, priceId: null, amount: 99900 },
};

const router = express.Router();

router.get('/plans', (req, res) => {
  res.json(Object.entries(PLANS).map(([id, p]) => ({ id, ...p })));
});

router.get('/subscription', authenticate, async (req, res) => {
  try {
    let sub = await prisma.subscription.findUnique({ where: { schoolId: req.schoolId } });
    if (!sub) {
      sub = await prisma.subscription.create({ data: { schoolId: req.schoolId } });
    }
    const studentCount = await prisma.student.count({ where: { schoolId: req.schoolId } });
    const staffCount = await prisma.staff.count({ where: { schoolId: req.schoolId } });
    res.json({
      ...sub,
      studentCount,
      staffCount,
      planName: PLANS[sub.plan]?.name || 'Free',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

router.post('/upgrade', authenticate, requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const { plan } = req.body;
    if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });
    if (PLANS[plan].amount === 0) {
      const limits = PLANS[plan];
      let sub = await prisma.subscription.findUnique({ where: { schoolId: req.schoolId } });
      if (!sub) sub = await prisma.subscription.create({ data: { schoolId: req.schoolId } });
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { plan, status: 'active', studentLimit: limits.studentLimit, staffLimit: limits.staffLimit },
      });
      if (req.user.phone) sendSubscriptionAlert(req.user.phone, plan, 'upgraded').catch(() => {});
      return res.json({ message: `Downgraded to ${plan}` });
    }
    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    const reference = crypto.randomBytes(12).toString('hex');
    const checkout = await createCheckout({
      amount: PLANS[plan].amount,
      title: `EDUPLATFORM SOFTWARE SERVICES ${PLANS[plan].name} Plan`,
      description: `${PLANS[plan].name} subscription for ${req.user.name}`,
      clientReference: reference,
      payeeName: req.user.name,
      payeeEmail: req.user.email,
      payeeMobileNumber: req.user.phone,
      schoolCredentials: school,
    });
    await prisma.subscription.upsert({
      where: { schoolId: req.schoolId },
      update: { pendingPlan: plan, pendingCheckoutRef: reference },
      create: { schoolId: req.schoolId, pendingPlan: plan, pendingCheckoutRef: reference },
    });
    res.json({ checkoutUrl: checkout.checkoutUrl, reference });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to create payment checkout' });
  }
});

router.post('/hubtel-webhook', async (req, res) => {
  try {
    const data = req.body.Data || req.body;
    const { ClientReference, Status } = data;
    console.log('Billing webhook received:', JSON.stringify(req.body));
    if (!ClientReference) return res.status(400).json({ error: 'Missing ClientReference' });
    if (Status !== 'Success') return res.status(200).json({ message: 'Payment not successful' });
    const sub = await prisma.subscription.findFirst({ where: { pendingCheckoutRef: ClientReference } });
    if (!sub || !sub.pendingPlan) return res.status(200).json({ message: 'No pending subscription found' });
    const limits = PLANS[sub.pendingPlan];
    if (!limits) return res.status(200).json({ error: 'Invalid plan' });
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        plan: sub.pendingPlan,
        status: 'active',
        studentLimit: limits.studentLimit,
        staffLimit: limits.staffLimit,
        pendingPlan: null,
        pendingCheckoutRef: null,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    console.log(`Subscription upgraded to ${sub.pendingPlan} for school ${sub.schoolId}`);
    res.status(200).json({ message: `Subscription upgraded to ${sub.pendingPlan}` });
  } catch (err) {
    console.error(err);
    res.status(200).json({ error: 'Webhook processing failed' });
  }
});

router.post('/cancel', authenticate, requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const sub = await prisma.subscription.findUnique({ where: { schoolId: req.schoolId } });
    if (!sub) return res.status(400).json({ error: 'No subscription found' });
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { plan: 'free', status: 'canceled', studentLimit: PLANS.free.studentLimit, staffLimit: PLANS.free.staffLimit, pendingPlan: null, pendingCheckoutRef: null },
    });
    if (req.user.phone) {
      sendSubscriptionAlert(req.user.phone, 'Free', 'canceled').catch(() => {});
    }
    res.json({ message: 'Subscription canceled' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

module.exports = router;
