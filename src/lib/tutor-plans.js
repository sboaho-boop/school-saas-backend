const PRICE_PRO = Number(process.env.PAYSTACK_PLAN_PRO_AMOUNT) || 19;
const PRICE_UNLIMITED = Number(process.env.PAYSTACK_PLAN_UNLIMITED_AMOUNT) || 39;

const PLANS = {
  pro: {
    id: 'pro',
    amount: PRICE_PRO,
    name: 'Teacher Kofi Pro',
    interval: 'monthly',
  },
  unlimited: {
    id: 'unlimited',
    amount: PRICE_UNLIMITED,
    name: 'Teacher Kofi Unlimited',
    interval: 'monthly',
  },
};

const LIMITS = { free: 5, pro: 100, unlimited: -1 };

module.exports = { PLANS, LIMITS };