"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { PowPayload } from "@/components/posts/postClient";
import type { LngLat } from "@/lib/geo";
import {
  CLUB_ABOUT_MAX,
  CLUB_JOIN_LABELS,
  CLUB_JOIN_POLICIES,
  CLUB_NAME_MAX,
  clubInputSchema,
  COMMUNITY_VEHICLE_LABELS,
  COMMUNITY_VEHICLES,
  type ClubInput,
} from "@/lib/community/schemas";
import type { ClubSummary } from "@/lib/community/views";
import { trackEvent } from "@/lib/track";
import { NicknamePrompt, useRider } from "./RiderGate";
import { communityFetch, startProofOfWork } from "./riderSession";
import {
  chip,
  chipOff,
  chipOn,
  errorText,
  field,
  hint,
  label,
  primaryButton,
  secondaryButton,
} from "./ui";

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Start a club, or (with `slug` and `initial`) change one. A new club is live at once, owned by
 * the rider who starts it. The home point is optional: it puts the club in "clubs near me".
 */
export function ClubForm({
  slug,
  initial,
  onSaved,
  onCancel,
}: {
  slug?: string;
  initial?: Partial<ClubInput>;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const { me, loading } = useRider();
  const [name, setName] = useState(initial?.name ?? "");
  const [about, setAbout] = useState(initial?.about ?? "");
  const [homeLabel, setHomeLabel] = useState(initial?.homeLabel ?? "");
  const [homePoint, setHomePoint] = useState<LngLat | null>(initial?.homePoint ?? null);
  const [vehicle, setVehicle] = useState<ClubInput["vehicle"]>(initial?.vehicle ?? "any");
  const [joinPolicy, setJoinPolicy] = useState<ClubInput["joinPolicy"]>(
    initial?.joinPolicy ?? "approval",
  );
  const [whatsapp, setWhatsapp] = useState(initial?.whatsappUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pow = useRef<Promise<PowPayload> | null>(null);

  useEffect(() => {
    if (!slug && me) pow.current ??= startProofOfWork();
  }, [slug, me]);

  function locate() {
    navigator.geolocation?.getCurrentPosition(
      (p) => setHomePoint([round3(p.coords.longitude), round3(p.coords.latitude)]),
      () => setError("Could not get your location. The club works without it."),
      { maximumAge: 600_000, timeout: 15_000 },
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = clubInputSchema.safeParse({
      name,
      about,
      homeLabel,
      homePoint,
      vehicle,
      joinPolicy,
      whatsappUrl: whatsapp,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(
        issue?.path[0] === "name"
          ? "Give the club a name of 3 to 60 characters."
          : issue?.path[0] === "homeLabel"
            ? "Say where the club rides from (a town or city)."
            : (issue?.message ?? "Check the form."),
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (slug) {
        await communityFetch(`/api/clubs/${slug}`, {
          method: "PATCH",
          body: { club: parsed.data },
        });
        onSaved?.();
      } else {
        pow.current ??= startProofOfWork();
        const proof = await pow.current;
        pow.current = null;
        const { club } = await communityFetch<{ club: ClubSummary }>("/api/clubs", {
          method: "POST",
          body: { club: parsed.data, pow: proof },
        });
        trackEvent("club_created");
        router.push(`/clubs/${club.slug}`);
      }
    } catch (err) {
      pow.current = null;
      setError(err instanceof Error ? err.message : "Could not save the club");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;
  if (!me && !slug) return <NicknamePrompt why="as the club's owner" onReady={() => {}} />;

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4"
      aria-label={slug ? "Edit club" : "Start a club"}
    >
      <label className={label}>
        Club name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={CLUB_NAME_MAX}
          required
          className={field}
        />
      </label>
      <div className="flex flex-col gap-1">
        <label className={label}>
          Rides from
          <input
            value={homeLabel}
            onChange={(e) => setHomeLabel(e.target.value)}
            maxLength={60}
            placeholder="Bengaluru"
            required
            className={field}
          />
        </label>
        {/* Outside the label: a button inside it would join the input's name. */}
        <p className={hint}>
          {homePoint ? (
            <>
              Shown to riders near you.{" "}
              <button
                type="button"
                onClick={() => setHomePoint(null)}
                className="inline-flex min-h-11 items-center font-bold underline md:min-h-0"
              >
                Remove the location
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={locate}
                className="inline-flex min-h-11 items-center font-bold underline md:min-h-0"
              >
                Use my location
              </button>{" "}
              to show the club to riders nearby (rounded to about 100 m).
            </>
          )}
        </p>
      </div>
      <label className={label}>
        About the club
        <textarea
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          maxLength={CLUB_ABOUT_MAX}
          rows={4}
          className={`${field} py-2`}
          placeholder="Weekend rides to the ghats, steady pace, everyone waits at turns."
        />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-bold">Who rides</legend>
        <div className="flex flex-wrap gap-2">
          {COMMUNITY_VEHICLES.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={vehicle === v}
              onClick={() => setVehicle(v)}
              className={`${chip} ${vehicle === v ? chipOn : chipOff}`}
            >
              {COMMUNITY_VEHICLE_LABELS[v]}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-bold">Joining</legend>
        <div className="flex flex-wrap gap-2">
          {CLUB_JOIN_POLICIES.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={joinPolicy === p}
              onClick={() => setJoinPolicy(p)}
              className={`${chip} ${joinPolicy === p ? chipOn : chipOff}`}
            >
              {CLUB_JOIN_LABELS[p]}
            </button>
          ))}
        </div>
        <span className={hint}>
          {joinPolicy === "open"
            ? "Riders join with one tap."
            : joinPolicy === "approval"
              ? "You and the club's admins say yes to each rider."
              : "Only riders with your invite link get in."}
        </span>
      </fieldset>
      <label className={label}>
        WhatsApp group link (optional)
        <input
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          inputMode="url"
          placeholder="https://chat.whatsapp.com/…"
          className={field}
        />
        <span className={hint}>Only the club&apos;s members see it.</span>
      </label>
      {error && (
        <p role="alert" className={errorText}>
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? "Saving…" : slug ? "Save changes" : "Start the club"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={secondaryButton}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
