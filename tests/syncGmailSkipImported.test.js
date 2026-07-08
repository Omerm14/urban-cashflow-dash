import { describe, it, expect } from 'vitest';
import { partitionSeenGmailMessages } from '../server/services/syncProcessor.js';

// CASH-20: syncGmail must skip downloading/OCR-ing attachments for messages
// already represented by an existing invoice, the same way syncGoogleDrive's
// seenFiles filter skips already-imported Drive files. Testing the real
// exported partition function directly (precedent: isDuplicate.test.js) —
// syncGmail itself talks to the live Gmail API and isn't unit-testable
// without an integration harness.

const row = messageId => ({ sync_source_meta: { message_id: messageId } });

describe('partitionSeenGmailMessages (real module)', () => {
  it('is backed by the real syncProcessor.js export, not a shadow copy', () => {
    expect(typeof partitionSeenGmailMessages).toBe('function');
  });

  it('routes a message already represented by an invoice to skippedIds, not toProcess', () => {
    const messages = [{ id: 'already-imported' }, { id: 'new-message' }];
    const importedRows = [row('already-imported')];

    const { toProcess, skippedIds } = partitionSeenGmailMessages(messages, importedRows);

    expect(toProcess.map(m => m.id)).toEqual(['new-message']);
    expect(skippedIds).toEqual(['already-imported']);
  });

  it('skips every message when a full resync finds no new mail (zero new Claude calls)', () => {
    const messages = [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }];
    const importedRows = [row('m1'), row('m2'), row('m3')];

    const { toProcess, skippedIds } = partitionSeenGmailMessages(messages, importedRows);

    expect(toProcess).toEqual([]);
    expect(skippedIds).toEqual(['m1', 'm2', 'm3']);
  });

  it('processes every message when none have been imported yet', () => {
    const messages = [{ id: 'm1' }, { id: 'm2' }];

    const { toProcess, skippedIds } = partitionSeenGmailMessages(messages, []);

    expect(toProcess.map(m => m.id)).toEqual(['m1', 'm2']);
    expect(skippedIds).toEqual([]);
  });

  it('tolerates invoices with no sync_source_meta.message_id (e.g. other sources)', () => {
    const messages = [{ id: 'm1' }];
    const importedRows = [{ sync_source_meta: {} }, { sync_source_meta: null }];

    const { toProcess, skippedIds } = partitionSeenGmailMessages(messages, importedRows);

    expect(toProcess.map(m => m.id)).toEqual(['m1']);
    expect(skippedIds).toEqual([]);
  });

  it('handles a null/undefined importedRows argument (empty result set)', () => {
    const messages = [{ id: 'm1' }];

    expect(partitionSeenGmailMessages(messages, null).toProcess.map(m => m.id)).toEqual(['m1']);
    expect(partitionSeenGmailMessages(messages, undefined).toProcess.map(m => m.id)).toEqual(['m1']);
  });
});
