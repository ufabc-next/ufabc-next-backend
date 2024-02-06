import { camelCase, sample, words } from 'lodash';
import { randomEmails, randomNames } from './constants';

export function randomJoin(source: string[][], joiner = ''): string {
  return source.map((it) => sample(it)).join(joiner);
}

export function generateRandomUfabcEmail(
  name: string = randomJoin(randomEmails.concat(randomNames)),
): string {
  return `${camelCase(words(name).reverse().join(' '))}@aluno.ufabc.edu.br`;
}

export function generateRandomCommonEmail(
  name: string = randomJoin(randomEmails.concat(randomNames)),
): string {
  return `${camelCase(words(name).reverse().join(' '))}@${randomJoin(
    randomEmails,
  )}.com}`;
}

export function generateRandomName(): string {
  return randomJoin(randomNames);
}

// use this to generate a random RA
export function generateRandomNumber(length: number = 11): number {
  return Math.floor(Math.random() * 10 ** length);
}
