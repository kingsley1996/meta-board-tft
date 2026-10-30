import { Router, type Request, type Response } from 'express';
import { currentSessionUser } from '../auth-routes.ts';
import { readPaymentProviders, PaymentProviderError, type PaymentProviderRegistry } from './index.ts';
import { createOrder, getOrder, handleWebhook, listOrders, reconcileOrder } from '../membership/orders.ts';

// Payment HTTP surface (task #87): checkout creation, the account's own order
// history, bounded reconciliation, and the raw webhook.
//
// The webhook router is mounted before the global JSON parser because both
// providers sign the bytes they sent. Everything else needs a session: an order is
// account data and the price is the server's, never the browser's.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function registry(): PaymentProviderRegistry | null {
  try {
    return readPaymentProviders();
  } catch (error) {
    if (error instanceof PaymentProviderError) return null;
    throw error;
  }
}

function unavailable(res: Response, code = 'payments_unavailable'): void {
  res.status(503).setHeader('Cache-Control', 'no-store').json({ error: 'Payments are unavailable. Try again shortly.', code });
}

function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Cookie');
}

async function userId(req: Request, res: Response): Promise<string | null> {
  const user = await currentSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Sign in to buy a plan.', code: 'unauthenticated' });
    return null;
  }
  return user.id;
}

/** Mounted at /api/payments/webhook with express.raw() in front, before the JSON
 *  parser; the body is never parsed before the signature is checked. */
export const paymentWebhookRouter = Router();

paymentWebhookRouter.post('/:provider', async (req, res) => {
  const providerName = req.params.provider;
  if (providerName !== 'payos' && providerName !== 'sepay') {
    return res.status(404).json({ error: 'unknown payment provider', code: 'not_found' });
  }
  const providers = registry();
  if (!providers) return unavailable(res);
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: 'invalid webhook body', code: 'invalid_webhook' });
  }
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(name, value);
  }
  const result = await handleWebhook({ provider: providerName, body: req.body, headers, registry: providers });
  if (!result.ok) {
    if (result.reason === 'unavailable') return unavailable(res);
    return res.status(401).json({ error: 'invalid webhook signature', code: 'invalid_webhook' });
  }
  // Verified and recorded (granted, duplicate or review): ack so the gateway does
  // not retry a transaction that is already in the ledger.
  res.json({ ok: true });
});

/** Mounted at /api after the JSON parser. */
export const paymentRouter = Router();

paymentRouter.post('/orders', async (req, res) => {
  const user = await userId(req, res);
  if (!user) return;
  // New sales are closed by the same switch the web reads, so a stale page or a
  // direct call cannot open an order while registration is pending.
  if (process.env.MEMBERSHIP_CHECKOUT === 'paused') {
    return res.status(409).json({ error: 'Plus sales are paused right now.', code: 'checkout_paused' });
  }
  const providers = registry();
  if (!providers) return unavailable(res);
  const planVersionId = typeof req.body?.planVersionId === 'string' ? req.body.planVersionId : '';
  const headerKey = req.header('x-request-key');
  const bodyKey = typeof req.body?.requestKey === 'string' ? req.body.requestKey : '';
  const requestKey = headerKey ?? bodyKey;
  if (!UUID.test(planVersionId) || !requestKey) {
    return res.status(400).json({ error: 'invalid order request', code: 'invalid_order' });
  }

  let result;
  try {
    result = await createOrder({ userId: user, planVersionId, requestKey, registry: providers });
  } catch {
    return unavailable(res);
  }
  if (!result.ok) {
    switch (result.reason) {
      case 'invalid':
        return res.status(400).json({ error: 'invalid order request', code: 'invalid_order' });
      case 'not_sellable':
        return res.status(409).json({ error: 'That offer is not on sale.', code: 'offer_not_sellable' });
      case 'membership_active':
        return res.status(409).json({ error: 'This plan is already active.', code: 'membership_active' });
      case 'too_many_pending':
        return res.status(429).json({ error: 'Too many unpaid orders. Finish or wait for one to expire.', code: 'too_many_pending_orders' });
      case 'conflict':
        return res.status(409).json({ error: 'That request key belongs to another order.', code: 'order_conflict' });
      case 'provider_unavailable':
        return res.status(502).json({ error: 'The payment provider did not answer. Try again.', code: 'payment_unavailable' });
      default:
        return unavailable(res);
    }
  }
  noStore(res);
  res.json({ order: result.order });
});

paymentRouter.get('/me/orders', async (req, res) => {
  const user = await userId(req, res);
  if (!user) return;
  const orders = await listOrders(user, registry());
  if (!orders) return unavailable(res);
  noStore(res);
  res.json(orders);
});

paymentRouter.get('/me/orders/:id', async (req, res) => {
  const user = await userId(req, res);
  if (!user) return;
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'order not found', code: 'not_found' });
  const order = await getOrder(user, req.params.id, registry());
  if (!order) return res.status(404).json({ error: 'order not found', code: 'not_found' });
  noStore(res);
  res.json({ order });
});

paymentRouter.post('/me/orders/:id/refresh', async (req, res) => {
  const user = await userId(req, res);
  if (!user) return;
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'order not found', code: 'not_found' });
  const order = await reconcileOrder({ userId: user, orderId: req.params.id, registry: registry() });
  if (!order) return res.status(404).json({ error: 'order not found', code: 'not_found' });
  noStore(res);
  res.json({ order });
});
