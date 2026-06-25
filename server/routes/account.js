const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function deleteAccount(req, res) {
  const userId = req.user.id;
  try {
    // Delete in FK-safe order
    await supabaseAdmin.from('invoices').delete().eq('user_id', userId);
    await supabaseAdmin.from('suppliers').delete().eq('user_id', userId);
    await supabaseAdmin.from('sync_jobs').delete().eq('user_id', userId);
    await supabaseAdmin.from('integrations').delete().eq('user_id', userId);
    await supabaseAdmin.from('subscriptions').delete().eq('user_id', userId);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw error;

    res.json({ ok: true });
  } catch (err) {
    console.error('deleteAccount error', err);
    res.status(500).json({ error: err.message || 'Failed to delete account' });
  }
}

module.exports = { deleteAccount };
