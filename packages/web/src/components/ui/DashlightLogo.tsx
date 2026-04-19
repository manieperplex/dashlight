interface DashlightLogoProps {
  size?: number
}

export function DashlightLogo({ size = 20 }: DashlightLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      aria-label="Dashlight"
    >
      {/* Background pill */}
      <circle cx="50" cy="50" r="50" fill="var(--color-accent)" />

      {/* Mantle / head */}
      <ellipse cx="50" cy="37" rx="30" ry="27" fill="white" />

      {/* Eyes */}
      <circle cx="41" cy="31" r="5.5" fill="var(--color-accent)" opacity="0.75" />
      <circle cx="59" cy="31" r="5.5" fill="var(--color-accent)" opacity="0.75" />

      {/* 8 tentacles — symmetric, curves outward toward tips */}
      <g stroke="white" strokeLinecap="round" strokeWidth="5" fill="none">
        <path d="M28,55 C20,67 18,79 22,91" />
        <path d="M36,61 C30,72 28,82 32,91" />
        <path d="M42,63 C38,74 37,83 40,91" />
        <path d="M47,64 C44,75 43,84 46,91" />
        <path d="M53,64 C56,75 57,84 54,91" />
        <path d="M58,63 C62,74 63,83 60,91" />
        <path d="M64,61 C70,72 72,82 68,91" />
        <path d="M72,55 C80,67 82,79 78,91" />
      </g>
    </svg>
  )
}
