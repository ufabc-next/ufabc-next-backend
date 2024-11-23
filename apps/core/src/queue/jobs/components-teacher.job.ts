import { generateIdentifier } from "@next/common";
import { QueueContext } from "../types.js";
import { ComponentModel } from "@/models/Component.js";

type ComponentTeacher = {
  disciplina_id: number | "-";
  codigo: string;
  disciplina: string;
  campus: "sbc" | "sa";
  turma: string;
  turno: "diurno" | "noturno";
  vagas: number;
  teoria: any;
  pratica: any;
  season: string;
  identifier?: string;
}

export async function processComponentsTeachers(ctx: QueueContext<ComponentTeacher>) {
  const { data: component } = ctx.job;
  
  try {
    component.identifier = generateIdentifier(component)
    const result = await ComponentModel.findOneAndUpdate({
      disciplina: component.disciplina,
      turno: component.turno,
      campus: component.campus,
      turma: component.turma,
    }, {
      $set: {
        teoria: component.teoria,
        pratica: component.pratica,
      }
    }, { new: true })
    ctx.app.log.debug({
      msg: 'Component processed',
      disciplina: component.disciplina,
      UFCode: component.codigo,
      class: component.turma,
      practice: component.pratica,
      teory: component.teoria,
      action: result?.isNew ? 'inserted' : 'updated',
    });
  } catch(error) {
    ctx.app.log.error({
      msg: 'Error processing component',
      error: error instanceof Error ? error.message : String(error),
      component,
    });
    throw error;
  }
  
}