export default function Logo({ size = 40, className = "" }) {
  return (
    <svg
      className={`logo ${className}`}
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M14 18 L40 78 L66 18"
        stroke="currentColor"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="logo-wave"
        d="M72 34a12 12 0 0 1 0 24"
        stroke="currentColor"
        strokeWidth="3.8"
        strokeLinecap="round"
      />
      <path
        className="logo-wave faint"
        d="M82 22a24 24 0 0 1 0 48"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
