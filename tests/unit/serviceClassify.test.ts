import { describe, expect, it } from "vitest";
import { buildServicesQuery } from "@/server/providers/osm/overpass";
import {
  classifyService,
  isResidentHostel,
  RESIDENT_HOSTEL_SQL,
} from "@/server/services/serviceClassify";

const el = (tags: Record<string, string>, extentM = 0) => ({
  id: "node/1",
  location: [75.78, 12.94] as [number, number],
  extentM,
  tags,
});

describe("classifyService", () => {
  it("knows hospitals, police, ATMs, tyre and repair shops and stays", () => {
    expect(classifyService(el({ amenity: "hospital", name: "CGH" }))?.kind).toBe("hospital");
    expect(classifyService(el({ healthcare: "hospital" }))?.kind).toBe("hospital");
    expect(classifyService(el({ amenity: "police" }))?.kind).toBe("police");
    expect(classifyService(el({ amenity: "atm", brand: "SBI" }))).toMatchObject({
      kind: "atm",
      name: "SBI",
    });
    expect(classifyService(el({ amenity: "bank", atm: "yes" }))?.kind).toBe("atm");
    expect(classifyService(el({ shop: "tyres" }))?.kind).toBe("tyre");
    expect(
      classifyService(el({ shop: "motorcycle_repair", name: "Raju Puncture Shop" }))?.kind,
    ).toBe("tyre");
    expect(classifyService(el({ shop: "car_repair", name: "Sri Auto Works" }))?.kind).toBe(
      "repair",
    );
    expect(classifyService(el({ tourism: "guest_house" }))?.kind).toBe("stay");
  });

  it("keeps the first phone number for hospitals, police and stays only", () => {
    expect(
      classifyService(el({ amenity: "hospital", phone: "+91 8173 244 444; 108" }))?.phone,
    ).toBe("+91 8173 244 444");
    expect(classifyService(el({ amenity: "atm", phone: "123" }))?.phone).toBeNull();
  });

  it("leaves out other things, private or closed ones and huge areas", () => {
    expect(classifyService(el({ amenity: "fuel" }))).toBeNull();
    expect(classifyService(el({ amenity: "hospital", access: "private" }))).toBeNull();
    expect(classifyService(el({ amenity: "police", disused: "yes" }))).toBeNull();
    expect(classifyService(el({ tourism: "hotel" }, 5_000))).toBeNull();
  });

  it("leaves out student and working people's hostels mapped as tourist ones", () => {
    expect(isResidentHostel("Preuniversity girls hostel")).toBe(true);
    expect(isResidentHostel("Sri Sai Ladies PG")).toBe(true);
    expect(isResidentHostel("Govt. Pre-University College Boys Hostel")).toBe(true);
    expect(isResidentHostel("Zostel Gokarna")).toBe(false);
    expect(isResidentHostel("College Road Residency")).toBe(false);
    expect(classifyService(el({ tourism: "hostel", name: "BCM Boys Hostel" }))).toBeNull();
    expect(classifyService(el({ tourism: "hostel", name: "Backpacker Hostel" }))?.kind).toBe(
      "stay",
    );
    expect(RESIDENT_HOSTEL_SQL.hostel).toBe(String.raw`\y(hostel|hostels|pg|paying guest)\y`);
  });
});

describe("buildServicesQuery", () => {
  it("asks for every kind inside the state and tile", () => {
    const q = buildServicesQuery({ areaIso: "IN-GA", bbox: [73.66, 14.73, 74.36, 15.73] });
    expect(q).toContain('area["ISO3166-2"="IN-GA"]');
    for (const tag of [
      '"amenity"="hospital"',
      '"amenity"="police"',
      '"amenity"="atm"',
      '"shop"~',
      '"tourism"~',
    ]) {
      expect(q).toContain(tag);
    }
    expect(q).toContain("(14.73,73.66,15.73,74.36)");
  });
});
