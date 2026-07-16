import { describe, it, expect, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import {
  buildTxnSetupXml,
  buildRecurringDebitXml,
  callHyp,
  computeResponseMac,
  verifyResponseMac,
} from '../server/lib/hyp.js';

describe('buildTxnSetupXml', () => {
  it('includes the fields needed for a hosted checkout, and defaults to AutoComm (immediate charge, not hold-then-capture)', () => {
    const xml = buildTxnSetupXml({
      terminalNumber: '0882819014',
      mid: '13092',
      uniqueid: 'user-1:starter:abcd1234',
      total: 19900,
      successUrl: 'https://app.example.com/api/billing/redirect',
      errorUrl: 'https://app.example.com/api/billing/redirect',
    });
    expect(xml).toContain('<command>doDeal</command>');
    expect(xml).toContain('<validation>TxnSetup</validation>');
    expect(xml).toContain('<mpiValidation>AutoComm</mpiValidation>');
    expect(xml).toContain('<cardNo>CGMPI</cardNo>');
    expect(xml).toContain('<terminalNumber>0882819014</terminalNumber>');
    expect(xml).toContain('<total>19900</total>');
    expect(xml).toContain('<uniqueid>user-1:starter:abcd1234</uniqueid>');
  });

  it('escapes XML special characters in interpolated fields', () => {
    const xml = buildTxnSetupXml({
      terminalNumber: '1', mid: '1', uniqueid: 'a&b<c>',
      total: 100, successUrl: 'https://x?a=1&b=2', errorUrl: 'https://y',
    });
    expect(xml).not.toContain('a&b<c>');
    expect(xml).toContain('a&amp;b&lt;c&gt;');
    expect(xml).toContain('https://x?a=1&amp;b=2');
  });
});

describe('buildRecurringDebitXml', () => {
  it('charges a stored token, merchant-initiated (no cardNo/CVV, no payment page)', () => {
    const xml = buildRecurringDebitXml({
      terminalNumber: '0882819014',
      cardId: '1092880571131111',
      cardExpiration: '1225',
      total: 39900,
    });
    expect(xml).toContain('<transactionType>RecurringDebit</transactionType>');
    expect(xml).toContain('<validation>AutoComm</validation>');
    expect(xml).toContain('<cardId>1092880571131111</cardId>');
    expect(xml).toContain('<cardExpiration>1225</cardExpiration>');
    expect(xml).toContain('<total>39900</total>');
    expect(xml).not.toContain('cardNo');
  });
});

describe('computeResponseMac / verifyResponseMac', () => {
  const fields = {
    password: 'super-secret',
    txId: 'd08ba620-df0d-4b3b-8be0-c0e3e6f603f2',
    errorCode: '000',
    cardToken: '1092880571131111',
    cardExp: '0731',
    personalId: '',
    uniqueId: 'user-1:starter:abcd1234',
  };

  it('matches the exact concatenation Hyp documents: password+txId+errorCode+cardToken+cardExp+personalId+uniqueId, SHA-256, base64', () => {
    const expected = crypto.createHash('sha256')
      .update(fields.password + fields.txId + fields.errorCode + fields.cardToken + fields.cardExp + fields.personalId + fields.uniqueId, 'utf8')
      .digest('base64');
    expect(computeResponseMac(fields)).toBe(expected);
  });

  it('defaults errorCode to "000" when absent, per the docs', () => {
    const { errorCode, ...withoutErrorCode } = fields;
    expect(computeResponseMac(withoutErrorCode)).toBe(computeResponseMac(fields));
  });

  it('treats missing optional fields (cardToken/cardExp/personalId) as empty strings', () => {
    const minimal = { password: 'p', txId: 't', uniqueId: 'u' };
    const explicit = { password: 'p', txId: 't', errorCode: '000', cardToken: '', cardExp: '', personalId: '', uniqueId: 'u' };
    expect(computeResponseMac(minimal)).toBe(computeResponseMac(explicit));
  });

  it('verifyResponseMac accepts a correctly computed MAC', () => {
    const mac = computeResponseMac(fields);
    expect(verifyResponseMac(fields, mac)).toBe(true);
  });

  it('verifyResponseMac rejects a tampered field even if the MAC string itself is unchanged (e.g. a swapped cardToken)', () => {
    const mac = computeResponseMac(fields);
    expect(verifyResponseMac({ ...fields, cardToken: 'different-token' }, mac)).toBe(false);
  });

  it('verifyResponseMac rejects a forged MAC that does not know the merchant password', () => {
    const forged = computeResponseMac({ ...fields, password: 'guessed-wrong-password' });
    expect(verifyResponseMac(fields, forged)).toBe(false);
  });

  it('verifyResponseMac rejects an empty/missing responseMac', () => {
    expect(verifyResponseMac(fields, undefined)).toBe(false);
    expect(verifyResponseMac(fields, '')).toBe(false);
  });
});

describe('callHyp', () => {
  afterEach(() => { delete global.fetch; vi.unstubAllEnvs(); });

  it('parses a successful doDeal/TxnSetup response and surfaces mpiHostedPageUrl', async () => {
    vi.stubEnv('HYP_ENDPOINT', 'https://hyp.example.com/xpo/Relay');
    vi.stubEnv('HYP_API_USER', 'u');
    vi.stubEnv('HYP_API_PASSWORD', 'p');
    global.fetch = vi.fn(async () => ({
      text: async () => `<?xml version='1.0'?>
        <ashrait><response>
          <command>doDeal</command>
          <tranId>119037543</tranId>
          <result>000</result>
          <userMessage>Permitted transaction</userMessage>
          <doDeal>
            <status>000</status>
            <mpiHostedPageUrl>https://ppsuat.creditguard.co.il?txId=abc</mpiHostedPageUrl>
          </doDeal>
        </response></ashrait>`,
    }));

    const res = await callHyp('<ashrait>...</ashrait>');
    expect(res.result).toBe('000');
    expect(res.doDeal.mpiHostedPageUrl).toBe('https://ppsuat.creditguard.co.il?txId=abc');
    expect(global.fetch).toHaveBeenCalledWith('https://hyp.example.com/xpo/Relay', expect.objectContaining({ method: 'POST' }));
  });

  it('surfaces a non-000 result as data, not as a thrown error — a decline is a normal response', async () => {
    global.fetch = vi.fn(async () => ({
      text: async () => `<?xml version='1.0'?>
        <ashrait><response>
          <command>doDeal</command>
          <tranId>119295245</tranId>
          <result>004</result>
          <userMessage>Refusal by credit company</userMessage>
          <doDeal><status>004</status></doDeal>
        </response></ashrait>`,
    }));

    const res = await callHyp('<ashrait>...</ashrait>');
    expect(res.result).toBe('004');
    expect(res.message).toBe('Refusal by credit company');
  });
});
