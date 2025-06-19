import { type InferSchemaType, Schema, model } from 'mongoose';

const CAMPUS = ['sao bernardo', 'santo andre', 'sbc', 'sa'] as const;

const componentSchema = new Schema(
  {
    disciplina_id: { type: Number, required: false, default: null },
    disciplina: { type: String, required: true },
    turno: { type: String, required: true, enum: ['diurno', 'noturno'] },
    turma: { type: String, required: true },
    vagas: { type: Number, required: true },
    obrigatorias: { type: [Number], default: [] },
    codigo: { type: String, required: true },
    campus: { type: String, enum: CAMPUS, required: true },
    ideal_quad: { type: Boolean, default: false, required: true },
    uf_cod_turma: { type: String, required: true },
    identifier: {
      type: String,
      required: false,
    },
    // lista de alunos matriculados no momento
    alunos_matriculados: {
      type: [Number],
      default: [],
      required: true,
    },
    // como estava o estado da matrícula antes do chute
    before_kick: {
      type: [Number],
      default: [],
      required: true,
    },
    // como estava o estado da matrícula após o chute
    after_kick: {
      type: [Number],
      default: [],
      required: true,
    },
    year: { type: Number, required: true },
    quad: { type: Number, required: true },
    season: { type: String, required: true },
    subject: {
      type: Schema.Types.ObjectId,
      ref: 'subjects',
      required: true,
    },
    teoria: {
      type: Schema.Types.ObjectId,
      ref: 'teachers',
    },
    pratica: {
      type: Schema.Types.ObjectId,
      ref: 'teachers',
    },
    groupURL: {
      type: String,
      required: false,
      default: null,
    },
    kind: {
      type: String,
      enum: ['api', 'file'],
      default: 'api',
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

const disciplinasMetadataSchema = new Schema(
  {
    disciplina_id: { type: Number, required: true },
    disciplina_codigo_turma: { type: String, required: true },
    nome: { type: String, required: true },
    planejamento: {
      ementa: { type: String, required: true },
      objetivos: { type: String, required: true },
      metodologia: { type: String, required: true },
      avaliacao: { type: String, required: true },
    },
    cronograma: [
      {
        aula: { type: String, required: true },
        data: { type: String, required: true }, 
      },
    ],
    metadata: {
      source_file: { type: String, required: true },
      processed_at: { type: String, required: true }, 
    },
  },
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

export type Component = InferSchemaType<typeof componentSchema>;
export type ComponentDocument = ReturnType<(typeof ComponentModel)['hydrate']>;

export const ComponentModel = model('disciplinas', componentSchema);

export const MetadataModel = model('disciplinas_metadata', disciplinasMetadataSchema, "disciplinas_metadata");