// Fills each famous ride's photo gallery (up to 8 photos along its road) from Wikimedia Commons.
//   pnpm db:import-ride-photos                       (rides that have no gallery yet)
//   pnpm db:import-ride-photos -- --only=manali-to-leh,shimla-to-kaza
//   pnpm db:import-ride-photos -- --force            (rebuild every gallery)
// About 25 requests a ride, a little over a second apart. Re-running is safe: finished rides are
// skipped unless --force is given.
import { parseArgs } from "node:util";
import { closeDb } from "../src/server/db";
import { getWikimediaProvider } from "../src/server/providers/wikimedia";
import { importRidePhotos } from "../src/server/services/ridePhotoImportService";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: { only: { type: "string" }, force: { type: "boolean", default: false } },
});

const time = () => new Date().toTimeString().slice(0, 8);

async function main() {
  const { rides, photos, empty } = await importRidePhotos(getWikimediaProvider(), {
    only: values.only?.split(","),
    force: values.force,
    log: (line) => console.log(`${time()} ${line}`),
  });
  console.log(
    `${time()} Done: ${photos} photos for ${rides} rides.` +
      (empty.length ? ` No photo found for: ${empty.join(", ")}` : ""),
  );
}

main()
  .catch((err: unknown) => {
    console.error("Ride photo import failed:", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
