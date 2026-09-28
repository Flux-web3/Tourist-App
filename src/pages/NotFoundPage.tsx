import { EmptyState } from '@/components/ui/EmptyState'
import { ButtonLink } from '@/components/ui/ButtonLink'

export default function NotFoundPage() {
  return (
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
  )
}
