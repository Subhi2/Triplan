// Whether clubs and group rides show (docs/02, "Community (G6)"): riders need a device account,
// which comes from Supabase Auth, or from the local test accounts (NEXT_PUBLIC_COMMUNITY_AUTH=local,
// Playwright only). NEXT_PUBLIC_COMMUNITY=0 hides it all. Posting also needs ALTCHA_HMAC_KEY: the
// server answers 503 without it, like riders' reviews.

export const COMMUNITY_LOCAL_AUTH = process.env.NEXT_PUBLIC_COMMUNITY_AUTH === "local";

export const communityEnabled =
  process.env.NEXT_PUBLIC_COMMUNITY !== "0" &&
  (COMMUNITY_LOCAL_AUTH ||
    (Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)));
