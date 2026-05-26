import { z } from "zod";

export const optionalString = () =>
  z
    .string()
    .nullish()
    .transform((v) => v ?? undefined);

export const optionalNumber = () =>
  z
    .number()
    .nullish()
    .transform((v) => v ?? undefined);

export const IsoDateString = z.string().min(1);

export const booleanFromInt = z
  .union([z.number(), z.boolean()])
  .transform((v) => (typeof v === "boolean" ? v : v === 1));
