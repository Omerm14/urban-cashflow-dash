// Merge a Google OAuth `tokens` refresh event into stored integration credentials.
// A refresh that returns only a new access_token must not null out the
// refresh_token already on file — Google omits refresh_token on most refreshes.
const mergeTokenUpdate = (credentials, tokens) => {
  const definedTokens = Object.fromEntries(
    Object.entries(tokens).filter(([, value]) => value !== undefined)
  );
  return { ...credentials, ...definedTokens };
};

module.exports = { mergeTokenUpdate };
