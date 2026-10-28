"use client";

import type { LineString } from "geojson";
import { useCallback, useState } from "react";
import { RouteProfile } from "@/components/route/RouteProfile";
import { PHONE_PRIMARY, PhoneActionBar } from "@/components/site/PhoneActionBar";
import type { ElevationProfile } from "@/lib/elevation";
import { DynamicRidePreview } from "./DynamicRidePreview";
import { PreviewButton } from "./PreviewButton";
import type { PreviewPlace } from "./RidePreview";
import { StoryShare } from "./StoryShare";

interface Props {
  plannerUrl: string;
  storyUrl: string;
  title: string;
  geometry: LineString;
  ghats: [number, number][];
  hairpinKm: number[];
  profile: ElevationProfile | null;
  places: PreviewPlace[];
}

/** A ride page's actions (planner, 3D preview, story) and its elevation profile. */
export function RideActions(props: Props) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [cursorKm, setCursorKm] = useState<number | null>(null);
  const closePreview = useCallback(() => setPreviewOpen(false), []);
  return (
    <>
      {/* Phones: "Plan this ride" is pinned to the bottom and the other two share a row. */}
      <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
        {/* A full page load: the planner reads its trip from the address once. */}
        <a
          href={props.plannerUrl}
          className="lift bg-brand hover:bg-brand-dark hidden min-h-11 items-center rounded-xl px-5 font-bold text-white md:inline-flex"
        >
          Plan this ride
        </a>
        <PreviewButton onClick={() => setPreviewOpen(true)} />
        <StoryShare
          storyUrl={props.storyUrl}
          title={props.title}
          link={typeof window === "undefined" ? "" : window.location.href}
        />
      </div>
      {props.profile && (
        <RouteProfile
          state={{ status: "ok", profile: props.profile }}
          ghats={props.ghats}
          cursorKm={cursorKm}
          onCursorChange={setCursorKm}
        />
      )}
      <PhoneActionBar>
        <a href={props.plannerUrl} className={PHONE_PRIMARY}>
          Plan this ride
        </a>
      </PhoneActionBar>
      {previewOpen && (
        <DynamicRidePreview
          title={props.title}
          geometry={props.geometry}
          ghats={props.ghats}
          hairpinKm={props.hairpinKm}
          profile={props.profile}
          places={props.places}
          onClose={closePreview}
        />
      )}
    </>
  );
}
