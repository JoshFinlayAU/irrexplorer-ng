// Small inline icon set. Icons are decorative (aria-hidden) unless a title is
// given; meaning is always carried by adjacent text or the title.
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { title?: string }

function Svg({ title, children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="1em"
      height="1em"
      fill="currentColor"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  )
}

export const DangerIcon = (p: IconProps) => (
  <Svg {...p}>
    <path
      fillRule="evenodd"
      d="M10 18a8 8 0 100-16 8 8 0 000 16zM7.7 6.3a1 1 0 00-1.4 1.4L8.6 10l-2.3 2.3a1 1 0 101.4 1.4l2.3-2.3 2.3 2.3a1 1 0 001.4-1.4L11.4 10l2.3-2.3a1 1 0 00-1.4-1.4L10 8.6 7.7 6.3z"
      clipRule="evenodd"
    />
  </Svg>
)
export const WarningIcon = (p: IconProps) => (
  <Svg {...p}>
    <path
      fillRule="evenodd"
      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1zm0 10a1.2 1.2 0 100-2.4 1.2 1.2 0 000 2.4z"
      clipRule="evenodd"
    />
  </Svg>
)
export const InfoIcon = (p: IconProps) => (
  <Svg {...p}>
    <path
      fillRule="evenodd"
      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM8.2 7.6a1.8 1.8 0 113.4.9c-.2.4-.6.7-1 1-.5.4-.9.8-.9 1.5a.7.7 0 001.4 0c0-.2.2-.4.6-.7.5-.4 1.3-1 1.3-2.4a3.1 3.1 0 10-6.1-.8.7.7 0 001.3.5zM10 15a1 1 0 100-2 1 1 0 000 2z"
      clipRule="evenodd"
    />
  </Svg>
)
export const SuccessIcon = (p: IconProps) => (
  <Svg {...p}>
    <path
      fillRule="evenodd"
      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z"
      clipRule="evenodd"
    />
  </Svg>
)
export const ValidIcon = (p: IconProps) => (
  <Svg {...p}>
    <path
      fillRule="evenodd"
      d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-1.6a6.4 6.4 0 110-12.8 6.4 6.4 0 010 12.8zm3.3-8.1a.8.8 0 00-1.1-1.1L9 10.4 7.8 9.2a.8.8 0 00-1.1 1.1l1.7 1.8a.8.8 0 001.2 0l3.7-3.8z"
      clipRule="evenodd"
    />
  </Svg>
)
export const InvalidIcon = (p: IconProps) => (
  <Svg {...p}>
    <path
      fillRule="evenodd"
      d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-1.6a6.4 6.4 0 110-12.8 6.4 6.4 0 010 12.8zM7.9 6.8a.8.8 0 00-1.1 1.1L8.9 10l-2.1 2.1a.8.8 0 101.1 1.1l2.1-2.1 2.1 2.1a.8.8 0 001.1-1.1L11.1 10l2.1-2.1a.8.8 0 00-1.1-1.1L10 8.9 7.9 6.8z"
      clipRule="evenodd"
    />
  </Svg>
)
export const UnknownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path
      fillRule="evenodd"
      d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-1.6a6.4 6.4 0 110-12.8 6.4 6.4 0 010 12.8zM9 13a1 1 0 112 0 1 1 0 01-2 0zm1-7.2a2.6 2.6 0 00-2.6 2.1.8.8 0 001.6.3 1 1 0 112 .3c0 .3-.2.5-.6.8-.5.3-1.1.8-1.1 1.7a.8.8 0 001.6 0c0-.1.1-.2.5-.5.5-.3 1.2-.9 1.2-2a2.6 2.6 0 00-2.6-2.7z"
      clipRule="evenodd"
    />
  </Svg>
)
export const CaretRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 5l6 5-6 5V5z" />
  </Svg>
)
export const SortIcon = ({ dir, ...p }: IconProps & { dir: false | 'asc' | 'desc' }) => (
  <Svg {...p}>
    {dir === 'asc' ? (
      <path d="M10 5l5 7H5l5-7z" />
    ) : dir === 'desc' ? (
      <path d="M10 15l-5-7h10l-5 7z" />
    ) : (
      <path d="M10 3l4 5H6l4-5zm0 14l-4-5h8l-4 5z" opacity=".45" />
    )}
  </Svg>
)
export const SunIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 14a4 4 0 100-8 4 4 0 000 8zM10 1a1 1 0 011 1v1a1 1 0 11-2 0V2a1 1 0 011-1zm0 15a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM1 10a1 1 0 011-1h1a1 1 0 110 2H2a1 1 0 01-1-1zm15 0a1 1 0 011-1h1a1 1 0 110 2h-1a1 1 0 01-1-1zM3.6 3.6a1 1 0 011.4 0l.7.7a1 1 0 01-1.4 1.4l-.7-.7a1 1 0 010-1.4zm10.7 10.7a1 1 0 011.4 0l.7.7a1 1 0 01-1.4 1.4l-.7-.7a1 1 0 010-1.4zM3.6 16.4a1 1 0 010-1.4l.7-.7a1 1 0 011.4 1.4l-.7.7a1 1 0 01-1.4 0zM14.3 5.7a1 1 0 010-1.4l.7-.7a1 1 0 111.4 1.4l-.7.7a1 1 0 01-1.4 0z" />
  </Svg>
)
export const MoonIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M17.3 13.4A8 8 0 016.6 2.7a8 8 0 1010.7 10.7z" />
  </Svg>
)
export const ExternalIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11 3a1 1 0 100 2h2.6l-6.3 6.3a1 1 0 101.4 1.4L15 6.4V9a1 1 0 102 0V4a1 1 0 00-1-1h-5zM5 5a2 2 0 00-2 2v8c0 1.1.9 2 2 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
  </Svg>
)
export const LoopIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 4a1 1 0 011 1v1.1A7 7 0 0116.9 8.3a1 1 0 01-1.9.7A5 5 0 006.3 8H8a1 1 0 010 2H4a1 1 0 01-1-1V5a1 1 0 011-1zm.1 6.8a1 1 0 011.3.6A5 5 0 0013.7 12H12a1 1 0 110-2h4a1 1 0 011 1v4a1 1 0 11-2 0v-1.1a7 7 0 01-11.6-2.4 1 1 0 01.6-1.3z" />
  </Svg>
)
