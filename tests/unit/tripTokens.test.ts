import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deviceTripIds, forgetTrip, ownTripIds, rememberTrip, tripToken } from "@/lib/tripTokens";

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

describe("trips on this device", () => {
  let storage: ReturnType<typeof fakeStorage>;
  beforeEach(() => {
    storage = fakeStorage();
    vi.stubGlobal("window", { localStorage: storage });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("keeps saved and opened trips newest first, with tokens only for saved ones", () => {
    rememberTrip("a", "token-a");
    rememberTrip("b");
    rememberTrip("c", "token-c");
    expect(deviceTripIds()).toEqual(["c", "b", "a"]);
    expect(tripToken("a")).toBe("token-a");
    expect(tripToken("b")).toBeNull();
    expect([...ownTripIds()].sort()).toEqual(["a", "c"]);
  });

  it("moves a reopened trip to the top without losing its token", () => {
    rememberTrip("a", "token-a");
    rememberTrip("b");
    rememberTrip("a");
    expect(deviceTripIds()).toEqual(["a", "b"]);
    expect(tripToken("a")).toBe("token-a");
  });

  it("keeps at most 50 trips and forgets on request", () => {
    for (let i = 0; i < 60; i++) rememberTrip(`t${i}`);
    expect(deviceTripIds()).toHaveLength(50);
    expect(deviceTripIds()[0]).toBe("t59");
    forgetTrip("t59");
    expect(deviceTripIds()[0]).toBe("t58");
  });

  it("ignores broken storage instead of throwing", () => {
    storage.data.set("triplan.trips.v1", "{not json");
    expect(deviceTripIds()).toEqual([]);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("SecurityError");
        },
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
    });
    expect(() => rememberTrip("a", "x")).not.toThrow();
    expect(tripToken("a")).toBeNull();
  });
});
