"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PowPayload } from "@/components/posts/postClient";
import { ShareButtons } from "@/components/site/ShareButtons";
import {
  canActOnClubMember,
  canClub,
  CLUB_ROLE_LABELS,
  type ClubSeat,
} from "@/lib/community/roles";
import type { ClubMemberAction } from "@/lib/community/schemas";
import { clubInviteText } from "@/lib/community/shareText";
import type { ClubMemberRow, ClubPublic, ClubView } from "@/lib/community/views";
import { GroupRideCard } from "./Cards";
import { ClubForm } from "./ClubForm";
import { NicknamePrompt, useRider } from "./RiderGate";
import { communityFetch, startProofOfWork } from "./riderSession";
import {
  card,
  dangerButton,
  errorText,
  field,
  hint,
  label,
  linkButton,
  muted,
  primaryButton,
  secondaryButton,
  softButton,
} from "./ui";

const since = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

/** The buttons an owner or admin gets on one member or request. */
function memberActions(me: ClubSeat | null, m: ClubMemberRow, self: boolean): ClubMemberAction[] {
  if (!canActOnClubMember(me, m, self)) return [];
  if (m.status === "pending") return ["approve", "decline", "block"];
  if (m.status === "blocked") return ["unblock"];
  const roles: ClubMemberAction[] = canClub(me, "set_admins")
    ? m.role === "admin"
      ? ["make_member", "make_owner"]
      : ["make_admin", "make_owner"]
    : [];
  return [...roles, "remove", "block"];
}

const ACTION_LABELS: Record<ClubMemberAction, string> = {
  approve: "Approve",
  decline: "Decline",
  remove: "Remove",
  block: "Block",
  unblock: "Unblock",
  make_admin: "Make admin",
  make_member: "Make member",
  make_owner: "Make owner",
};

