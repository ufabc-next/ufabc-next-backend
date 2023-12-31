import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateCoefficients } from './calculateCoefficients';

describe('common.lib.calculateCoefficients', () => {
  it('should calculate coefficients', () => {
    const mockedDisciplines = [
      {
        ano: 2020,
        periodo: 3,
        creditos: 3,
        categoria: 'Obrigatória',
      },
      {
        ano: 2020,
        periodo: 3,
        creditos: 5,
        categoria: 'Livre Escolha',
      },
      {
        ano: 2020,
        periodo: 3,
        creditos: 5,
        categoria: 'Obrigatória',
      },
      {
        ano: 2020,
        periodo: 3,
        creditos: 4,
        categoria: 'Opção Limitada',
      },
      {
        ano: 2021,
        periodo: 1,
        creditos: 5,
        categoria: 'Obrigatória',
      },
      {
        ano: 2021,
        periodo: 1,
        creditos: 3,
        categoria: 'Opção Limitada',
      },
      {
        ano: 2021,
        periodo: 1,
        creditos: 5,
        categoria: 'Obrigatória',
      },
      {
        ano: 2021,
        periodo: 1,
        creditos: 2,
        categoria: 'Opção Limitada',
      },
      {
        ano: 2021,
        periodo: 1,
        creditos: 3,
        categoria: 'Livre Escolha',
      },
      {
        ano: 2021,
        periodo: 1,
        creditos: 5,
        categoria: 'Opção Limitada',
      },
    ];

    const mockedGraduation = {
      credits_total: 190,
      limited_credits_number: 70,
      free_credits_number: 30,
      mandatory_credits_number: 90,
    };

    const result: any = calculateCoefficients(
      mockedDisciplines as any,
      mockedGraduation as any,
    );
    assert.deepEqual(0.089, result['2020'][3].cp_acumulado);
    assert.deepEqual(0.211, result['2021'][1].cp_acumulado);
  });
});
