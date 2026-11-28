import { describe, expect, it } from "vitest";
import { parseFilms } from "@/server/providers/wikimedia/commons";

const b = (place: string, film: string, title: string, date?: string) => ({
  place: { value: `http://www.wikidata.org/entity/${place}` },
  film: { value: `http://www.wikidata.org/entity/${film}` },
  title: { value: title },
  ...(date ? { date: { value: date } } : {}),
});

describe("Seen in films (G12)", () => {
  it("groups films by place, once each with its earliest year, oldest first", () => {
    const films = parseFilms({
      results: {
        bindings: [
          b("Q1", "Q20", "Later Film", "2015-05-01T00:00:00Z"),
          b("Q1", "Q10", "Old Film", "1975-08-15T00:00:00Z"),
          b("Q1", "Q10", "Old Film", "1976-01-01T00:00:00Z"),
          b("Q2", "Q30", "Undated"),
          b("Q2", "Q31", "Q31"), // no English title: left out
        ],
      },
    });
    expect(films.get("Q1")).toEqual([
      { qid: "Q10", title: "Old Film", year: 1975 },
      { qid: "Q20", title: "Later Film", year: 2015 },
    ]);
    expect(films.get("Q2")).toEqual([{ qid: "Q30", title: "Undated", year: null }]);
  });
});
