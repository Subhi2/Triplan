"use client";

import type { LineString } from "geojson";
import { useCallback, useState } from "react";
import { RouteProfile } from "@/components/route/RouteProfile";
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
      <div className="flex flex-wrap gap-2">
        {/* A full page load: the planner reads its trip from the address once. */}
        <a
          href={props.plannerUrl}
          className="lift bg-brand hover:bg-brand-dark inline-flex min-h-12 items-center rounded-xl px-5 font-bold text-white md:min-h-11"
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
