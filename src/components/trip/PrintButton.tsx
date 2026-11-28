"use client";

/** Opens the browser's print dialog, where the road book can be printed or saved as a PDF. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="bg-brand hover:bg-brand-dark inline-flex min-h-11 items-center rounded-xl px-4 font-bold text-white md:min-h-10"
    >
      Print or save as PDF
    </button>
  );
}
