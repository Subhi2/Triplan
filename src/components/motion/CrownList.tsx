"use client";

import { useRef } from "react";
import type { CrownConfig } from "@/lib/crown";
import { useCrown } from "./useCrown";

interface Props {
  /** The items that follow the pointer (they carry the `crown` class). */
  selector: string;
  config: CrownConfig;
  className?: string;
  "aria-label"?: string;
  children: React.ReactNode;
}

/** A list whose items lean towards the mouse, for pages rendered on the server (useCrown). */
export function CrownList({ selector, config, className, children, ...rest }: Props) {
  const list = useRef<HTMLUListElement>(null);
  useCrown(list, selector, config);
  return (
    <ul ref={list} className={className} aria-label={rest["aria-label"]}>
      {children}
    </ul>
  );
}
