import { ofetch } from 'ofetch';
import data from './ufabc-dropdown-users.json' with { type: 'json' };

const withLoginAndEmail = data.results.flatMap((user) => {
  const login = user.title.split('-')[1].trim();
  const errors = [];

  if (!login) {
    console.log('NADA');
    errors.push({
      msg: 'Login is empty',
      user,
    });
  }

  const email = `${login}@ufabc.edu.br`;

  return {
    ...user,
    login,
    email,
    errors,
  };
});

// ufabc parser has some students, so we will use the endpoint to filter the students of this list

const partiallyFilteredStudents = [];

for (const user of withLoginAndEmail) {
  const isStudent = await ofetch<{
    status: boolean;
  }>(`http://localhost:5001/backoffice/students/${user.login}`);

  if (isStudent.status) {
    partiallyFilteredStudents.push(user);
  }
}

console.log(partiallyFilteredStudents.length, 'rest');