function MemberList({
  title,
  rows,
  seat,
  myId,
  busy,
  onAct,
}: {
  title: string;
  rows: ClubMemberRow[];
  seat: ClubSeat | null;
  myId: string | null;
  busy: boolean;
  onAct: (m: ClubMemberRow, a: ClubMemberAction) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="font-display text-lg font-bold">
        {title} <span className="tabular font-mono text-sm font-normal">{rows.length}</span>
      </h2>
      <ul className="flex flex-col divide-y divide-stone-200 dark:divide-stone-700">
        {rows.map((m) => {
          const actions = memberActions(seat, m, m.riderId === myId);
          return (
            <li key={m.riderId} data-member={m.nickname} className="flex flex-col gap-2 py-2">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-bold">{m.nickname}</span>
                {m.status === "active" && m.role !== "member" && (
                  <span className="text-brand-dark text-xs font-bold uppercase dark:text-teal-300">
                    {CLUB_ROLE_LABELS[m.role]}
                  </span>
                )}
                {m.riderId === myId && <span className={`text-xs ${muted}`}>(you)</span>}
                <span className={`text-xs ${muted}`}>since {since.format(new Date(m.at))}</span>
              </div>
              {m.note && <p className={`text-sm ${muted}`}>“{m.note}”</p>}
              {actions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {actions.map((a) => (
                    <button
                      key={a}
                      type="button"
                      disabled={busy}
                      onClick={() => onAct(m, a)}
                      className={
                        a === "approve"
                          ? softButton
                          : a === "block" || a === "remove"
                            ? dangerButton
                            : secondaryButton
                      }
                    >
                      {ACTION_LABELS[a]}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * A club page's own part for this viewer (docs/02, "Community (G6)"): join or ask to join, the
 * WhatsApp link and members for members, and for owners and admins the requests, roles, invite
 * link and the club's details. Loaded in the browser; the server renders the public header.
 */
export function ClubDetail({ initial, invite }: { initial: ClubPublic; invite: string | null }) {
  const { me, loading } = useRider();
  const [view, setView] = useState<ClubView | null>(null);
  const [asking, setAsking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const pow = useRef<Promise<PowPayload> | null>(null);
  const slug = initial.slug;

  const reload = useCallback(async () => {
    try {
      setView(await communityFetch<ClubView>(`/api/clubs/${slug}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the club");
    }
  }, [slug]);

  useEffect(() => {
    if (!loading) void reload();
  }, [loading, me, reload]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
    } catch (err) {
      pow.current = null;
      setError(err instanceof Error ? err.message : "That did not work");
    } finally {
      setBusy(false);
    }
  }

  const join = () =>
    run(async () => {
      pow.current ??= startProofOfWork();
      const proof = await pow.current;
      pow.current = null;
      await communityFetch(`/api/clubs/${slug}/members`, {
        method: "POST",
        body: { note, invite, pow: proof },
      });
      setAsking(false);
    });

  const act = (m: ClubMemberRow, action: ClubMemberAction) => {
    if (
      action === "make_owner" &&
      !window.confirm(`Make ${m.nickname} the owner? You become an admin.`)
    )
      return;
    if (action === "block" && !window.confirm(`Block ${m.nickname} from this club?`)) return;
    void run(() =>
      communityFetch(`/api/clubs/${slug}/members/${m.riderId}`, {
        method: "POST",
        body: { action },
      }),
    );
  };

  const seat = view?.me?.seat ?? null;
  const club = view?.club ?? initial;
  const isMember = seat?.status === "active";
  const canManage = canClub(seat, "manage_members");
  const directJoin = club.joinPolicy === "open" || Boolean(invite);

  function startAsking() {
    setAsking(true);
    pow.current ??= startProofOfWork();
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Your membership" className={`${card} flex flex-col gap-3`}>
        {loading || !view ? (
          <p className={muted}>Loading…</p>
        ) : seat?.status === "blocked" ? (
          <p className={muted}>You can&apos;t join this club.</p>
        ) : seat?.status === "pending" ? (
          <>
            <p className="font-bold">You asked to join. The club&apos;s admins will decide.</p>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(() => communityFetch(`/api/clubs/${slug}/members`, { method: "DELETE" }))
              }
              className={`${secondaryButton} self-start`}
            >
              Take back my request
            </button>
          </>
        ) : isMember ? (
          <>
            <p className="font-bold">
              You&apos;re{" "}
              {seat.role === "member"
                ? "a member"
                : `the club's ${CLUB_ROLE_LABELS[seat.role].toLowerCase()}`}
              .
            </p>
            {view.whatsappUrl && (
              <a
                href={view.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`${softButton} self-start`}
              >
                Open the club&apos;s WhatsApp group
              </a>
            )}
            <div className="flex flex-wrap gap-2">
              {canClub(seat, "host_ride") && (
                <Link href={`/group-rides/new?club=${slug}`} className={primaryButton}>
                  Host a club ride
                </Link>
              )}
              {seat.role !== "owner" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm("Leave this club?")) {
                      void run(() =>
                        communityFetch(`/api/clubs/${slug}/members`, { method: "DELETE" }),
                      );
                    }
                  }}
                  className={secondaryButton}
                >
                  Leave the club
                </button>
              )}
            </div>
          </>
        ) : club.joinPolicy === "invite" && !invite ? (
          <p className={muted}>
            This club takes members by invite link only. Ask a member for one.
          </p>
        ) : !me ? (
          asking ? (
            <NicknamePrompt
              why="for the club"
              onReady={() => {}}
              onCancel={() => setAsking(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAsking(true)}
              className={`${primaryButton} self-start`}
            >
              {directJoin ? "Join the club" : "Ask to join"}
            </button>
          )
        ) : asking ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void join();
            }}
            className="flex flex-col gap-2"
          >
            {!directJoin && (
              <label className={label}>
                A note for the admins (optional)
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={300}
                  rows={2}
                  className={`${field} py-2`}
                  placeholder="I ride a Himalayan, mostly weekends."
                />
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={busy} className={primaryButton}>
                {busy ? "Sending…" : directJoin ? "Join" : "Send request"}
              </button>
              <button type="button" onClick={() => setAsking(false)} className={secondaryButton}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={startAsking} className={`${primaryButton} self-start`}>
            {directJoin ? "Join the club" : "Ask to join"}
          </button>
        )}
        {error && (
          <p role="alert" className={errorText}>
            {error}
          </p>
        )}
      </section>

      <section aria-label="Coming rides" className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-bold">Coming rides</h2>
        {(view?.rides ?? []).length === 0 ? (
          <p className={muted}>No rides coming up yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {view!.rides!.map((r) => (
              <li key={r.id}>
                <GroupRideCard ride={r} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {canManage && view && (
        <section aria-label="Run the club" className={`${card} flex flex-col gap-4`}>
          <h2 className="font-display text-xl font-bold">Run the club</h2>
          <MemberList
            title="Asking to join"
            rows={view.requests ?? []}
            seat={seat}
            myId={me?.id ?? null}
            busy={busy}
            onAct={act}
          />
          {(view.requests ?? []).length === 0 && (
            <p className={`text-sm ${muted}`}>No requests waiting.</p>
          )}
          <div className="flex flex-col gap-2">
            <h3 className="font-bold">Invite link</h3>
            <p className={`text-sm ${muted}`}>
              Riders with the link join without waiting. Making a new link stops the old one.
              {view.hasInvite && !inviteLink && " A link is set."}
            </p>
            {inviteLink ? (
              <div className="flex flex-col gap-1">
                <input
                  readOnly
                  value={inviteLink}
                  aria-label="Invite link"
                  className={field}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <span className={hint}>Shown once: copy or share it now.</span>
                <ShareButtons
                  title={club.name}
                  text={clubInviteText(club.name)}
                  path={inviteLink.replace(window.location.origin, "")}
                  linkClassName={linkButton}
                />
              </div>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const { token } = await communityFetch<{ token: string }>(
                      `/api/clubs/${slug}/invite`,
                      { method: "POST" },
                    );
                    setInviteLink(`${window.location.origin}/clubs/${slug}?invite=${token}`);
                  })
                }
                className={`${secondaryButton} self-start`}
              >
                {view.hasInvite ? "Make a new invite link" : "Make an invite link"}
              </button>
            )}
          </div>
          {editing ? (
            <ClubForm
              slug={slug}
              initial={{ ...club, whatsappUrl: view.whatsappUrl ?? null }}
              onSaved={() => {
                setEditing(false);
                window.location.reload();
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setEditing(true)} className={secondaryButton}>
                Edit the club
              </button>
              {canClub(seat, "delete") && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(`Delete ${club.name} and its rides? This can't be undone.`)
                    ) {
                      void run(async () => {
                        await communityFetch(`/api/clubs/${slug}`, { method: "DELETE" });
                        window.location.assign("/clubs");
                      });
                    }
                  }}
                  className={dangerButton}
                >
                  Delete the club
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {view?.members && (
        <MemberList
          title="Members"
          rows={view.members}
          seat={seat}
          myId={me?.id ?? null}
          busy={busy}
          onAct={act}
        />
      )}
      {canManage && view?.blocked && (
        <MemberList
          title="Blocked"
          rows={view.blocked}
          seat={seat}
          myId={me?.id ?? null}
          busy={busy}
          onAct={act}
        />
      )}
    </div>
  );
}
