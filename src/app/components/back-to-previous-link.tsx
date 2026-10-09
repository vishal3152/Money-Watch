"use client";

import { useRouter } from "next/navigation";

export function BackToPreviousLink({ label }: { label: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      className="pw-back-link"
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
        } else {
          router.push("/");
        }
      }}
    >
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
    </button>
  );
}
