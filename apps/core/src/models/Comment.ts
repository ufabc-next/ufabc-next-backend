import {
  type AnyObject,
  type FilterQuery,
  type InferSchemaType,
  Schema,
  type Types,
  model,
} from 'mongoose';
import { EnrollmentModel } from './Enrollment.js';
import { ReactionModel } from './Reaction.js';

const COMMENT_TYPE = ['teoria', 'pratica'] as const;

const commentSchema = new Schema(
  {
    comment: {
      type: String,
      required: true,
    },

    viewers: {
      type: Number,
      default: 0,
    },

    enrollment: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'enrollments',
    },

    type: {
      type: String,
      required: true,
      enum: COMMENT_TYPE,
    },

    ra: {
      type: String,
      required: true,
    },

    active: {
      type: Boolean,
      default: true,
    },

    teacher: {
      type: Schema.Types.ObjectId,
      ref: 'teachers',
      required: true,
    },

    subject: {
      type: Schema.Types.ObjectId,
      ref: 'subjects',
      required: true,
    },

    reactionsCount: {
      like: {
        type: Number,
        default: 0,
        required: false,
      },
      recommendation: {
        type: Number,
        default: 0,
        required: false,
      },
      star: {
        type: Number,
        default: 0,
        required: false,
      },
    },
  },
  {
    statics: {
      async commentsByReaction(
        query: FilterQuery<AnyObject>,
        userId: Types.ObjectId,
        populateFields: string[] = ['enrollment', 'subject'],
        limit = 10,
        page = 0,
      ) {
        if (!userId) {
          throw new Error(`Usuário Não Encontrado ${userId}`);
        }

        const comments = await this.find(query)
          .lean(true)
          .populate(populateFields)
          .skip(page * limit)
          .limit(limit)
          .sort({
            'reactionsCount.recommendation': 'desc',
            'reactionsCount.likes': 'desc',
            createdAt: 'desc',
          });

        // Fetch all user reactions for these comments in a single query
        const commentIds = comments.map((comment) => comment._id);
        const userReactions = await ReactionModel.find({
          comment: { $in: commentIds },
          user: userId,
        }).lean();

        // Create a map of comment ID to reaction kinds
        const reactionMap = new Map<string, Set<string>>();
        for (const reaction of userReactions) {
          const commentId = reaction.comment.toString();
          if (!reactionMap.has(commentId)) {
            reactionMap.set(commentId, new Set());
          }
          reactionMap.get(commentId)?.add(reaction.kind);
        }

        // Attach reactions to comments
        for (const comment of comments) {
          const commentId = comment._id.toString();
          const kinds = reactionMap.get(commentId) || new Set();
          
          // @ts-ignore dynamic obj property
          comment.myReactions = {
            like: kinds.has('like'),
            recommendation: kinds.has('recommendation'),
            star: kinds.has('star'),
          };
        }

        return { data: comments, total: await this.countDocuments(query) };
      },
    },
    toObject: { virtuals: true },
    timestamps: true,
  },
);

commentSchema.pre('save', async function () {
  if (this.isNew) {
    const enrollmentDocument = this.collection;
    const enrollment = await enrollmentDocument.findOne({
      enrollment: this.enrollment,
      active: true,
      type: this.type,
    });
    if (enrollment) {
      throw new Error(
        `Você só pode comentar uma vez neste vinculo ${this.enrollment}`,
      );
    }
  }
});

commentSchema.post('save', async function () {
  await EnrollmentModel.findOneAndUpdate(
    { _id: this.enrollment },
    { $addToSet: { comments: [this.type] } },
  );
});

// Removed automatic viewer increment on find to improve performance
// If viewer tracking is needed, it should be done explicitly in the route handler

commentSchema.index({ comment: 'asc', user: 'asc' });
commentSchema.index({ reactionsCount: 'desc' });

commentSchema.index({
  'reactionsCount.recommendation': 'desc',
  'reactionsCount.likes': 'desc',
  createdAt: 'desc',
});

export type Comment = InferSchemaType<typeof commentSchema>;
export type CommentDocument = ReturnType<(typeof CommentModel)['hydrate']>;
export const CommentModel = model('comments', commentSchema);
