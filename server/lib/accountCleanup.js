const supabase = require('./supabase');

// Deletes all app-table rows for a user (FK-safe order) then removes the Supabase Auth user
// itself. Shared by self-service account deletion and admin-driven user deletion — the only
// difference between those two call sites is which userId gets passed in and who's allowed to.
async function deleteUserData(userId) {
  await supabase.from('invoices').delete().eq('user_id', userId);
  await supabase.from('suppliers').delete().eq('user_id', userId);
  await supabase.from('sync_jobs').delete().eq('user_id', userId);
  await supabase.from('integrations').delete().eq('user_id', userId);
  await supabase.from('subscriptions').delete().eq('user_id', userId);

  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) throw error;
}

module.exports = { deleteUserData };
