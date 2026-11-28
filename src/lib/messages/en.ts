// The app's own words in English: the source for every other language (src/lib/i18n.ts).
export const en = {
  "trip.start": "Start",
  "trip.destination": "Destination",
  "trip.stop": "Stop {n}",
  "trip.startPlaceholder": "Where are you starting from?",
  "trip.destinationPlaceholder": "Where are you going?",
  "trip.stopPlaceholder": "A town or place to ride through",
  "trip.addStop": "Add a stop",
  "trip.addStopMax": "Add a stop (max {n})",
  "trip.rideBack": "Ride back",
  "trip.loop": "Make it a loop",
  "trip.useLocation": "Use my location",
  "trip.placesWithin": "Places within",
  "trip.bike": "Bike",
  "trip.car": "Car",
  "steps.route": "Route",
  "steps.stops": "Stops",
  "steps.check": "Check",
  "steps.ride": "Ride",
  "steps.step": "Step {n}:",
  "menu.language": "Language",
  "menu.draft": "AI draft, not yet checked",
  "menu.lightMode": "Light mode",
  "menu.darkMode": "Dark mode",
} as const;

export type Messages = { [K in keyof typeof en]: string };
