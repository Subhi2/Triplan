import { describe, expect, it } from "vitest";
import { suggestionDetail } from "@/components/trip/StopInput";

describe("suggestionDetail", () => {
  it("drops the name the label starts with, keeping where it is", () => {
    expect(suggestionDetail("Kalasa", "Kalasa, Kundagola taluku, Karnataka")).toBe(
      "Kundagola taluku, Karnataka",
    );
  });

  it("keeps a label that does not start with the name", () => {
    expect(suggestionDetail("Samse View", "Near Samse, Kalasa taluk")).toBe(
      "Near Samse, Kalasa taluk",
    );
    expect(suggestionDetail("Kalasa", "Kalasant, Jammu and Kashmir")).toBe(
      "Kalasant, Jammu and Kashmir",
    );
  });
});
