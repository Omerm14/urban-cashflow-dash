// Bails out to the previous reference when an onAuthStateChange firing
// doesn't represent a meaningful change, so React consumers keyed on
// useEffect(..., [user]) / [..., session]) don't re-run on redundant
// emissions (Supabase re-broadcasts the current session to listeners for
// reasons unrelated to an actual auth change — redundant INITIAL_SESSION
// emission, cross-tab BroadcastChannel/storage sync, etc.).
export function stableSession(prev, next) {
  return prev?.access_token === next?.access_token ? prev : next;
}

export function stableUser(prev, next) {
  return (prev?.id ?? null) === (next?.user?.id ?? null) ? prev : (next?.user ?? null);
}
