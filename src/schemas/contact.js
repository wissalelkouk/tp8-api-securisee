import { z } from "zod";

export const contactSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(254),
    message: z.string().min(10).max(2000),
  })
  .strict(); // refuse les champs en trop (mass assignment, API3)
