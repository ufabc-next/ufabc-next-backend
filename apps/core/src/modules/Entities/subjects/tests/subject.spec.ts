import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import mongoose from 'mongoose';
import { GenericContainer, Wait } from 'testcontainers';
import { SubjectModel } from '@/models/Subject.js';
import { SubjectRepository } from '../subjects.repository.js';
import { SubjectService } from '../subjects.service.js';
import { camelCase, startCase } from 'lodash-es';

describe('Subjects service unit tests', () => {
  let connection: typeof mongoose;
  const subjectRepository = new SubjectRepository(SubjectModel);
  const subjectService = new SubjectService(subjectRepository);

  before(async () => {
    const mongoContainer = await new GenericContainer('mongo:4.0.1')
      .withExposedPorts(27017)
      .withWaitStrategy(Wait.forLogMessage(/.*waiting for connections.*/i))
      .start();

    connection = await mongoose.connect(
      `mongodb://127.0.0.1:${mongoContainer.getMappedPort(27017)}/`,
    );
  });

  after(async () => {
    //No need to stop the container, it will be stopped automatically
    await connection.disconnect();
  });

  it('Should create a subject', async () => {
    const createdSubject = await subjectService.createSubject('Algebra Linear');

    const subjectInDb = await subjectRepository.listSubject({
      name: 'Algebra Linear',
    });

    assert.strictEqual(createdSubject.name, subjectInDb[0].name);
  });

  it('Should search for a subject', async () => {
    const subjects = [
      {
        name: 'Matemática Discreta',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        name: 'Cálculo I',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        name: 'Cálculo II',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    await Promise.all(
      subjects.map(async (subject) => {
        subjectService.createSubject(subject.name);
      }),
    );

    const normalizedSearch = startCase(camelCase('cálculo'));
    const validatedSearch = normalizedSearch.replaceAll(
      /[\s#$()*+,.?[\\\]^{|}-]/g,
      '\\$&',
    );
    const search = new RegExp(validatedSearch, 'gi');
    const searchResults = await subjectService.findSubject(search);

    assert.strictEqual(
      searchResults.data.filter((s) => s.name === 'Cálculo I').length,
      1,
    );
  });
});
