import { communityEnabled } from "@/lib/community/enabled";

/**
 * The site's screens, in one order everywhere: the content pages' bar, the planner's and Near
 * me's menu. `primary` links stay in view on phones; the rest go behind "Menu".
 */
const LINKS = [
  { href: "/", label: "Plan a ride", primary: true },
  { href: "/nearby", label: "Near me", primary: true },
  { href: "/rides", label: "Famous rides" },
  { href: "/bucket-list", label: "Bucket list", community: true },
  { href: "/trips", label: "Your trips" },
  { href: "/group-rides", label: "Group rides", community: true },
  { href: "/clubs", label: "Clubs", community: true },
  { href: "/me", label: "Me", community: true },
  { href: "/about", label: "About" },
] as const;

export type SiteSection = (typeof LINKS)[number]["href"];

export interface SiteLink {
  href: SiteSection;
  label: string;
  primary?: boolean;
}

/** The site's links, without clubs, group rides and Me when community is off. */
export const SITE_LINKS: readonly SiteLink[] = LINKS.filter(
  (l) => communityEnabled || !("community" in l),
);
