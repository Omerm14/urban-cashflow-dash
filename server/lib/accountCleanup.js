const supabase = require('./supabase');
const storage  = require('./storage');

// Deletes every storage object backing this user's invoices. Tolerates individual
// failures (log + continue) so one bad key doesn't block the rest of account cleanup —
// once the invoice rows are gone below, nothing else can ever discover and reap these
// files (see CASH-49/CASH-22 GC gaps), so this is the last chance to remove them.
async function deleteUserAttachments(userId) {
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('attachment_path, attachment_backend')
    .eq('user_id', userId)
    .not('attachment_path', 'is', null);

  if (error) {
    console.error('[accountCleanup] failed to list attachments for deletion:', error.message);
    return;
  }

  for (const { attachment_path, attachment_backend } of invoices || []) {
    try {
      await storage.deleteAttachment(attachment_path, attachment_backend);
    } catch (err) {
      console.error(`[accountCleanup] failed to delete attachment ${attachment_path}:`, err.message);
    }
  }
}

// FK-safe delete order — do not reorder.
const TABLES_TO_DELETE = ['invoices', 'suppliers', 'sync_jobs', 'integrations', 'subscriptions'];

// Deletes all app-table rows for a user (FK-safe order) then removes the Supabase Auth user
// itself. Shared by self-service account deletion and admin-driven user deletion — the only
// difference between those two call sites is which userId gets passed in and who's allowed to.
//
// Unlike deleteUserAttachments()'s best-effort log-and-continue loop above, the table deletes
// here are NOT tolerated: deleting the Auth user is the irreversible step, and if it happens
// while some table delete failed, those rows are orphaned forever (no auth user left to
// own/query them under RLS, no clean way to retry once the login is gone). So every table
// delete's error is checked, and if any failed we throw instead of proceeding to the Auth
// user deletion — the caller (account.js / admin.js) already turns a thrown error into a
// user/admin-facing failure response.
async function deleteUserData(userId) {
  await deleteUserAttachments(userId);

  const failedTables = [];
  for (const table of TABLES_TO_DELETE) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId);
    if (error) {
      console.error(`[accountCleanup] failed to delete ${table} rows for user ${userId}:`, error.message);
      failedTables.push(table);
    }
  }

  if (failedTables.length) {
    throw new Error(
      `[accountCleanup] aborting Auth user deletion for ${userId}: failed to delete rows from: ${failedTables.join(', ')}`
    );
  }

  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) throw error;
}

module.exports = { deleteUserData };
