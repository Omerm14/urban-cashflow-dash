import { describe, it, expect } from 'vitest';

// Inlined copies of the pagination loops added to syncProcessor.js for CASH-9
// (tests avoid importing the full module, which side-effectfully instantiates
// a Supabase client at require-time — see isDuplicate.test.js for precedent).

const DRIVE_LIST_MAX_PAGES = 10;
const GMAIL_LIST_MAX_PAGES = 10;

const listAllDriveFiles = async (drive, conditions) => {
  const files = [];
  let pageToken;
  for (let page = 0; page < DRIVE_LIST_MAX_PAGES; page++) {
    const { data } = await drive.files.list({ q: conditions, pageToken });
    files.push(...(data.files || []));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return files;
};

const listAllGmailMessages = async (gmail, q) => {
  const messages = [];
  let pageToken;
  for (let page = 0; page < GMAIL_LIST_MAX_PAGES; page++) {
    const { data } = await gmail.users.messages.list({ userId: 'me', q, pageToken });
    messages.push(...(data.messages || []));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return messages;
};

describe('listAllDriveFiles (CASH-9: paginate past the 50-file cap)', () => {
  it('follows nextPageToken across multiple pages and returns every file', async () => {
    const page1 = [{ id: '1' }, { id: '2' }];
    const page2 = [{ id: '3' }, { id: '4' }];
    const page3 = [{ id: '5' }];
    let calls = 0;
    const drive = {
      files: {
        list: async ({ pageToken }) => {
          calls++;
          if (!pageToken) return { data: { files: page1, nextPageToken: 't1' } };
          if (pageToken === 't1') return { data: { files: page2, nextPageToken: 't2' } };
          if (pageToken === 't2') return { data: { files: page3 } };
          throw new Error(`unexpected pageToken ${pageToken}`);
        },
      },
    };

    const files = await listAllDriveFiles(drive, 'some query');

    expect(files.map(f => f.id)).toEqual(['1', '2', '3', '4', '5']);
    expect(calls).toBe(3);
  });

  it('stops after a single page when there is no nextPageToken (small accounts unaffected)', async () => {
    const drive = {
      files: {
        list: async () => ({ data: { files: [{ id: 'a' }, { id: 'b' }] } }),
      },
    };

    const files = await listAllDriveFiles(drive, 'q');

    expect(files.map(f => f.id)).toEqual(['a', 'b']);
  });

  it('passes the query condition through on every page', async () => {
    const seenQueries = [];
    const drive = {
      files: {
        list: async ({ q, pageToken }) => {
          seenQueries.push(q);
          if (!pageToken) return { data: { files: [{ id: '1' }], nextPageToken: 't1' } };
          return { data: { files: [{ id: '2' }] } };
        },
      },
    };

    await listAllDriveFiles(drive, 'trashed = false');

    expect(seenQueries).toEqual(['trashed = false', 'trashed = false']);
  });

  it('bounds the loop at DRIVE_LIST_MAX_PAGES so a runaway nextPageToken cannot loop forever', async () => {
    let calls = 0;
    const drive = {
      files: {
        // Always returns a nextPageToken — a pathological/misbehaving API.
        list: async () => {
          calls++;
          return { data: { files: [{ id: String(calls) }], nextPageToken: 'always-more' } };
        },
      },
    };

    const files = await listAllDriveFiles(drive, 'q');

    expect(calls).toBe(DRIVE_LIST_MAX_PAGES);
    expect(files.length).toBe(DRIVE_LIST_MAX_PAGES);
  });
});

describe('listAllGmailMessages (CASH-9: paginate past the 100-message cap)', () => {
  it('follows nextPageToken across multiple pages and returns every message', async () => {
    let calls = 0;
    const gmail = {
      users: {
        messages: {
          list: async ({ pageToken }) => {
            calls++;
            if (!pageToken) return { data: { messages: [{ id: 'm1' }, { id: 'm2' }], nextPageToken: 't1' } };
            if (pageToken === 't1') return { data: { messages: [{ id: 'm3' }], nextPageToken: 't2' } };
            if (pageToken === 't2') return { data: { messages: [{ id: 'm4' }] } };
            throw new Error(`unexpected pageToken ${pageToken}`);
          },
        },
      },
    };

    const messages = await listAllGmailMessages(gmail, 'has:attachment');

    expect(messages.map(m => m.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(calls).toBe(3);
  });

  it('returns an empty list without error when there are no matching messages', async () => {
    const gmail = { users: { messages: { list: async () => ({ data: {} }) } } };

    const messages = await listAllGmailMessages(gmail, 'has:attachment');

    expect(messages).toEqual([]);
  });

  it('bounds the loop at GMAIL_LIST_MAX_PAGES so a runaway nextPageToken cannot loop forever', async () => {
    let calls = 0;
    const gmail = {
      users: {
        messages: {
          list: async () => {
            calls++;
            return { data: { messages: [{ id: String(calls) }], nextPageToken: 'always-more' } };
          },
        },
      },
    };

    const messages = await listAllGmailMessages(gmail, 'q');

    expect(calls).toBe(GMAIL_LIST_MAX_PAGES);
    expect(messages.length).toBe(GMAIL_LIST_MAX_PAGES);
  });
});
