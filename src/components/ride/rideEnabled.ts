// Whether ride-together rooms can work: Supabase Realtime is set up, or the local test transport
// is on (NEXT_PUBLIC_RIDE_TRANSPORT=local, Playwright only). Kept apart from the channel so the
// planner can check it without loading the Supabase client.
export const RIDE_LOCAL_TRANSPORT = process.env.NEXT_PUBLIC_RIDE_TRANSPORT === "local";

export const rideTogetherEnabled =
  RIDE_LOCAL_TRANSPORT ||
  (Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY));
