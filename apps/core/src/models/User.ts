import { model } from 'mongoose';
import { z } from '@/lib/custom-zod.js'
import { zodSchema } from '@zodyac/zod-mongoose';

const zUser = z.object({
  ra: z.number().unique().nullable().default(null),
  email: z.string().email().unique().nullable().default(null),
  confirmed: z.boolean().default(false),
  active: z.boolean().default(true),
  oauth: z.object({
    facebook: z.string().nullish(),
    emailFacebook: z.string().nullish(),
    google: z.string().nullish(),
    emailGoogle: z.string().nullish(),
    email: z.string().nullish(),
    picture: z.string().nullish(),
  }).partial(),
  devices: z.object({
    phone: z.string(),
    token: z.string(),
    deviceId: z.string(),
  }).array(),
  permissions: z.string().array().default([]),
});

const userSchema = zodSchema(zUser, {
  timestamps: true
})

// Add the partial filter expression for unique fields
// This is needed since the default zod-mongoose doesn't create the partial filter expression
// We need to add this manually after schema creation
if (userSchema.path('ra')) {
  userSchema.path('ra').index({ 
    unique: true, 
    partialFilterExpression: { ra: { $exists: true } } 
  });
}

if (userSchema.path('email')) {
  userSchema.path('email').index({ 
    unique: true, 
    partialFilterExpression: { email: { $exists: true } } 
  });
}

export type User = z.infer<typeof zUser>;
export type UserDocument = ReturnType<(typeof UserModel)['hydrate']>;
export const UserModel = model('users', userSchema);
