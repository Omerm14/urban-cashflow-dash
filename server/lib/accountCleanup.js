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

// Deletes all app-table rows for a user (FK-safe order) then removes the Supabase Auth user
// itself. Shared by self-service account deletion and admin-driven user deletion — the only
// difference between those two call sites is which userId gets passed in and who's allowed to.
async function deleteUserData(userId) {
  await deleteUserAttachments(userId);

  await supabase.from('invoices').delete().eq('user_id', userId);
  await supabase.from('suppliers').delete().eq('user_id', userId);
  await supabase.from('sync_jobs').delete().eq('user_id', userId);
  await supabase.from('integrations').delete().eq('user_id', userId);
  await supabase.from('subscriptions').delete().eq('user_id', userId);

  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) throw error;
}

module.exports = { deleteUserData };
