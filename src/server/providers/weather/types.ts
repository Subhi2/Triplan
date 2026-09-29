import type { LngLat } from "@/lib/geo";
import type { ForecastStep } from "@/lib/weather";

export interface WeatherProvider {
  /** The forecast near a point, from now to about 9 days ahead. */
  forecast(point: LngLat): Promise<ForecastStep[]>;
}
