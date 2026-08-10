import type { FastifyReply } from "fastify";

export type Pagination = {
  page: number;
  limit: number;
  offset: number;
};

export type ListQuery = {
  page?: string | number;
  limit?: string | number;
};

export function parseInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function pagination(query: ListQuery, maxLimit = 100): Pagination {
  const page = parseInteger(query.page, 1, 1, 1_000_000);
  const limit = parseInteger(query.limit, 20, 1, maxLimit);
  return { page, limit, offset: (page - 1) * limit };
}

export function searchPattern(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/[%_]/g, "\\$&");
  return normalized ? `%${normalized}%` : null;
}

export function listResponse<T>(rows: T[], page: number, limit: number, total: number) {
  return {
    data: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit)
    }
  };
}

export function notFound(reply: FastifyReply, resource: string) {
  return reply.code(404).send({
    error: "NOT_FOUND",
    message: `${resource} not found`
  });
}

export function firstTotal(row: Record<string, unknown> | undefined): number {
  if (!row) return 0;
  return Number.parseInt(String(row.total_count ?? "0"), 10) || 0;
}
