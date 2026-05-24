type P = { size?: number }
const base = (size = 17) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
})

export const IconGrid = ({ size }: P) => (
  <svg {...base(size)}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
)
export const IconTrophy = ({ size }: P) => (
  <svg {...base(size)}><path d="M6 9a6 6 0 0 0 12 0V4H6z" /><path d="M6 5H3v2a3 3 0 0 0 3 3" /><path d="M18 5h3v2a3 3 0 0 1-3 3" /><path d="M9 21h6M12 15v6" /></svg>
)
export const IconChart = ({ size }: P) => (
  <svg {...base(size)}><path d="M4 20V10M10 20V4M16 20v-8M22 20H2" /></svg>
)
export const IconUsers = ({ size }: P) => (
  <svg {...base(size)}><circle cx="9" cy="7" r="3" /><path d="M3 21v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1" /><path d="M16 3.5a3 3 0 0 1 0 7M21 21v-1a5 5 0 0 0-4-4.9" /></svg>
)
export const IconPlus = ({ size }: P) => (
  <svg {...base(size)}><path d="M12 5v14M5 12h14" /></svg>
)
export const IconMoon = ({ size }: P) => (
  <svg {...base(size)}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
)
export const IconSun = ({ size }: P) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
)
export const IconUp = ({ size }: P) => (
  <svg {...base(size)}><path d="M18 15l-6-6-6 6" /></svg>
)
export const IconDown = ({ size }: P) => (
  <svg {...base(size)}><path d="M6 9l6 6 6-6" /></svg>
)
export const IconTrash = ({ size }: P) => (
  <svg {...base(size)}><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
)
export const IconShuffle = ({ size }: P) => (
  <svg {...base(size)}><path d="M16 3h5v5M4 20l17-17M21 16v5h-5M15 15l6 6M4 4l5 5" /></svg>
)
export const IconBack = ({ size }: P) => (
  <svg {...base(size)}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
)
export const IconShare = ({ size }: P) => (
  <svg {...base(size)}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></svg>
)
export const IconExpand = ({ size }: P) => (
  <svg {...base(size)}><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
)
export const IconShield = ({ size }: P) => (
  <svg {...base(size)}><path d="M12 2l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V5l8-3z" /></svg>
)
export const IconEye = ({ size }: P) => (
  <svg {...base(size)}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
)
export const IconClock = ({ size }: P) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
)
export const IconCheck = ({ size }: P) => (
  <svg {...base(size)}><path d="M20 6L9 17l-5-5" /></svg>
)
export const IconCrown = ({ size }: P) => (
  <svg {...base(size)}><path d="M3 6l4 5 5-7 5 7 4-5-1.5 13H4.5L3 6z" /></svg>
)
export const IconMedal = ({ size }: P) => (
  <svg {...base(size)}><circle cx="12" cy="14" r="6" /><path d="M9 8L6 2M15 8l3-6M9.5 14l2.5-2 2.5 2-1 3h-3l-1-3z" /></svg>
)
