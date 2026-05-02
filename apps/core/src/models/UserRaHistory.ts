import { type InferSchemaType, Schema, model } from 'mongoose';

const userRaHistorySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'users', required: true },
    oldRa: { type: Number, required: true },
    newRa: { type: Number, required: true },
  },
  { timestamps: true }
);

userRaHistorySchema.index({ userId: 1, createdAt: -1 });

export type UserRaHistory = InferSchemaType<typeof userRaHistorySchema>;
export type UserRaHistoryDocument = ReturnType<
  (typeof UserRaHistoryModel)['hydrate']
>;

export const UserRaHistoryModel = model<UserRaHistory>(
  'user_ras',
  userRaHistorySchema
);