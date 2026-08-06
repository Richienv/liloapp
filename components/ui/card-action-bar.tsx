import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The footer that ends a card: some context on the left, the button pair on
 * the right.
 *
 * This exists as a component rather than a pattern you retype because two
 * things about it are easy to get wrong and expensive when you do:
 *
 * 1. **The pair must never wrap onto separate lines.** A primary and a
 *    secondary stacked vertically read as two unrelated actions, and on a
 *    booking screen that is the difference between "confirm" and "cancel"
 *    looking like equals. The button group is `flex-nowrap` and `shrink-0`;
 *    when space runs out it is the *context* on the left that wraps above,
 *    never the buttons apart from each other.
 *
 * 2. **The widths are fixed, so the pair cannot mismatch.** Call sites pass
 *    labels, not variants — there is no way to accidentally render two
 *    primaries, or a primary at the secondary's width.
 *
 * The secondary is optional. A bar with one button is a normal thing; a bar
 * with two primaries is not, which is why there is no prop for it.
 */
export interface CardActionBarProps {
  /** Context shown at the start of the bar — a total, a count, a warning. */
  children?: React.ReactNode;
  primaryLabel: React.ReactNode;
  onPrimary?: React.MouseEventHandler<HTMLButtonElement>;
  primaryType?: "button" | "submit";
  primaryDisabled?: boolean;
  secondaryLabel?: React.ReactNode;
  onSecondary?: React.MouseEventHandler<HTMLButtonElement>;
  secondaryDisabled?: boolean;
  className?: string;
}

export function CardActionBar({
  children,
  primaryLabel,
  onPrimary,
  primaryType = "button",
  primaryDisabled,
  secondaryLabel,
  onSecondary,
  secondaryDisabled,
  className,
}: CardActionBarProps) {
  return (
    <div
      className={cn(
        "mt-3.5 flex flex-wrap items-center gap-4 rounded-panel border border-hairline",
        "bg-surface-raised px-5 py-4",
        className,
      )}
    >
      {children ? (
        <div className="min-w-0 flex-1 text-copy text-ink-body">{children}</div>
      ) : null}

      {/*
        `ml-auto` rather than `justify-between` on the parent: with no context
        passed, the pair still needs to sit at the end, and an empty flex child
        would leave it floating in the middle.
        `flex-nowrap` + `shrink-0` is the guarantee in the doc comment above.
      */}
      <div className="ml-auto flex shrink-0 flex-nowrap gap-3">
        {secondaryLabel ? (
          <Button
            type="button"
            variant="quiet"
            size="action-secondary"
            onClick={onSecondary}
            disabled={secondaryDisabled}
          >
            {secondaryLabel}
          </Button>
        ) : null}
        <Button
          type={primaryType}
          variant="brand"
          size="action"
          onClick={onPrimary}
          disabled={primaryDisabled}
        >
          {primaryLabel}
        </Button>
      </div>
    </div>
  );
}
