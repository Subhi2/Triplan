import type { AlertSeverity } from "@/lib/alerts";
import type { LngLat } from "@/lib/geo";

/** One CAP alert listed in a SACHET feed (docs/02, "Alerts on the route"). */
export interface CapAlert {
  /** The feed's id for it (the RSS guid): the key of its message and area files. */
  guid: string;
  /** The CAP identifier, "IN-1791630422097019_19". */
  id: string;
  /** The feed it was listed in: a state's short name ("karnataka", "tamil") or "india". */
  feed: string;
  /** "Alert", "Update" or "Cancel". */
  msgType: string;
  /** CAP identifiers this message updates or cancels. */
  references: string[];
  /** "Karnataka-SNDMC", "IMD-Chennai". */
  sender: string;
  /** "IMD Bengaluru": the name in the feed's author line, else the sender. */
  issuer: string;
  /** When the feed listed it (ISO). */
  listed: string;
  event: string;
  headline: string;
  severity: AlertSeverity;
  urgency: string;
  certainty: string;
  onset: string | null;
  expires: string;
  /** "5 districts of Karnataka"; river floods: "Ganga, Patna Gandhighat, Patna, Bihar". */
  area: string;
  /** The districts it covers by LGD code (IMD and most state alerts give them). */
  districtCodes: number[];
  /** Areas given in the message itself, as rings of [lng, lat]; most messages link a file. */
  rings: LngLat[][];
  /** Whether the message links a file of area outlines. */
  hasAreaFile: boolean;
  /** The CAP message. */
  url: string;
}

/** What a feed says about an alert before its message is read. */
export interface AlertListing {
  feed: string;
  /** "IMD Chennai", "Andhra Pradesh SDMA", "CWC". */
  issuer: string | null;
  /** The headline, usually naming the districts. */
  title: string;
}

export interface AlertsProvider {
  /**
   * The alerts listed in these feeds in the last week, newest first, expired ones included, and
   * only those `wanted` from their listing (so other states' messages are never fetched).
   * `complete` is false when some messages were left unread this time (a per-request limit or a
   * failed fetch). Throws when no feed could be read at all.
   */
  alerts(
    feeds: string[],
    wanted?: (listing: AlertListing) => boolean,
  ): Promise<{ alerts: CapAlert[]; complete: boolean }>;
  /** An alert's areas as rings of [lng, lat]; null when they could not be read this time. */
  areas(alert: CapAlert): Promise<LngLat[][] | null>;
}
