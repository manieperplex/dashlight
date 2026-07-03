import { useState, useRef, useLayoutEffect, useEffect } from "react"

interface TruncatingTitleProps {
  /** Optional label prepended as `prefix: items`. Omit to render items only. */
  prefix?: string
  items: string[]
  className?: string
  /**
   * Override the overflow predicate — intended for tests only.
   * Receives the span element after its textContent has been set to the
   * candidate string, so implementations can inspect textContent directly.
   * Default: el.scrollWidth > el.clientWidth
   */
  _isOverflowing?: (el: HTMLSpanElement) => boolean
}

const defaultIsOverflowing = (el: HTMLSpanElement) => el.scrollWidth > el.clientWidth

/**
 * Renders `prefix: item1, item2 …` on a single line. When the text would
 * overflow the container, trailing items are hidden and replaced with a
 * "+N more" suffix. Re-expands when the container grows (ResizeObserver).
 *
 * Uses a single-pass measurement strategy: mutates the span's single text
 * node via nodeValue (in-place, preserving React's stateNode reference) to
 * probe each candidate string, then commits the final visibleCount in one
 * setState call (no cascading re-renders). The span always renders a single
 * text expression so React reconciles exactly one text node — no placement
 * side-effects from empty-string → non-empty transitions.
 */
export function TruncatingTitle({
  prefix = "",
  items,
  className,
  _isOverflowing = defaultIsOverflowing,
}: TruncatingTitleProps) {
  const [visibleCount, setVisibleCount] = useState(items.length)
  // Incrementing this triggers a re-evaluation after a container resize
  const [sizeTrigger, setSizeTrigger] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    // Mutate the existing text node in-place so React's stateNode reference
    // stays valid. Using el.textContent = X would replace the DOM child,
    // detaching the node React tracks and causing reconciliation artefacts.
    const textNode = el.childNodes[0] as Text | undefined
    if (!textNode) return
    const probe = (s: string) => { textNode.nodeValue = s }

    // Check if all items fit — also handles re-expansion after resize.
    // Greedy search: reduce count until truncated text fits (min 1).
    // useLayoutEffect + setState is intentional: fires before paint so the
    // browser never renders the intermediate probe strings.
    const fmt = (text: string) => prefix ? `${prefix}: ${text}` : text

    let count = items.length
    probe(fmt(items.join(", ")))
    if (_isOverflowing(el)) {
      while (count > 1) {
        count--
        const hidden = items.length - count
        probe(fmt(`${items.slice(0, count).join(", ")} +${hidden} more`))
        if (!_isOverflowing(el)) break
      }
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- useLayoutEffect+setState is the recommended React pattern for pre-paint DOM measurement
    setVisibleCount(count)
  }, [prefix, items, _isOverflowing, sizeTrigger])

  // Re-evaluate on container resize so newly gained space is used
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => setSizeTrigger((t) => t + 1))
    ro.observe(el.parentElement ?? el)
    return () => ro.disconnect()
  }, [])

  const hidden = items.length - visibleCount
  const displayed = items.slice(0, visibleCount).join(", ")
  const suffix = hidden > 0 ? ` +${hidden} more` : ""

  return (
    <span
      ref={ref}
      className={className}
      style={{ whiteSpace: "nowrap", overflow: "hidden", display: "block", minWidth: 0, flex: 1 }}
    >
      {prefix ? `${prefix}: ${displayed}${suffix}` : `${displayed}${suffix}`}
    </span>
  )
}
