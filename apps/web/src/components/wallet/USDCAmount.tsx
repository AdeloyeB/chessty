'use client'

import { cn } from '@/lib/utils'
import { USDCIcon } from '@/components/ui/USDCIcon'
import { formatUSDC } from '@/lib/utils'

interface USDCAmountProps {
  amount: string | number
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
  className?: string
}

const textSizeMap = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
}

export function USDCAmount({ amount, size = 'md', showIcon = true, className }: USDCAmountProps) {
  const formattedAmount = formatUSDC(typeof amount === 'string' ? parseFloat(amount) : amount)

  return (
    <span className={cn('inline-flex items-center gap-1 text-usdc font-medium', textSizeMap[size], className)}>
      {showIcon && <USDCIcon size={size} />}
      <span>{formattedAmount}</span>
    </span>
  )
}
