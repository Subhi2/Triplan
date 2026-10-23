"use client";

import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import {
  pinMessageSchema,
  positionMessageSchema,
  presenceSchema,
  type PinMessage,
  type PositionMessage,
  type RiderPresence,
} from "@/lib/rideRoom";
import { RIDE_LOCAL_TRANSPORT } from "./rideEnabled";

// The room's channel (docs/02, "Ride together"): Supabase Realtime Broadcast and Presence on a
// public channel named after the room. Positions go rider to rider through it and are never
// stored. Tests use the browser's BroadcastChannel instead (NEXT_PUBLIC_RIDE_TRANSPORT=local), so
// they never reach Supabase. Every message from the channel is checked before it is used.

export interface RideHandlers {
  onPosition: (p: PositionMessage) => void;
  /** A rider stopped sharing: their position goes. */
  onGone: (id: string) => void;
  onPin: (p: PinMessage) => void;
  onPresence: (riders: RiderPresence[]) => void;
  /** The channel could not be joined. */
  onError: () => void;
}

export interface RideChannel {
  /** Joins the room; a follower listens without being listed. */
  join(me: RiderPresence): void;
  sendPosition(p: PositionMessage): void;
  sendGone(id: string): void;
  sendPin(p: PinMessage): void;
  leave(): void;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

function handle(handlers: RideHandlers, event: string, payload: unknown) {
  if (event === "pos") {
    const p = positionMessageSchema.safeParse(payload);
    if (p.success) handlers.onPosition(p.data);
  } else if (event === "pin") {
    const p = pinMessageSchema.safeParse(payload);
    if (p.success) handlers.onPin(p.data);
  } else if (event === "gone") {
    const p = positionMessageSchema.shape.id.safeParse((payload as { id?: unknown } | null)?.id);
    if (p.success) handlers.onGone(p.data);
  }
}

function presenceList(entries: unknown[]): RiderPresence[] {
  return entries.flatMap((e) => {
    const p = presenceSchema.safeParse(e);
    return p.success ? [p.data] : [];
  });
}

function supabaseChannel(room: string, handlers: RideHandlers): RideChannel {
  const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let channel: RealtimeChannel | null = null;
  const send = (event: string, payload: object) =>
    void channel?.send({ type: "broadcast", event, payload });
  return {
    join(me) {
      channel = client.channel(`ride:${room}`, {
        config: { broadcast: { self: false }, presence: { key: me.id } },
      });
      for (const event of ["pos", "pin", "gone"]) {
        channel.on("broadcast", { event }, (m: { payload: unknown }) =>
          handle(handlers, event, m.payload),
        );
      }
      channel.on("presence", { event: "sync" }, () => {
        handlers.onPresence(presenceList(Object.values(channel!.presenceState()).flat()));
      });
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") void channel!.track(me);
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") handlers.onError();
      });
    },
    sendPosition: (p) => send("pos", p),
    sendGone: (id) => send("gone", { id }),
    sendPin: (p) => send("pin", p),
    leave() {
      void client.removeAllChannels();
    },
  };
}

/** The test transport: tabs of one browser talk through BroadcastChannel, presence included. */
function localChannel(room: string, handlers: RideHandlers): RideChannel {
  const bc = new BroadcastChannel(`ride:${room}`);
  const present = new Map<string, RiderPresence>();
  let me: RiderPresence | null = null;
  const sync = () => handlers.onPresence([...present.values()]);
  bc.onmessage = (e: MessageEvent<{ event: string; payload: unknown }>) => {
    const { event, payload } = e.data;
    if (event === "hello" || event === "here") {
      const p = presenceSchema.safeParse(payload);
      if (!p.success) return;
      present.set(p.data.id, p.data);
      sync();
      if (event === "hello" && me) bc.postMessage({ event: "here", payload: me });
    } else if (event === "bye") {
      const id = (payload as { id?: string }).id;
      if (id) present.delete(id);
      sync();
    } else handle(handlers, event, payload);
  };
  return {
    join(next) {
      me = next;
      present.set(next.id, next);
      sync();
      bc.postMessage({ event: "hello", payload: next });
    },
    sendPosition: (p) => bc.postMessage({ event: "pos", payload: p }),
    sendGone: (id) => bc.postMessage({ event: "gone", payload: { id } }),
    sendPin: (p) => bc.postMessage({ event: "pin", payload: p }),
    leave() {
      if (me) bc.postMessage({ event: "bye", payload: { id: me.id } });
      bc.close();
    },
  };
}

export function openRideChannel(room: string, handlers: RideHandlers): RideChannel {
  return RIDE_LOCAL_TRANSPORT ? localChannel(room, handlers) : supabaseChannel(room, handlers);
}
