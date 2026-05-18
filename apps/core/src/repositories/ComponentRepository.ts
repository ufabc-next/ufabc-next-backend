import { ComponentModel } from '@/models/Component.js';
import type { ComponentGroupDTO } from '@/dtos/ComponentDTO.js';

export const ComponentRepository = {
    async findGroupComponentsForSeason(season: string): Promise<ComponentGroupDTO[]> {
        const docs = (await ComponentModel.find(
            {
                groupURL: { $exists: true, $ne: null },
                season,
            },
            {
                groupURL: 1,
                disciplina_id: 1,
            },
            { sort: { updateAt: -1 } }
        )
            .lean()
            .exec()) as Array<{ groupURL?: string | null; disciplina_id?: number | null }>;

        return docs
            .filter((d) => d.groupURL != null && d.disciplina_id != null)
            .map((d) => ({
                groupUrl: String(d.groupURL),
                disciplinaId: Number(d.disciplina_id),
            }));
    },
};
