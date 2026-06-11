const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');

const PLANS = {
  free: { name: 'Free', studentLimit: 30, staffLimit: 10, priceId: null, amount: 0 },
  pro: { name: 'Professional', studentLimit: 200, staffLimit: 50, priceId: null, amount: 2999 },
  enterprise: { name: 'Enterprise', studentLimit: 999999, staffLimit: 999999, priceId: null, amount: 9999 },
};

function getOrCreateStripe() {
  if (process.env.STRIPE_SECRET_KEY) {
    return require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
  return null;
}

router.get('/plans', (req, res) => {
  res.json(Object.entries(PLANS).map(([id, p]) => ({ id, ...p })));
});

router.get('/subscription', authenticate, async (req, res) => {
  try {
    let sub = await prisma.subscription.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!sub) {
      sub = await prisma.subscription.create({ data: {} });
    }
    const studentCount = await prisma.student.count();
    const staffCount = await prisma.staff.count();
    res.json({
      ...sub,
      plan: sub.plan,
      currentPeriodEnd: sub.currentPeriodEnd,
      trialEndsAt: sub.trialEndsAt,
      studentCount,
      staffCount,
      planName: PLANS[sub.plan]?.name || 'Free',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

router.post('/create-checkout-session', authenticate, requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const { plan } = req.body;
    if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });
    const priceId = PLANS[plan].priceId;
    if (!priceId) return res.status(400).json({ error: 'No price configured for this plan' });

    const stripe = getOrCreateStripe();
    if (!stripe) return res.status(400).json({ error: 'Stripe not configured' });

    let sub = await prisma.subscription.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!sub) sub = await prisma.subscription.create({ data: {} });

    let customerId = sub.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        metadata: { subscriptionId: sub.id },
      });
      customerId = customer.id;
      await prisma.subscription.update({ where: { id: sub.id }, data: { stripeCustomerId: customerId } });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${req.headers.origin || 'http://localhost:3000'}/settings?billing=success`,
      cancel_url: `${req.headers.origin || 'http://localhost:3000'}/settings?billing=canceled`,
      metadata: { subscriptionId: sub.id, plan },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const stripe = getOrCreateStripe();
  if (!stripe) return res.status(200).json({ received: true });

  let event;
  try {
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const { subscriptionId, plan } = session.metadata;
        const subId = session.subscription;
        const planKey = plan || 'pro';
        const limits = PLANS[planKey];
        await prisma.subscription.update({
          where: { id: subscriptionId },
          data: {
            plan: planKey,
            status: 'active',
            stripeSubscriptionId: subId,
            studentLimit: limits.studentLimit,
            staffLimit: limits.staffLimit,
            currentPeriodStart: new Date(session.created * 1000),
            currentPeriodEnd: new Date((session.created + 2592000) * 1000),
          },
        });
        break;
      }
      case 'customer.subscription.updated': {
        const subEvent = event.data.object;
        const existing = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: subEvent.id } });
        if (existing) {
          await prisma.subscription.update({
            where: { id: existing.id },
            data: {
              status: subEvent.status === 'active' ? 'active' : subEvent.status === 'past_due' ? 'past_due' : 'canceled',
              currentPeriodStart: new Date(subEvent.current_period_start * 1000),
              currentPeriodEnd: new Date(subEvent.current_period_end * 1000),
            },
          });
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const subDel = event.data.object;
        const existingDel = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: subDel.id } });
        if (existingDel) {
          await prisma.subscription.update({
            where: { id: existingDel.id },
            data: { plan: 'free', status: 'canceled', studentLimit: PLANS.free.studentLimit, staffLimit: PLANS.free.staffLimit, stripeSubscriptionId: null },
          });
        }
        break;
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

router.post('/cancel', authenticate, requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const sub = await prisma.subscription.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!sub || !sub.stripeSubscriptionId) {
      return res.status(400).json({ error: 'No active subscription to cancel' });
    }
    const stripe = getOrCreateStripe();
    if (stripe) {
      await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
    }
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { plan: 'free', status: 'canceled', studentLimit: PLANS.free.studentLimit, staffLimit: PLANS.free.staffLimit, stripeSubscriptionId: null },
    });
    res.json({ message: 'Subscription canceled' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

router.post('/create-portal-session', authenticate, requireRole('headteacher', 'admin'), async (req, res) => {
  try {
    const sub = await prisma.subscription.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!sub || !sub.stripeCustomerId) return res.status(400).json({ error: 'No Stripe customer' });
    const stripe = getOrCreateStripe();
    if (!stripe) return res.status(400).json({ error: 'Stripe not configured' });
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${req.headers.origin || 'http://localhost:3000'}/settings`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

module.exports = router;
