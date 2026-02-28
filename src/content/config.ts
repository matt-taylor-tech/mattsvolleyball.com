import { defineCollection, z } from 'astro:content';

const seasons = defineCollection({
  type: 'content',
  schema: z.object({
    name: z.string(),
    year: z.number(),
    startDate: z.string(),
    endDate: z.string().optional(),
    status: z.enum(['upcoming', 'active', 'completed']),
    registrationOpen: z.boolean().default(false),
    registrationUrl: z.string().optional(),
    leagues: z.array(
      z.object({
        day: z.string(),
        format: z.string(),
        maxTeams: z.number().optional(),
        fee: z.string().optional(),
      })
    ),
  }),
});

export const collections = { seasons };
