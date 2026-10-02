import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProgressBar } from '@/components/ui/StatTile'

describe('ProgressBar', () => {
  it('reports the value within its range', () => {
    render(<ProgressBar value={450.4} max={2500} label="Budget used" />)

    const bar = screen.getByRole('progressbar', { name: 'Budget used' })
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '2500')
    expect(bar).toHaveAttribute('aria-valuenow', '450')
  })

  it('never reports a value beyond its own maximum when over budget', () => {
    render(<ProgressBar value={3200} max={2500} label="Budget used" />)

    const bar = screen.getByRole('progressbar', { name: 'Budget used' })
    // `aria-valuenow` above `aria-valuemax` is invalid, and is read as nonsense or dropped.
    expect(bar).toHaveAttribute('aria-valuemax', '2500')
    expect(bar).toHaveAttribute('aria-valuenow', '2500')
    // The bar is still full and still drawn as over budget.
    const fill = bar.firstElementChild as HTMLElement
    expect(fill).toHaveStyle({ width: '100%' })
    expect(fill).toHaveClass('bg-danger')
  })

  it('never reports a value below zero', () => {
    render(<ProgressBar value={-40} max={2500} label="Budget used" />)

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })

  it('stays in range when there is no budget to measure against', () => {
    render(<ProgressBar value={80} max={0} label="Budget used" />)

    const bar = screen.getByRole('progressbar')
    expect(Number(bar.getAttribute('aria-valuenow'))).toBeLessThanOrEqual(Number(bar.getAttribute('aria-valuemax')))
  })
})
