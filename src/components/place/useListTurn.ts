"use client";

import { useState } from "react";
import { listTurn, type ListTurn, type ListView } from "@/lib/listTurn";

/**
 * Which way the place list turns after the rider switches route or changes a filter, and a key
 * that changes with every turn so the rows come in again (docs/08 "Motion"). A new trip
 * (`tripKey`) starts over: its list rises as usual.
 */
export function useListTurn(view: ListView, tripKey: string) {
  const [seen, setSeen] = useState({ view, tripKey });
  const [state, setState] = useState<{ turn: ListTurn | null; key: number }>({
    turn: null,
    key: 0,
  });

  // Adjusting state while rendering, as React recommends for "when a prop changes".
  if (tripKey !== seen.tripKey) {
    setSeen({ view, tripKey });
    setState((s) => ({ turn: null, key: s.key + 1 }));
  } else {
    const turn = listTurn(seen.view, view);
    if (turn) {
      setSeen({ view, tripKey });
      setState((s) => ({ turn, key: s.key + 1 }));
    }
  }
  return state;
}
