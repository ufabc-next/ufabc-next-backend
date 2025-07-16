import { currentQuad } from '@next/common';
import { ComponentModel } from '@/models/Component.js';
import type { QueueContext } from '../types.js';
import { getEnrolledStudents } from '@/modules/ufabc-parser.js';

export async function syncEnrolled({ app }: QueueContext<void>) {
  const tenant = currentQuad();
  const enrollments = await getEnrolledStudents();

  const enrollmentTasks = Object.entries(enrollments).map(
    ([componentId, students]) => ({
      componentId,
      students,
    }),
  );

  // Process enrollments in batches
  const enrolledPromises = enrollmentTasks.map((enrolled) => {
    app.job.dispatch('ProcessSingleEnrolled', {
      tenant,
      componentId: enrolled.componentId,
      students: enrolled.students,
    });
  });

  await Promise.all(enrolledPromises);

  // if the tasks are empty, send a request to a new job to create components
  if (enrollmentTasks.length === 0) {
    app.log.info({
      msg: 'No enrollments found, dispatching components sync',
    });
    app.job.dispatch('ComponentsSync', {
      tenant,
    });
  }

  app.log.info({
    msg: 'Enrolledsync tasks dispatched',
    totalEnrollments: enrollmentTasks.length,
  });

  return {
    msg: 'Enrolled sync initiated',
    totalEnrollments: enrollmentTasks.length,
  };
}

// Process a single enrollment update
export async function processSingleEnrolled({
  app,
  job,
}: QueueContext<{
  tenant: string;
  componentId: string;
  students: number[];
}>) {
  if (!job.data.tenant) {
    return;
  }
  const { tenant, componentId, students } = job.data;

  try {
    // Update single component's enrollments
    const result = await ComponentModel.findOneAndUpdate(
      {
        disciplina_id: Number(componentId),
        season: tenant,
      },
      {
        $set: {
          alunos_matriculados: students,
        },
      },
      {
        new: true,
      },
    );

    if (!result) {
      app.log.warn({
        msg: 'Component not found for enrolled update',
        componentId,
        tenant,
      });
    }

    app.log.debug({
      msg: 'Component enrolled updated',
      componentId,
      studentCount: students.length,
    });
  } catch (error) {
    app.log.error({
      data: job.data,
      msg: 'Error processing enrolled update',
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}
