import { z } from "zod";
import { MiddlewareHandler } from "hono";
import { HonoContext, ValidationTarget } from "@/types";
import { createFactory } from "hono/factory";

export const factory = createFactory<HonoContext>();

export const softValidator = <
  T extends z.ZodType<any, any>,
  Target extends ValidationTarget,
>(
  target: Target,
  schema: T,
): MiddlewareHandler<HonoContext> => {
  return async (c, next) => {
    let data: any;

    try {
      switch (target) {
        case "json":
          data = await c.req.json();
          break;
        case "form":
          data = await c.req.parseBody();
          break;
        case "query":
          data = c.req.query();
          break;
        case "param":
          data = c.req.param();
          break;
        case "header":
          data = c.req.header();
          break;
        case "cookie":
          data = c.req.header("Cookie");
          break;
        default:
          data = {};
      }
    } catch (e) {
      data = {};
    }

    const result = schema.safeParse(data);

    // Store validation results with target-specific keys to avoid overwriting
    const validationKey = `validationResult_${target}`;
    c.set(validationKey as keyof HonoContext["Variables"], {
      success: result.success,
      data: result.success ? result.data : data,
      error: result.success ? null : result.error,
    });

    return next();
  };
};

// Helper to get validation result in handler
export const getValidation = <T>(
  c: any,
  target: ValidationTarget,
): {
  success: boolean;
  data: T;
  error: z.ZodError | null;
} => {
  const validationKey = `validationResult_${target}`;
  return c.var[validationKey] || { success: false, data: {}, error: null };
};
