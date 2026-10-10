"use client";

import { useEffect, useState } from "react";
import { whatsAppUrl } from "@/lib/site";
import { trackEvent } from "@/lib/track";

interface Props {
  /** The share sheet's title. */
  title: string;
  /** The message that goes with the link. */
  text: string;
  /** A path on this site to share; the current address when left out. */
  path?: string;
  /** Class for each button and link, so they match where they sit. */
  linkClassName: string;
  /** Where "Link copied." goes; without it the buttons show it themselves. */
  onNotice?: (message: string) => void;
}

/**
 * Share a link: the phone's share sheet on touch screens, WhatsApp and "Copy link" elsewhere
 * (desktop share sheets rarely include WhatsApp). Nothing renders until mounted: the links need
 * window.location, which the server does not have.
 */
export function ShareButtons({ title, text, path, linkClassName, onNotice }: Props) {
  const [shareWith, setShareWith] = useState<"sheet" | "links" | null>(null);
  const [ownNotice, setOwnNotice] = useState("");
  const notice = onNotice ?? setOwnNotice;
  useEffect(() => {
    setShareWith(
      typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches
        ? "sheet"
        : "links",
    );
  }, []);

  const url = () => (path ? `${window.location.origin}${path}` : window.location.href);

  async function copyLink() {
    trackEvent("share");
    const href = url();
    try {
      await navigator.clipboard.writeText(href);
      notice("Link copied.");
    } catch {
      notice(`Share this link: ${href}`);
    }
  }

  async function share() {
    trackEvent("share");
    try {
      await navigator.share({ title, text, url: url() });
    } catch (err) {
      // AbortError: the rider closed the share sheet.
      if (!(err instanceof DOMException && err.name === "AbortError")) await copyLink();
    }
  }

  if (!shareWith) return null;
  return (
    <>
      {shareWith === "sheet" ? (
        <button type="button" onClick={share} className={linkClassName}>
          Share
        </button>
      ) : (
        <>
          <a
            href={whatsAppUrl(text, url())}
            onClick={() => trackEvent("share")}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClassName}
          >
            WhatsApp
          </a>
          <button type="button" onClick={copyLink} className={linkClassName}>
            Copy link
          </button>
        </>
      )}
      {!onNotice && ownNotice && (
        <span role="status" className="text-brand text-sm">
          {ownNotice}
        </span>
      )}
    </>
  );
}
