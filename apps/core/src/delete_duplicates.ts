import { CommentModel } from './models/Comment.ts';
import { EnrollmentModel } from './models/Enrollment.ts';

const duplicates = await EnrollmentModel.aggregate([
  {
    $group: {
      _id: {
        ra: '$ra',
        season: '$season',
        subject: '$subject',
        year: '$year',
        quad: '$quad',
      },
      count: { $sum: 1 },
      docs: {
        $push: {
          _id: '$_id',
          ra: '$ra',
          disciplina: '$disciplina',
          turma: '$turma',
          season: '$season',
          year: '$year',
          quad: '$quad',
          identifier: '$identifier',
          createdAt: '$createdAt',
          updatedAt: '$updatedAt',
        },
      },
    },
  },
  {
    $match: {
      count: { $gt: 1 },
      '_id.subject': { $ne: null },
      '_id.ra': 11202230754,
    },
  },
]);

console.log('Found duplicates:', duplicates.length);

const duplicatesToDelete = [];

// Process each group of duplicates
for (const group of duplicates) {
  // Sort docs by createdAt in descending order (newest first)
  const sortedDocs = group.docs.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  // Check if any of the duplicates have comments
  const hasComments = await Promise.all(
    sortedDocs.map((doc) => CommentModel.exists({ enrollment: doc._id })),
  );

  // If none of the duplicates have comments, keep the oldest and delete the newest
  if (!hasComments.some((result) => result !== null)) {
    // Add all except the last one (oldest) to delete list
    duplicatesToDelete.push(...sortedDocs.slice(0, -1).map((doc) => doc._id));
  }
}

console.log('Duplicates to delete:', duplicatesToDelete.length);

if (duplicatesToDelete.length > 0) {
  // await EnrollmentModel.deleteMany({
  //   _id: { $in: duplicatesToDelete },
  // });
  console.log('Duplicates deleted successfully');
}

console.log('Total duplicates found:', duplicates.length);
console.log('Total duplicates deleted:', duplicatesToDelete.length);
console.log('Process completed successfully');
