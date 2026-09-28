import { round5, type LngLat } from "./geo";
import {
  CORRIDOR_KM,
  DEFAULT_CORRIDOR_KM,
  MAX_VIA_STOPS,
  VEHICLES,
  type CorridorKm,
  type Vehicle,
} from "./trip";

// Trips live in the query string so they can be shared:
//   ?from=Bengaluru@77.5946,12.9716&via=Sakleshpur@75.785,12.943&to=Kalasa@75.356,13.234&v=bike&c=5

export interface UrlStop {
  label: string;
  location: LngLat;
}

export interface TripUrlState {
  from: UrlStop | null;
  via: UrlStop[];
  to: UrlStop | null;
  vehicle: Vehicle;
  corridorKm: CorridorKm;
}

export function encodeStop({ label, location: [lng, lat] }: UrlStop): string {
  return `${label}@${round5(lng)},${round5(lat)}`;
}

export function decodeStop(value: string): UrlStop | null {
  const at = value.lastIndexOf("@");
  if (at <= 0) return null;
  const label = value.slice(0, at).trim().slice(0, 200);
  const parts = value.slice(at + 1).split(",");
  if (!label || parts.length !== 2) return null;
  const [lng, lat] = parts.map(Number) as [number, number];
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) {
    return null;
  }
  return { label, location: [lng, lat] };
}

export function parseTripUrl(params: URLSearchParams): TripUrlState {
  const decode = (v: string | null) => (v ? decodeStop(v) : null);
  const vehicle = params.get("v");
  const corridor = Number(params.get("c"));
  return {
    from: decode(params.get("from")),
    via: params
      .getAll("via")
      .map(decodeStop)
      .filter((s): s is UrlStop => s !== null)
      .slice(0, MAX_VIA_STOPS),
    to: decode(params.get("to")),
    vehicle: VEHICLES.includes(vehicle as Vehicle) ? (vehicle as Vehicle) : "bike",
    corridorKm: CORRIDOR_KM.includes(corridor as CorridorKm)
      ? (corridor as CorridorKm)
      : DEFAULT_CORRIDOR_KM,
  };
}

export function serializeTripUrl(state: TripUrlState): string {
  const params = new URLSearchParams();
  if (state.from) params.set("from", encodeStop(state.from));
  for (const v of state.via) params.append("via", encodeStop(v));
  if (state.to) params.set("to", encodeStop(state.to));
  params.set("v", state.vehicle);
  params.set("c", String(state.corridorKm));
  return params.toString();
}
