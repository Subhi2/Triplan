/**
 * Phones: the page's one primary action pinned to the bottom, over a frosted bar (docs/08,
 * "Phones first"). From 768 px the action stays where the page puts it. Pages that use it leave
 * room at their foot (`PHONE_ACTION_BAR_SPACE`) so the bar never covers the last lines.
 */
export function PhoneActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200/80 bg-(--surface)/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md md:hidden dark:border-stone-700/80">
      {children}
    </div>
  );
}

/** Bottom padding for a page with a PhoneActionBar: the bar's height and the safe area. */
export const PHONE_ACTION_BAR_SPACE = "pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-6";

/** The primary button inside the bar: full width, 48 px. */
export const PHONE_PRIMARY =
  "bg-brand active:bg-brand-dark flex min-h-12 w-full items-center justify-center rounded-xl px-5 font-bold text-white active:scale-[0.98]";
