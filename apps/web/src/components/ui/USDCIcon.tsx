'use client'

import { cn } from '@/lib/utils'

interface USDCIconProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeMap = {
  sm: 16,
  md: 20,
  lg: 24,
}

export function USDCIcon({ size = 'md', className }: USDCIconProps) {
  const dimension = sizeMap[size]

  return (
    <svg
      width={dimension}
      height={dimension}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('inline-block', className)}
    >
      <circle cx="12" cy="12" r="12" fill="#0052FF" />
      <path
        d="M12 4.5C7.86 4.5 4.5 7.86 4.5 12C4.5 16.14 7.86 19.5 12 19.5C16.14 19.5 19.5 16.14 19.5 12C19.5 7.86 16.14 4.5 12 4.5ZM12 18C8.685 18 6 15.315 6 12C6 8.685 8.685 6 12 6C15.315 6 18 8.685 18 12C18 15.315 15.315 18 12 18Z"
        fill="white"
        fillOpacity="0.2"
      />
      <text
        x="12"
        y="16"
        textAnchor="middle"
        fill="white"
        fontSize="10"
        fontWeight="bold"
        fontFamily="system-ui, sans-serif"
      >
        $
      </text>
    </svg>
  )
}
