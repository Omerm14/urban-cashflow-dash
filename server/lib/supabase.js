const { createClient } = require('@supabase/supabase-js')

// Lazy client construction: requiring this module must not throw when
// SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are unset (e.g. a CI test run that
// only needs pure logic from a module that transitively requires this file).
// The client is built on first real use and cached.
let client = null
const getClient = () => {
  if (!client) {
    client = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY // bypasses RLS — server-only
    )
  }
  return client
}

module.exports = new Proxy({}, {
  get(_target, prop) {
    const value = getClient()[prop]
    return typeof value === 'function' ? value.bind(getClient()) : value
  },
})
