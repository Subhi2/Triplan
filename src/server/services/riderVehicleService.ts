import { sql } from "drizzle-orm";
import type { MyBike } from "@/lib/myBike";
import type { Vehicle } from "@/lib/trip";
import { getDb } from "../db";

// "My bike" on the rider's account (docs/02, "My bike"): one row per rider and vehicle. Private
// to the rider; removed with them (on delete cascade); never in the snapshot.

export type RiderBikes = Partial<Record<Vehicle, MyBike>>;

interface Row extends Record<string, unknown> {
  vehicle: Vehicle;
  range_km: number | null;
  km_per_litre: number | null;
  fuel_price: number | null;
  electric: boolean;
}

/** The rider's bike and car, as they last set them. */
export async function bikesOf(riderId: string): Promise<RiderBikes> {
  const rows = await getDb().execute<Row>(sql`
    SELECT vehicle::text AS vehicle, range_km, km_per_litre, fuel_price, electric
    FROM rider_vehicle WHERE rider_id = ${riderId}`);
  const out: RiderBikes = {};
  for (const r of rows) {
    out[r.vehicle] = {
      rangeKm: r.range_km,
      kmPerLitre: r.km_per_litre,
      fuelPrice: r.fuel_price,
      electric: r.electric,
    };
  }
  return out;
}

/** Sets the rider's bike (or car): the values given replace the last ones. */
export async function saveBike(riderId: string, vehicle: Vehicle, bike: MyBike): Promise<MyBike> {
  await getDb().execute(sql`
    INSERT INTO rider_vehicle (rider_id, vehicle, range_km, km_per_litre, fuel_price, electric,
                               updated_at)
    VALUES (${riderId}, ${vehicle}, ${bike.rangeKm}, ${bike.kmPerLitre}, ${bike.fuelPrice},
            ${bike.electric}, now())
    ON CONFLICT (rider_id, vehicle) DO UPDATE SET
      range_km = excluded.range_km, km_per_litre = excluded.km_per_litre,
      fuel_price = excluded.fuel_price, electric = excluded.electric, updated_at = now()`);
  return bike;
}
