import { type InferSchemaType, Schema, model } from 'mongoose';
import { GroupModel } from './Group.js';
import { z } from '@/lib/custom-zod.js'
import zodSchema, { zId } from '@zodyac/zod-mongoose';
import { CAMPUS, SHIFTS } from './Component.js';

const COMMENT_TYPE = ['teoria', 'pratica'] as const;

const zEnrollment =  z.object({
  year: z.number().int(),
  quad: z.number().int(),
  identifier: z.string(),
  ra: z.number().nullish(),
  disciplina: z.string(),
  subject: zId().ref('subjects'),
  campus: z.enum(CAMPUS),
  turno: z.enum(SHIFTS),
  turma: z.string(),
  pratica: zId().ref('teachers').nullish(),
  teoria: zId().ref('teachers').nullish(),
  mainTeacher: zId().ref('teachers').nullish(),
  comments: z.enum(COMMENT_TYPE),
  conceito: z.string().nullable(),
  creditos: z.number().int(),
  ca_acumulado: z.number().nullish(),
  cr_acumulado: z.number().nullish(),
  cp_acumulado: z.number().nullish(),
  season: z.string(),
})

const enrollmentSchema = zodSchema(zEnrollment,
  { timestamps: true },
);

function setTheoryAndPractice(update: { $set: Partial<Enrollment> }) {
  const enrollment = update.$set;

  if ('teoria' in enrollment || 'pratica' in enrollment) {
    const theoryTeacher = enrollment.teoria?._id ?? enrollment.teoria;
    const practiceTeacher = enrollment.pratica?._id ?? enrollment.pratica;
    enrollment.mainTeacher = theoryTeacher || practiceTeacher;
  }
}

async function addEnrollmentToGroup(enrollment: EnrollmentDocument) {
  /*
   * If is a new enrollment, must create a new
   * group or insert doc.ra in group.users
   */

  if (enrollment.mainTeacher && enrollment.isNew) {
    await GroupModel.updateOne(
      {
        disciplina: enrollment.disciplina,
        season: enrollment.season,
        mainTeacher: enrollment.mainTeacher,
      },
      {
        $push: { users: enrollment.ra },
      },
    );
  }
}

enrollmentSchema.index({ identifier: 'asc', ra: 'asc' });
enrollmentSchema.index({ ra: 'asc' });
enrollmentSchema.index({ conceito: 'asc' });
enrollmentSchema.index({
  mainTeacher: 'asc',
  subject: 'asc',
  cr_acumulado: 'asc',
  conceito: 'asc',
});

enrollmentSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate();

  // @ts-ignore
  if (!update.$set) {
    // @ts-ignore
    update.$set = {};
  }

  // Your existing pre update logic
  // @ts-ignore
  setTheoryAndPractice(update);
  next();
});

// biome-ignore lint/complexity/useArrowFunction: Mongoose needs an anonymous func
enrollmentSchema.post('findOneAndUpdate', async function (doc) {
  if (doc) {
    await addEnrollmentToGroup(doc);
  }
});

export type Enrollment = z.infer<typeof zEnrollment>;
export type EnrollmentDocument = ReturnType<
  (typeof EnrollmentModel)['hydrate']
>;
export const EnrollmentModel = model('enrollments', enrollmentSchema);
