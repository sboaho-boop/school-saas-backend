const https = require('https');

const FULFILLMENT_CALLBACK_URL = 'https://gs-callback.hubtel.com:9055/callback';

function sendFulfillmentCallback({ sessionId, orderId, serviceStatus, metaData, credentials }) {
  return new Promise((resolve, reject) => {
    const clientId = credentials?.hubtelClientId || process.env.HUBTEL_CLIENT_ID || '';
    const clientSecret = credentials?.hubtelClientSecret || process.env.HUBTEL_CLIENT_SECRET || '';

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const payload = JSON.stringify({
      SessionId: sessionId,
      OrderId: orderId,
      ServiceStatus: serviceStatus || 'success',
      MetaData: metaData || null,
    });

    const parsed = new URL(FULFILLMENT_CALLBACK_URL);

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 9055,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve({ raw: body });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function buildResponse({ sessionId, type, message, label, dataType, fieldType, clientState, sequence, item, mask }) {
  const response = {
    SessionId: sessionId,
    Type: type || 'response',
    Message: message,
    Label: label || '',
    DataType: dataType || 'input',
    FieldType: fieldType || 'text',
  };
  if (clientState !== undefined) response.ClientState = clientState;
  if (sequence !== undefined) response.Sequence = sequence;
  if (item) response.Item = item;
  if (mask) response.Mask = mask;
  return response;
}

function endSession({ sessionId, message, label }) {
  return buildResponse({
    sessionId,
    type: 'release',
    message: message || 'Thank you for using EDUPLATFORM.',
    label: label || 'Goodbye',
    dataType: 'display',
  });
}

function addToCart({ sessionId, message, itemName, qty, price, label }) {
  return buildResponse({
    sessionId,
    type: 'AddToCart',
    message,
    label: label || message,
    dataType: 'display',
    item: { ItemName: itemName, Qty: qty || 1, Price: price },
  });
}

module.exports = {
  sendFulfillmentCallback,
  buildResponse,
  endSession,
  addToCart,
};
