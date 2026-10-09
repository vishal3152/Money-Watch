type BrandMarkProps = {
  className?: string;
};

/** Check register mark — cover, ruled lines, accent check (Wealth Blue). */
export function BrandMark({ className = "pw-brand-mark" }: BrandMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 40 40"
      width="40"
      height="40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="8" y="6" width="24" height="28" rx="3.5" fill="#17191c" />
      <rect x="10" y="6" width="2.5" height="28" rx="1" fill="#0d0f12" />
      <rect x="12" y="9" width="17" height="22" rx="2" fill="#ffffff" />
      <path
        stroke="rgba(20, 28, 46, 0.14)"
        strokeLinecap="round"
        strokeWidth="1.25"
        d="M15 15h12M15 19.5h12M15 24h6"
      />
      <path
        d="M20.5 25.5 22.5 27.5 28 21.5"
        stroke="#387ed1"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.25"
      />
    </svg>
  );
}
