import { EmptyState } from '@/components/ui/EmptyState'
import { ButtonLink } from '@/components/ui/ButtonLink'

export default function NotFoundPage() {
  return (
    // A night band, like the landing hero with no photograph: the same
    // components inside, re-pointed at their on-photograph values.
    <div className="on-photo photo-hero rounded-sheet p-3 sm:p-8">
      <EmptyState
        icon="explore_off"
        headingLevel={1}
        title="That page is not part of this trip"
        description="The link may be out of date. Your trips and itinerary are still where you left them."
        action={
          <ButtonLink to="/trips" variant="primary">
            Back to trips
          </ButtonLink>
        }
      />
    </div>
  )
}
