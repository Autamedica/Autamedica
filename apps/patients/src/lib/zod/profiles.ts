import { z } from 'zod';
import { camelToSnake } from '../mappers/camelToSnake';
import { snakeToCamel } from '../mappers/snakeToCamel';

type CamelCase<S extends string> = S extends `${infer Head}_${infer Tail}`
  ? `${Head}${Capitalize<CamelCase<Tail>>}`
  : S;

type CamelCased<T> = T extends Array<infer Item>
  ? Array<CamelCased<Item>>
  : T extends Record<string, unknown>
    ? {
        [Key in keyof T as Key extends string ? CamelCase<Key> : Key]: CamelCased<T[Key]>;
      }
    : T;

const UserRoleEnum = z.enum([
  'patient',
  'doctor',
  'company_admin',
  'organization_admin',
  'platform_admin',
  'company',
  'admin',
]);

export const ProfileSnakeSchema = z.object({
  user_id: z.string().uuid(),
  email: z.string().email().nullable(),
  role: UserRoleEnum.nullable(),
  external_id: z.string().nullable(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  avatar_url: z.string().url().nullable().optional(),
  active: z.boolean().nullable().optional(),
  onboarding_started_at: z.string().nullable().optional(),
  onboarding_completed_at: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable().optional(),
});

export type ProfileSnake = z.infer<typeof ProfileSnakeSchema>;
export type Profile = CamelCased<ProfileSnake>;

export function parseProfile(raw: unknown): Profile {
  const result = ProfileSnakeSchema.parse(raw);
  return snakeToCamel<Profile>(result);
}

export function safeParseProfile(raw: unknown): Profile | null {
  const result = ProfileSnakeSchema.safeParse(raw);
  if (!result.success) {
    return null;
  }

  return snakeToCamel<Profile>(result.data);
}

export const ProfileUpdateSchema = z.object({
  firstName: z.string().trim().min(1).nullable().optional(),
  lastName: z.string().trim().min(1).nullable().optional(),
  phone: z
    .string()
    .trim()
    .min(6, 'El teléfono debe tener al menos 6 caracteres')
    .nullable()
    .optional(),
});

export type ProfileUpdateInput = z.infer<typeof ProfileUpdateSchema>;

export function buildProfileUpdatePayload(input: ProfileUpdateInput) {
  const validated = ProfileUpdateSchema.parse(input);
  const payload = Object.fromEntries(
    Object.entries(validated).filter(([, value]) => value !== undefined),
  );

  return camelToSnake<Partial<ProfileSnake>>(payload);
}
