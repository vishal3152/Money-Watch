import Link from "next/link";

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    // prefetch={false}: this component renders on nearly every page, and its most common target
    // is the dashboard — Next.js prefetches an in-viewport <Link> by default, so every page had
    // been re-running the dashboard's full query set in the background on render
    // (docs/qa/cloud-db-operations-audit.md). A back link is deliberate, explicit navigation, so
    // the prefetch is not worth that cost.
    <Link className="pw-back-link" href={href} prefetch={false}>
      <svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
        <path
          d="M9.5 3.5 5 8l4.5 4.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {label}
    </Link>
  );
}
