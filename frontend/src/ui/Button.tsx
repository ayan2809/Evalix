import { Link, type LinkProps } from 'react-router-dom'
import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react'
import { useCanEdit, useIsOwner } from '../auth'

type Variant = 'default' | 'primary' | 'quiet'

interface Common {
  variant?: Variant
  small?: boolean
  large?: boolean
  children?: ReactNode
  /** Owners and members only (guests see it off, with the reason on hover). */
  needsSignIn?: boolean
  /** The owner only: Settings, keys, Maxim. */
  ownerOnly?: boolean
  /** Disables the button and shows this text on hover (a tooltip). */
  disabledReason?: string
}

function cls(c: Common, extra?: string) {
  return ['btn', c.variant && c.variant !== 'default' ? c.variant : '', c.small ? 'small' : '', c.large ? 'large' : '', extra ?? '']
    .filter(Boolean)
    .join(' ')
}

/** A button. Uses `aria-disabled` (not `disabled`) when there is a reason, so the tooltip still shows. */
export function Button({
  variant,
  small,
  large,
  needsSignIn,
  ownerOnly,
  disabledReason,
  children,
  className,
  onClick,
  disabled,
  title,
  type = 'button',
  ...rest
}: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  const { canEdit, reason } = useCanEdit()
  const { isOwner, reason: ownerReason } = useIsOwner()
  const blockedBy =
    disabledReason ?? (needsSignIn && !canEdit ? reason : ownerOnly && !isOwner ? ownerReason : undefined)
  const handle = (e: MouseEvent<HTMLButtonElement>) => {
    if (blockedBy) {
      e.preventDefault()
      return
    }
    onClick?.(e)
  }
  return (
    <button
      {...rest}
      type={type}
      className={cls({ variant, small, large }, className)}
      onClick={handle}
      disabled={disabled}
      aria-disabled={blockedBy ? true : undefined}
      title={blockedBy ?? title}
    >
      {children}
    </button>
  )
}

/** A link that looks like a button. */
export function LinkButton({
  variant,
  small,
  large,
  children,
  className,
  ...rest
}: Common & LinkProps) {
  return (
    <Link {...rest} className={cls({ variant, small, large }, className)}>
      {children}
    </Link>
  )
}
