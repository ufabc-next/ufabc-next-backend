import type { MoodleComponent } from '@/connectors/moodle.ts';

import { componentArchiveSchema } from '@/schemas/v2/components.ts';

export async function getComponentArchives(
  components: MoodleComponent | undefined
) {
  const componentArchives = componentArchiveSchema.safeParse(
    components?.data.courses
  );

  if (!componentArchives.success) {
    return {
      error: componentArchives.error.message,
      data: null,
    };
  }

  return {
    error: null,
    data: componentArchives.data,
  };
}
