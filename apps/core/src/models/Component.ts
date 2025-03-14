import {
  type UpdateQuery,
  model,
} from 'mongoose';
import { findQuarter } from '@next/common';
import { z } from '@/lib/custom-zod.js'
import { zId, zodSchema } from '@zodyac/zod-mongoose';

export const CAMPUS = ['sao bernardo', 'santo andre', 'sbc', 'sa'] as const;
export const SHIFTS = ['diurno', 'noturno'] as const

const zComponent = z.object({
  disciplina_id: z.number().int(),
  disciplina: z.string(),
  turno: z.enum(SHIFTS),
  turma: z.string(),
  vagas: z.number().int(),
  obrigatorias: z.number().int().array().default([]),
  codigo: z.string(),
  campus: z.enum(CAMPUS),
  ideal_quad: z.boolean().default(false),
  identifier: z.string(),
  alunos_matriculados: z.number().int().array().default([]),
  after_kick: z.number().int().array().default([]),
  before_kick: z.number().int().array().default([]),
  year: z.number().int(),
  quad: z.number().int(),
  subject: zId().ref('subjects'),
  pratica: zId().ref('teachers').nullish(),
  teoria: zId().ref('teachers').nullish(),
  season: z.string(),
})

const componentSchema = zodSchema(zComponent,
  {
    timestamps: true,
  },
);

function setQuarter(component: UpdateQuery<Component> | null) {
  const { year, quad } = findQuarter();
  if (!component) {
    return;
  }
  component.year = year;
  component.quad = quad;
}   

componentSchema.index({ identifier: 'asc' });
componentSchema.index({ season: 'asc' })

componentSchema.pre('findOneAndUpdate', function () {
  const updatedComponent: UpdateQuery<Component> | null = this.getUpdate();
  if (!updatedComponent?.season) {
    setQuarter(updatedComponent);
  }
});

export type Component = z.infer<typeof zComponent>;
export type ComponentDocument = ReturnType<(typeof ComponentModel)['hydrate']>;

export const ComponentModel = model('disciplinas', componentSchema);
