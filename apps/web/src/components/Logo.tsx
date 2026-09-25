export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <rect width="512" height="512" rx="116" className="fill-accent" />
      <rect
        x="82"
        y="132"
        width="348"
        height="248"
        rx="62"
        fill="none"
        strokeWidth="34"
        className="stroke-on-accent"
      />
      <path d="M142 256h132" strokeWidth="34" className="stroke-on-accent" />
      <path
        d="M252 196l72 60-72 60z"
        strokeWidth="12"
        strokeLinejoin="round"
        className="fill-on-accent stroke-on-accent"
      />
      <rect x="342" y="188" width="32" height="136" rx="7" className="fill-on-accent" />
    </svg>
  );
}
