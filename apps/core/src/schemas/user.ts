import { z } from 'zod';

const tags = ['User'];

export const deactivateUserSchema = {
  tags,
  response: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            message: z.string().openapi({
              description: 'Mensagem de despedida',
              example: 'Foi bom te ter aqui =)',
            }),
          }),
        },
      },
    },
    404: {
      content: {
        'application/json': {
          schema: z.object({
            message: z.string(),
          }),
        },
      },
    },
  },
};

export const resendEmailSchema = {
  tags,
  response: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            message: z.string().openapi({ example: 'E-mail enviado' }),
          }),
        },
      },
    },
  },
};

export const loginFacebookSchema = {
  body: z.object({
    ra: z.coerce.number(),
    email: z.string().email(),
  }),
  response: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            message: z.string().optional(),
            token: z.string(),
          }),
        },
      },
    },
  },
};

export const confirmUserSchema = {
  body: z.object({
    token: z.string(),
  }),
  response: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            token: z.string(),
          }),
        },
      },
    },
  },
};

export const validateUserEmailSchema = {
  tags,
  querystring: z.object({
    ra: z.string().describe('Student ID (RA) of the user to validate'),
  }),
  response: {
    400: {
      content: {
        'application/json': {
          schema: z.object({
            message: z
              .string()
              .describe(
                'Error message when the user does not exist or is an UFABC employee',
              ),
          }),
        },
      },
    },
    200: {
      content: {
        'application/json': {
          schema: z.object({
            email: z.string().describe('Valid email address of the user'),
          }),
        },
      },
    },
  },
};

export const getFacebookUserEmailSchema = {
  tags,
  querystring: z.object({
    ra: z.string(),
  }),
  response: {
    400: {
      content: {
        'application/json': {
          schema: z.object({
            message: z.string(),
          }),
        },
      },
    },
    404: {
      content: {
        'application/json': {
          schema: z.object({
            message: z.string(),
          }),
        },
      },
    },
    200: {
      content: {
        'application/json': {
          schema: z.object({
            email: z.string().email(),
          }),
        },
      },
    },
  },
};

export const sendRecoveryEmailSchema = {
  tags,
  body: z.object({
    email: z.string().email(),
  }),
};
