import { type InferSchemaType, Schema, model } from 'mongoose';

const userRaHistorySchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true,
    },
    oldRa: {
      type: Number,
      required: true,
    },
    newRa: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

// Compound index for efficient per-user history queries ordered by time
userRaHistorySchema.index({ userId: 1, createdAt: -1 });
// Allow reverse lookup: "which user(s) previously held this RA?"
userRaHistorySchema.index({ oldRa: 1 });
// Allow lookup: "which user(s) migrated to this RA?"
userRaHistorySchema.index({ newRa: 1 });

export type UserRaHistory = InferSchemaType<typeof userRaHistorySchema>;
export type UserRaHistoryDocument = ReturnType<
  (typeof UserRaHistoryModel)['hydrate']
>;
export const UserRaHistoryModel = model('user_ra_histories', userRaHistorySchema);
