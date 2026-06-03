const auth     = require('../middleware/auth')
const supabase = require('../lib/supabase')

// Cost per 1M tokens, by model [input, output] in USD. The app runs claude-sonnet-4-6
// for invoice extraction; other models may appear on the shared API key. Cost is computed
// per row from the model recorded on each api_calls entry so the estimate matches reality.
const PRICING = {
  'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
  'claude-haiku-4-5':  { input: 1.00, output: 5.00 },
}
const DEFAULT_PRICING = PRICING['claude-sonnet-4-6']

// Match by prefix so dated snapshots (e.g. claude-sonnet-4-6-20250101) resolve correctly.
const priceFor = model =>
  PRICING[Object.keys(PRICING).find(k => (model || '').startsWith(k))] || DEFAULT_PRICING

const costOf = (model, input, output) => {
  const p = priceFor(model)
  return (input * p.input + output * p.output) / 1_000_000
}

module.exports = [auth, async (req, res) => {
  if (req.user.email !== process.env.ADMIN_EMAIL) {
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
    let totalCalls = 0, totalInput = 0, totalOutput = 0, totalCost = 0

    calls.forEach(c => {
      const email = emailMap[c.user_id] || c.user_id || 'unknown'
      if (!byUserMap[email]) byUserMap[email] = { email, calls: 0, inputTokens: 0, outputTokens: 0, estimatedCostUSD: 0 }
      const input  = c.input_tokens  || 0
      const output = c.output_tokens || 0
      const cost   = costOf(c.model, input, output)
      byUserMap[email].calls++
      byUserMap[email].inputTokens  += input
      byUserMap[email].outputTokens += output
      byUserMap[email].estimatedCostUSD += cost
      totalCalls++
      totalInput  += input
      totalOutput += output
      totalCost   += cost
    })

    const byUser = Object.values(byUserMap).sort((a, b) => b.calls - a.calls)

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
        estimatedCostUSD: totalCost,
      },
      byUser,
      timeline,
    })
  } catch (err) {
    console.error('Admin usage error:', err.message)
    res.status(500).json({ error: err.message })
  }
}]
