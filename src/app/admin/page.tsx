import type { Metadata } from "next";
import Link from "next/link";
import { CONTENT_REPORT_LABELS, PLACE_FLAG_LABELS, ROAD_REPORT_LABELS } from "@/lib/riderPosts";
import { SITE_NAME, siteUrl } from "@/lib/site";
import { adminEmails, currentAdmin } from "@/server/auth/admin";
import type { Moderation } from "@/server/providers/llm/moderation";
import { pendingPosts, pendingTakedowns } from "@/server/services/riderPostService";
import { ridePhotosOf, rideSlugFromLink } from "@/server/services/ridePhotoAdmin";
import { pendingPlaces } from "@/server/services/contributeService";
import { categoryStyle } from "@/lib/categories";
import {
  decideFlag,
  decideNewPlace,
  decideTakedown,
  hidePhoto,
  moderate,
  sendSignInLink,
  signOut,
  takeDown,
} from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Admin · ${SITE_NAME}`,
  robots: { index: false, follow: false },
};

const button =
  "inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-bold md:min-h-9";
const when = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

/** The pre-screen's verdict as a small label: what the admin should look at first. */
function Verdict({ moderation }: { moderation: Moderation | null }) {
  if (!moderation) {
    return <span className="text-xs text-stone-600 dark:text-stone-400">Not pre-screened</span>;
  }
  const flagged = moderation.verdict !== "ok";
  return (
    <span
      className={`text-xs ${flagged ? "font-bold text-red-700 dark:text-red-400" : "text-stone-600 dark:text-stone-400"}`}
    >
      Pre-screen: {moderation.verdict.replace("_", " ")} · {moderation.reason}
    </span>
  );
}

/** Approve and Reject, each its own form: the decision travels as a field, not as the button. */
function Decide({ kind, id }: { kind: "review" | "photo" | "report"; id: string }) {
  const choices = [
    { decision: "verified", label: "Approve", style: "bg-brand text-white" },
    {
      decision: "rejected",
      label: "Reject",
      style: "border border-stone-300 dark:border-stone-600",
    },
  ] as const;
  return (
    <div className="flex gap-2">
      {choices.map((c) => (
        <form key={c.decision} action={moderate}>
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="decision" value={c.decision} />
          <button type="submit" className={`${button} ${c.style}`}>
            {c.label}
          </button>
        </form>
      ))}
    </div>
  );
}

function Empty({ what }: { what: string }) {
  return <p className="text-sm text-stone-600 dark:text-stone-400">No {what} waiting.</p>;
}

/**
 * The admin queue (docs/02, "Reviews, photos and road reports"): riders' reviews, photos and road
 * reports wait here until approved. Only addresses in ADMIN_EMAILS can sign in, by email link.
 */
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; link?: string; takedown?: string; ride?: string }>;
}) {
  const { sent, link, takedown, ride } = await searchParams;
  const admin = await currentAdmin();

  if (!admin) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-10">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Admin</h1>
        {adminEmails().length === 0 ? (
          <p className="text-sm">No admin is set up (ADMIN_EMAILS is empty).</p>
        ) : (
          <form action={sendSignInLink} className="flex flex-col gap-2">
            <label htmlFor="email" className="text-sm font-bold">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="min-h-11 rounded-md border border-stone-300 bg-white px-2 text-base md:min-h-9 md:text-sm dark:border-stone-700 dark:bg-stone-900"
            />
            <button type="submit" className={`${button} bg-brand self-start text-white`}>
              Send sign-in link
            </button>
          </form>
        )}
        <p role="status" className="text-sm">
          {sent &&
            "If this address is an admin's, a sign-in link is on its way. Open it on this device."}
          {link === "failed" && "That link did not work or has expired. Ask for a new one."}
        </p>
        <Link href="/" className="text-brand text-sm underline dark:text-teal-300">
          Back to {SITE_NAME}
        </Link>
      </main>
    );
  }

  const rideSlug = ride ? rideSlugFromLink(ride, siteUrl()) : null;
  const [{ reviews, photos, reports, flags }, requests, ridePhotos, newPlaces] = await Promise.all([
    pendingPosts(),
    pendingTakedowns(),
    rideSlug ? ridePhotosOf(rideSlug) : Promise.resolve(null),
    pendingPlaces(),
  ]);
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">
            Waiting for a check
          </h1>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Signed in as {admin}. Nothing shows to riders until it is approved.
          </p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className={`${button} border border-stone-300 dark:border-stone-600`}
          >
            Sign out
          </button>
        </form>
      </header>

      <section aria-labelledby="reviews" className="flex flex-col gap-3">
        <h2 id="reviews" className="font-display text-xl font-bold">
          Reviews ({reviews.length})
        </h2>
        {reviews.length === 0 && <Empty what="reviews" />}
        <ul className="flex flex-col gap-3">
          {reviews.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-1.5 rounded-xl border border-stone-200 p-3 dark:border-stone-700"
            >
              <p className="text-sm">
                <Link href={`/place/${r.placeSlug}`} className="font-bold underline">
                  {r.placeName}
                </Link>{" "}
                · {"★".repeat(r.rating)}
                <span className="text-stone-400">{"★".repeat(5 - r.rating)}</span> ·{" "}
                {r.nickname ?? "No name"} · {when.format(new Date(r.createdAt))}
              </p>
              {r.body && <p className="text-sm whitespace-pre-line">{r.body}</p>}
              <Verdict moderation={r.moderation} />
              <Decide kind="review" id={r.id} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="photos" className="flex flex-col gap-3">
        <h2 id="photos" className="font-display text-xl font-bold">
          Photos ({photos.length})
        </h2>
        {photos.length === 0 && <Empty what="photos" />}
        <ul className="grid gap-3 sm:grid-cols-2">
          {photos.map((m) => (
            <li
              key={m.id}
              className="flex flex-col gap-1.5 rounded-xl border border-stone-200 p-3 dark:border-stone-700"
            >
              <a href={m.url} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- a rider's photo from our storage, already resized */}
                <img
                  src={m.thumbUrl ?? m.url}
                  alt={`Photo of ${m.placeName} by ${m.author ?? "a rider"}`}
                  loading="lazy"
                  className="aspect-video w-full rounded-md bg-stone-100 object-cover dark:bg-stone-800"
                />
              </a>
              <p className="text-sm">
                <Link href={`/place/${m.placeSlug}`} className="font-bold underline">
                  {m.placeName}
                </Link>{" "}
                · {m.author ?? "No name"} · {when.format(new Date(m.createdAt))}
              </p>
              <Decide kind="photo" id={m.id} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="reports" className="flex flex-col gap-3">
        <h2 id="reports" className="font-display text-xl font-bold">
          Road reports ({reports.length})
        </h2>
        {reports.length === 0 && <Empty what="road reports" />}
        <ul className="flex flex-col gap-3">
          {reports.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-1.5 rounded-xl border border-stone-200 p-3 dark:border-stone-700"
            >
              <p className="text-sm">
                <span className="font-bold">{ROAD_REPORT_LABELS[r.kind]}</span> ·{" "}
                <a
                  href={`https://www.openstreetmap.org/?mlat=${r.location[1]}&mlon=${r.location[0]}#map=15/${r.location[1]}/${r.location[0]}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  on the map
                </a>{" "}
                · {r.nickname ?? "No name"} · {when.format(new Date(r.createdAt))}, until{" "}
                {when.format(new Date(r.expiresAt))}
              </p>
              {r.note && <p className="text-sm">{r.note}</p>}
              <Verdict moderation={r.moderation} />
              <Decide kind="report" id={r.id} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="flags" className="flex flex-col gap-3">
        <h2 id="flags" className="font-display text-xl font-bold">
          Places riders flagged ({flags.length})
        </h2>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          &ldquo;Something&apos;s wrong here&rdquo; on a place. Hide takes the place off the site
          (the OpenStreetMap import keeps it hidden); Fixed is for when you corrected it; Dismiss
          when nothing was wrong.
        </p>
        {flags.length === 0 && <Empty what="flags" />}
        <ul className="flex flex-col gap-3">
          {flags.map((f) => (
            <li
              key={f.id}
              className="flex flex-col gap-1.5 rounded-xl border border-stone-200 p-3 dark:border-stone-700"
            >
              <p className="text-sm">
                <a href={`/place/${f.placeSlug}`} className="font-bold underline">
                  {f.placeName}
                </a>{" "}
                · {PLACE_FLAG_LABELS[f.kind]} · {when.format(new Date(f.createdAt))}
                {f.onPlace > 1 && (
                  <span className="font-bold"> · {f.onPlace} riders flagged this place</span>
                )}
              </p>
              {f.note && <p className="text-sm">{f.note}</p>}
              <Verdict moderation={f.moderation} />
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { action: "hide", label: "Hide the place", style: "bg-brand text-white" },
                    {
                      action: "done",
                      label: "Fixed",
                      style: "border border-stone-300 dark:border-stone-600",
                    },
                    {
                      action: "dismiss",
                      label: "Dismiss",
                      style: "border border-stone-300 dark:border-stone-600",
                    },
                  ] as const
                ).map((c) => (
                  <form key={c.action} action={decideFlag}>
                    <input type="hidden" name="id" value={f.id} />
                    <input type="hidden" name="action" value={c.action} />
                    <button type="submit" className={`${button} ${c.style}`}>
                      {c.label}
                    </button>
                  </form>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="new-places" className="flex flex-col gap-3">
        <h2 id="new-places" className="font-display text-xl font-bold">
          New places from riders ({newPlaces.length})
        </h2>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          From &ldquo;Add a place&rdquo;. Check the pin on the map; approved places show on routes.
        </p>
        {newPlaces.length === 0 && <Empty what="new places" />}
        <ul className="flex flex-col gap-3">
          {newPlaces.map((p) => (
            <li
              key={p.id}
              className="flex flex-col gap-1.5 rounded-xl border border-stone-200 p-3 dark:border-stone-700"
            >
              <p className="text-sm">
                <span className="font-bold">{p.name}</span> · {categoryStyle(p.category).name} ·{" "}
                <a
                  href={`https://www.openstreetmap.org/?mlat=${p.location[1]}&mlon=${p.location[0]}#map=17/${p.location[1]}/${p.location[0]}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  the pin on OpenStreetMap
                </a>{" "}
                · {when.format(new Date(p.createdAt))}
              </p>
              {p.bestMonths.length > 0 && (
                <p className="text-sm">Best months: {p.bestMonths.join(", ")}</p>
              )}
              {p.note && <p className="text-sm whitespace-pre-line">{p.note}</p>}
              {p.link && (
                <p className="text-sm break-all">
                  Link:{" "}
                  <a href={p.link} target="_blank" rel="noopener noreferrer" className="underline">
                    {p.link}
                  </a>
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { decision: "approve", label: "Approve", style: "bg-brand text-white" },
                    {
                      decision: "reject",
                      label: "Reject",
                      style: "border border-stone-300 dark:border-stone-600",
                    },
                  ] as const
                ).map((c) => (
                  <form key={c.decision} action={decideNewPlace}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="decision" value={c.decision} />
                    <button type="submit" className={`${button} ${c.style}`}>
                      {c.label}
                    </button>
                  </form>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="requests" className="flex flex-col gap-3">
        <h2 id="requests" className="font-display text-xl font-bold">
          Takedown requests ({requests.length})
        </h2>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Sent from the form on /terms. Take the content down with the tools on this page (reject a
          post above, hide a flagged place, or a club or ride below), then mark the request done.
          Answer through the contact if there is one.
        </p>
        {requests.length === 0 && <Empty what="takedown requests" />}
        <ul className="flex flex-col gap-3">
          {requests.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-1.5 rounded-xl border border-stone-200 p-3 dark:border-stone-700"
            >
              <p className="text-sm">
                <a href={r.path} className="font-bold break-all underline">
                  {r.path}
                </a>{" "}
                · {CONTENT_REPORT_LABELS[r.kind]} · {when.format(new Date(r.createdAt))}
              </p>
              <p className="text-sm whitespace-pre-line">{r.note}</p>
              {r.contact && <p className="text-sm">Answer to: {r.contact}</p>}
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { action: "done", label: "Done", style: "bg-brand text-white" },
                    {
                      action: "dismiss",
                      label: "Dismiss",
                      style: "border border-stone-300 dark:border-stone-600",
                    },
                  ] as const
                ).map((c) => (
                  <form key={c.action} action={decideTakedown}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="action" value={c.action} />
                    <button type="submit" className={`${button} ${c.style}`}>
                      {c.label}
                    </button>
                  </form>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="ride-photos" className="flex flex-col gap-3">
        <h2 id="ride-photos" className="font-display text-xl font-bold">
          Hide a ride photo
        </h2>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          For a gallery photo that does not show its road. Paste the ride&rsquo;s link; a hidden
          photo stays out when the photos are imported again.
        </p>
        <form method="get" action="/admin#ride-photos" className="flex flex-wrap gap-2">
          <input
            name="ride"
            required
            defaultValue={rideSlug ? `/rides/${rideSlug}` : ""}
            aria-label="Ride link"
            placeholder="/rides/…"
            className="min-h-11 min-w-60 flex-1 rounded-md border border-stone-300 bg-white px-2 text-base md:min-h-9 md:text-sm dark:border-stone-700 dark:bg-stone-900"
          />
          <button
            type="submit"
            className={`${button} border border-stone-300 dark:border-stone-600`}
          >
            Show its photos
          </button>
        </form>
        {ride && !rideSlug && <p className="text-sm">That is not a ride&rsquo;s link.</p>}
        {ridePhotos && ridePhotos.length === 0 && (
          <p className="text-sm">This ride has no photos.</p>
        )}
        {ridePhotos && ridePhotos.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {ridePhotos.map((p) => (
              <li key={p.file} className="flex flex-col gap-1 text-xs">
                {/* Commons thumbnails, shown from Commons with the file named under them. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.thumbUrl}
                  alt={p.caption}
                  className="aspect-[4/3] w-full rounded-lg object-cover"
                />
                <span className="break-all">
                  km {Math.round(p.kmFromStart)} · {p.file.replace(/^File:/, "")}
                </span>
                <form action={hidePhoto}>
                  <input type="hidden" name="slug" value={rideSlug!} />
                  <input type="hidden" name="file" value={p.file} />
                  <button
                    type="submit"
                    className={`${button} border border-stone-300 dark:border-stone-600`}
                  >
                    Hide
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="takedown" className="flex flex-col gap-3">
        <h2 id="takedown" className="font-display text-xl font-bold">
          Take down a club or group ride
        </h2>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Clubs and rides go up without a check and are run by their own hosts. Remove one only for
          a legal request: paste its link. Its members and riders go with it.
        </p>
        <form action={takeDown} className="flex flex-wrap gap-2">
          <input
            name="link"
            required
            aria-label="Club or ride link"
            placeholder="/clubs/… or /group-rides/…"
            className="min-h-11 min-w-60 flex-1 rounded-md border border-stone-300 bg-white px-2 text-base md:min-h-9 md:text-sm dark:border-stone-700 dark:bg-stone-900"
          />
          <button
            type="submit"
            className={`${button} border border-stone-300 dark:border-stone-600`}
          >
            Take down
          </button>
        </form>
        {takedown && (
          <p role="status" className="text-sm">
            {takedown === "done" ? "Taken down." : "No club or ride at that link."}
          </p>
        )}
      </section>
    </main>
  );
}
