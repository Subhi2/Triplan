"use client";

import {
  AdvancedMarker,
  AdvancedMarkerAnchorPoint,
  APIProvider,
  Map,
} from "@vis.gl/react-google-maps";
import { useMediaQuery } from "@/components/ui/useMediaQuery";
import { GOOGLE_MAP_ID, GOOGLE_MAPS_BROWSER_KEY } from "@/lib/google";
import { INDIA_BOUNDS, type MapViewProps } from "../types";
import { GooglePlaceMarkers } from "./GooglePlaceMarkers";
import { GoogleRoutes } from "./GoogleRoutes";
import { useGoogleFraming } from "./useGoogleFraming";

const [[west, south], [east, north]] = INDIA_BOUNDS;

/**
 * The Google map, used when the Google key is set (docs/02, "Google Maps Platform"): Google
 * photos and reviews may only be shown with a Google map. Same props as the MapLibre MapView.
 * Mounted once per page; each new map is a billed map load.
 */
export function GoogleMapView(props: MapViewProps) {
  const coarsePointer = useMediaQuery("(pointer: coarse)");
  const bottomInset = props.bottomInset ?? 0;

  return (
    <APIProvider apiKey={GOOGLE_MAPS_BROWSER_KEY} language="en" region="IN">
      {/* The map ends where the sheet begins, so Google's logo and terms stay in view (they
          must not be covered). */}
      <div className="w-full" style={{ height: `calc(100% - ${bottomInset}px)` }}>
        <Map
          mapId={GOOGLE_MAP_ID}
          defaultBounds={{ west, south, east, north, padding: 16 }}
          colorScheme="FOLLOW_SYSTEM"
          // One finger pans, as on the MapLibre map (no "use two fingers" overlay).
          gestureHandling="greedy"
          // Touch screens pinch to zoom; the buttons would only cover the map.
          disableDefaultUI
          zoomControl={!coarsePointer}
          clickableIcons={false}
          className="h-full w-full"
          onIdle={(e) => {
            const c = e.map.getCenter();
            const zoom = e.map.getZoom();
            if (c && zoom !== undefined) props.onViewChange?.([c.lng(), c.lat()], zoom);
          }}
        >
          <MapContents {...props} />
        </Map>
      </div>
    </APIProvider>
  );
}

function MapContents(props: MapViewProps) {
  useGoogleFraming(props);
  const highlightIds = [props.activePlaceId, props.hoverPlaceId].filter((x): x is string => !!x);

  return (
    <>
      <GoogleRoutes
        routes={props.routes}
        selectedId={props.selectedRouteId}
        onSelect={props.onSelectRoute}
      />
      <GooglePlaceMarkers
        places={props.places}
        highlightIds={highlightIds}
        onSelect={props.onSelectPlace}
        onHover={props.onHoverPlace}
      />
      {props.stops.map((s, i) => (
        <AdvancedMarker
          key={s.id}
          position={{ lng: s.location[0], lat: s.location[1] }}
          anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
          title={s.label}
          zIndex={2000}
        >
          <div
            className={`flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white px-1 text-xs font-bold text-white shadow ${
              s.role === "via" ? "bg-slate-600" : "bg-brand"
            }`}
          >
            {s.role === "start" ? "A" : s.role === "end" ? "B" : i}
          </div>
        </AdvancedMarker>
      ))}
    </>
  );
}
