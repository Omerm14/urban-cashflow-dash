const auth     = require('../middleware/auth')
const supabase = require('../lib/supabase')

// Cost per 1M tokens (claude-haiku-4-5): $0.80 input, $4.00 output
const INPUT_COST  = 0.80 / 1_000_000
const OUTPUT_COST = 4.00 / 1_000_000

module.exports = [auth, async (req, res) => {
  if (req.user.email?.toLowerCase() !== process.env.ADMIN_EMAIL?.toLowerCase()) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  try {
    // Fetch all api_calls with user emails via auth.users
    const { data: calls, error } = await supabase
      .from('api_calls')
      .select('user_id, model, input_tokens, output_tokens, ts')
      .order('ts', { ascending: true })

    if (error) throw error

    // Fetch user emails for all user_ids
    const userIds = [...new Set(calls.map(c => c.user_id).filter(Boolean))]
    const emailMap = {}
    if (userIds.length) {
      // Use admin API to get user emails
      const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 })
      users.forEach(u => { emailMap[u.id] = u.email })
    }

    // Aggregate by user
    const byUserMap = {}
    let totalCalls = 0, totalInput = 0, totalOutput = 0

    calls.forEach(c => {
      const email = emailMap[c.user_id] || c.user_id || 'unknown'
      if (!byUserMap[email]) byUserMap[email] = { email, calls: 0, inputTokens: 0, outputTokens: 0 }
      byUserMap[email].calls++
      byUserMap[email].inputTokens  += c.input_tokens  || 0
      byUserMap[email].outputTokens += c.output_tokens || 0
      totalCalls++
      totalInput  += c.input_tokens  || 0
      totalOutput += c.output_tokens || 0
    })

    const byUser = Object.values(byUserMap).map(u => ({
      ...u,
      estimatedCostUSD: u.inputTokens * INPUT_COST + u.outputTokens * OUTPUT_COST,
    })).sort((a, b) => b.calls - a.calls)

    // Build daily timeline (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const dayMap = {}
    calls.filter(c => c.ts >= thirtyDaysAgo).forEach(c => {
      const day = c.ts.split('T')[0]
      dayMap[day] = (dayMap[day] || 0) + 1
    })
    const timeline = Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, calls]) => ({ date, calls }))

    res.json({
      totals: {
        calls: totalCalls,
        inputTokens: totalInput,
        outputTokens: totalOutput,
        estimatedCostUSD: totalInput * INPUT_COST + totalOutput * OUTPUT_COST,
      },
      byUser,
      timeline,
    })
  } catch (err) {
    console.error('Admin usage error:', err.message)
    res.status(500).json({ error: err.message })
  }
}]
