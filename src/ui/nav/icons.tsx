import type { ReactNode } from "react";

function Icon({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: "flex",
        height: "1rem",
        width: "1rem",
        flexShrink: 0,
        alignItems: "center",
        justifyContent: "center",
      }}
      aria-hidden
    >
      {children}
    </span>
  );
}

const svgProps = {
  viewBox: "0 0 16 16",
  style: {
    height: "0.875rem",
    width: "0.875rem",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
  } as const,
};

/** Default stroke icons for standard nav items (product can override). */
export const shellNavIcons = {
  product: (
    <Icon>
      <svg {...svgProps}>
        <path d="M2 3h5v5H2zM9 3h5v3H9zM9 8h5v5H9zM2 10h5v3H2z" />
      </svg>
    </Icon>
  ),
  entities: (
    <Icon>
      <svg {...svgProps}>
        <path d="M3 2.5h10v11H3zM5 5h6M5 8h6M5 11h4" />
      </svg>
    </Icon>
  ),
  connections: (
    <Icon>
      <svg {...svgProps}>
        <path d="M6 3.5h4v3H6zM2.5 9.5h4v3h-4zM9.5 9.5h4v3h-4zM8 6.5v3M4.5 9.5V8H8M11.5 9.5V8H8" />
      </svg>
    </Icon>
  ),
  rules: (
    <Icon>
      <svg {...svgProps}>
        <path d="M4 2.5h6l2 2V13.5H4zM10 2.5V5h2.5" />
      </svg>
    </Icon>
  ),
  workspace: (
    <Icon>
      <svg {...svgProps}>
        <path d="M2 6.5h12v7H2zM5 6.5V4.5h6v2" />
      </svg>
    </Icon>
  ),
  members: (
    <Icon>
      <svg {...svgProps}>
        <circle cx="6" cy="5" r="2" />
        <circle cx="11" cy="6" r="1.5" />
        <path d="M2 13c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5M10 9.5c1.5.3 3 1.4 3 3.5" />
      </svg>
    </Icon>
  ),
  key: (
    <Icon>
      <svg {...svgProps}>
        <circle cx="5.5" cy="8" r="2.5" />
        <path d="M8 8h5.5v2M11 8v2" />
      </svg>
    </Icon>
  ),
  domains: (
    <Icon>
      <svg {...svgProps}>
        <circle cx="8" cy="8" r="5.5" />
        <path d="M2.5 8h11M8 2.5c1.5 2 1.5 9 0 11M8 2.5c-1.5 2-1.5 9 0 11" />
      </svg>
    </Icon>
  ),
  billing: (
    <Icon>
      <svg {...svgProps}>
        <rect x="2.5" y="4" width="11" height="8" rx="1" />
        <path d="M2.5 7h11" />
      </svg>
    </Icon>
  ),
  account: (
    <Icon>
      <svg {...svgProps}>
        <circle cx="8" cy="5" r="2.5" />
        <path d="M3 13.5c0-2.5 2.2-4 5-4s5 1.5 5 4" />
      </svg>
    </Icon>
  ),
  security: (
    <Icon>
      <svg {...svgProps}>
        <path d="M8 2.5 13 5v3.5c0 3-2.2 4.8-5 5.5-2.8-.7-5-2.5-5-5.5V5z" />
      </svg>
    </Icon>
  ),
  jobs: (
    <Icon>
      <svg {...svgProps}>
        <path d="M3 4.5h10v8H3zM5.5 4.5V3h5v1.5" />
      </svg>
    </Icon>
  ),
};
