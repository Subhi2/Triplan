"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

interface Props {
  /** Called on Escape, and when the browser closes the dialog itself. */
  onClose: () => void;
  /** The dialog's name: aria-label, or the id of its heading. */
  label?: string;
  labelledBy?: string;
  /** The dialog box itself: it fills the screen; children lay out the panel inside. A display
   *  class goes behind `open:` (open:flex), or it would also show the dialog while closed. */
  className?: string;
  children: React.ReactNode;
}

/**
 * A modal on the native <dialog>, opened with showModal() while it is mounted. The browser puts it
 * in the top layer, so it covers the whole screen wherever it sits in the page: a fixed div inside
 * the phone sheet was boxed into the sheet (its slide-in transform makes it the containing block)
 * and drawn under the floating header. The page behind is inert (Tab stays in the dialog), does
 * not scroll (globals.css), and gets focus back on close.
 *
 * Render it only while open; the parent's state says whether it shows.
 */
export function Modal({ onClose, label, labelledBy, className = "", children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  // A close() of our own (unmounting, or React's development double run of the effect) also
  // fires "close" a moment later; only a close the browser made is passed on.
  const closingOurselves = useRef(false);

  // Before the first paint, so it never shows in the page as a closed box first.
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      closingOurselves.current = true;
      dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      aria-labelledby={labelledBy}
      // Escape: the parent closes it, so its state stays the one truth.
      onCancel={(e) => {
        e.preventDefault();
        onCloseRef.current();
      }}
      onClose={() => {
        if (closingOurselves.current) closingOurselves.current = false;
        else onCloseRef.current();
      }}
      // The browser's dialog style centres a bordered box with a size limit; this one fills the
      // screen and leaves the look to its children.
      className={`fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none border-0 bg-transparent p-0 text-(--foreground) backdrop:bg-transparent ${className}`}
    >
      {children}
    </dialog>
  );
}
