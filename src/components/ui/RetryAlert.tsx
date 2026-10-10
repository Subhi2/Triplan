/** An error with a way out: what went wrong and a "Try again" button. */
export function RetryAlert({
  message,
  onRetry,
  quiet = false,
}: {
  message: string;
  onRetry: () => void;
  /** Secondary panels (profile, safety stops) use muted text, not red. */
  quiet?: boolean;
}) {
  return (
    <p
      role="alert"
      className={`flex flex-wrap items-center gap-x-2 text-sm ${
        quiet ? "text-stone-600 dark:text-stone-400" : "text-red-700 dark:text-red-400"
      }`}
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="text-brand-dark inline-flex min-h-11 items-center font-bold hover:underline md:min-h-0 dark:text-teal-300"
      >
        Try again
      </button>
    </p>
  );
}
