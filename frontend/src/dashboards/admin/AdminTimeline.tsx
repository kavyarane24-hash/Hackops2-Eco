import { Panel } from '@/components/common/Panel';
import { RecordedTimeline } from '@/components/timeline/Timeline';

/** Admin › Timeline: every recorded day of incident and environmental activity. */
export default function AdminTimeline() {
  return (
    <Panel title="Recorded-day timeline" description="Built from stored records only. Days with no activity are not shown.">
      <RecordedTimeline />
    </Panel>
  );
}
