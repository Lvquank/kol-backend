import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { schema } from "../config.js";
import { pool, query } from "../db.js";
import { firstTotal, listResponse, pagination, searchPattern } from "../lib/http.js";
import { requireAdmin } from "./auth.js";

type ProposalBody = {
  influencerKey?: string;
  proposalType?: string;
  details?: string;
  submitterEmail?: string;
  declarationConfirmed?: boolean;
};
type AdminListQuery = { status?: string; type?: string; q?: string; page?: string; limit?: string };
type IdParams = { proposalId: string };
type StatusBody = { status?: string; note?: string };
type InfluencerRow = { influencer_key: string; name: string };

const statuses = ["submitted", "in_review", "resolved", "rejected"] as const;
const proposalTypes = [
  "URL kênh bị lỗi hoặc không truy cập được",
  "Thêm kênh còn thiếu trên hệ thống",
  "Rate card/Bảng giá dịch vụ",
  "Ngành/Lĩnh vực hoạt động",
  "Mô tả/Bio kênh",
  "Thông tin khác"
] as const;

const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

function validateProposal(body: ProposalBody) {
  const influencerKey = clean(body.influencerKey);
  const proposalType = clean(body.proposalType);
  const details = clean(body.details);
  const submitterEmail = clean(body.submitterEmail).toLowerCase();

  if (!influencerKey) return { error: "Không xác định được KOL cần bổ sung thông tin." };
  if (!proposalTypes.includes(proposalType as (typeof proposalTypes)[number])) {
    return { error: "Nhóm thông tin đề xuất không hợp lệ." };
  }
  if (details.length < 10 || details.length > 2_000) {
    return { error: "Nội dung đề xuất phải có từ 10 đến 2.000 ký tự." };
  }
  if (submitterEmail && !validEmail(submitterEmail)) return { error: "Email không đúng định dạng." };
  if (body.declarationConfirmed !== true) return { error: "Bạn cần xác nhận cam kết trước khi gửi." };

  return { influencerKey, proposalType, details, submitterEmail: submitterEmail || null };
}

export const informationProposalRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: ProposalBody }>(
    "/information-proposals",
    { schema: { tags: ["Information proposals"], summary: "Submit a public KOL information proposal" } },
    async (request, reply) => {
      const validated = validateProposal(request.body ?? {});
      if ("error" in validated) {
        return reply.code(400).send({ error: "VALIDATION_ERROR", message: validated.error });
      }

      const influencer = await query<InfluencerRow>(
        `SELECT influencer_key, name FROM ${schema}.influencers WHERE influencer_key = $1`,
        [validated.influencerKey]
      );
      if (!influencer.rows[0]) {
        return reply.code(404).send({ error: "NOT_FOUND", message: "Không tìm thấy KOL được đề xuất." });
      }

      const proposalId = randomUUID();
      await query(
        `INSERT INTO ${schema}.kol_information_proposals
          (proposal_id, influencer_key, proposal_type, details, submitter_email, declaration_confirmed)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [proposalId, validated.influencerKey, validated.proposalType, validated.details, validated.submitterEmail]
      );

      return reply.code(201).send({
        data: {
          proposalId,
          influencerName: influencer.rows[0].name,
          status: "submitted",
          message: "Đề xuất đã được gửi tới bộ phận quản trị."
        }
      });
    }
  );

  app.get<{ Querystring: AdminListQuery }>(
    "/admin/information-proposals",
    { schema: { tags: ["Information proposals"], summary: "List public KOL information proposals" } },
    async (request) => {
      await requireAdmin(request);
      const pageInfo = pagination(request.query);
      const values: unknown[] = [];
      const conditions: string[] = [];

      if (statuses.includes(request.query.status as (typeof statuses)[number])) {
        values.push(request.query.status);
        conditions.push(`p.status = $${values.length}`);
      }
      if (proposalTypes.includes(request.query.type as (typeof proposalTypes)[number])) {
        values.push(request.query.type);
        conditions.push(`p.proposal_type = $${values.length}`);
      }
      const pattern = searchPattern(request.query.q);
      if (pattern) {
        values.push(pattern);
        conditions.push(`(i.name ILIKE $${values.length} ESCAPE '\\' OR p.details ILIKE $${values.length} ESCAPE '\\' OR COALESCE(p.submitter_email, '') ILIKE $${values.length} ESCAPE '\\')`);
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      values.push(pageInfo.limit, pageInfo.offset);
      const result = await query<Record<string, unknown>>(
        `SELECT p.proposal_id, p.influencer_key, i.name AS influencer_name,
                p.proposal_type, p.details, p.submitter_email, p.status,
                p.assigned_to, p.assigned_at, p.created_at,
                count(*) OVER()::text AS total_count
           FROM ${schema}.kol_information_proposals p
           JOIN ${schema}.influencers i ON i.influencer_key = p.influencer_key
           ${where}
          ORDER BY CASE p.status WHEN 'submitted' THEN 0 WHEN 'in_review' THEN 1 ELSE 2 END, p.created_at DESC
          LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values
      );
      return listResponse(result.rows.map(({ total_count: _totalCount, ...row }) => row), pageInfo.page, pageInfo.limit, firstTotal(result.rows[0]));
    }
  );

  app.get<{ Params: IdParams }>(
    "/admin/information-proposals/:proposalId",
    { schema: { tags: ["Information proposals"], summary: "Get a KOL information proposal" } },
    async (request, reply) => {
      await requireAdmin(request);
      const result = await query<Record<string, unknown>>(
        `SELECT p.proposal_id, p.influencer_key, i.name AS influencer_name,
                p.proposal_type, p.details, p.submitter_email, p.status,
                p.assigned_to, p.assigned_at, p.created_at, p.updated_at,
                COALESCE((
                  SELECT jsonb_agg(jsonb_build_object(
                    'reviewId', r.review_id,
                    'reviewerId', r.reviewer_id,
                    'previousStatus', r.previous_status,
                    'nextStatus', r.next_status,
                    'note', r.note,
                    'createdAt', r.created_at
                  ) ORDER BY r.created_at DESC)
                  FROM ${schema}.kol_information_proposal_reviews r
                  WHERE r.proposal_id = p.proposal_id
                ), '[]'::jsonb) AS reviews
           FROM ${schema}.kol_information_proposals p
           JOIN ${schema}.influencers i ON i.influencer_key = p.influencer_key
          WHERE p.proposal_id = $1`,
        [request.params.proposalId]
      );
      if (!result.rows[0]) return reply.code(404).send({ error: "NOT_FOUND", message: "Không tìm thấy đề xuất." });
      return { data: result.rows[0] };
    }
  );

  app.patch<{ Params: IdParams; Body: StatusBody }>(
    "/admin/information-proposals/:proposalId/status",
    { schema: { tags: ["Information proposals"], summary: "Review a KOL information proposal" } },
    async (request, reply) => {
      const admin = await requireAdmin(request);
      const nextStatus = request.body?.status;
      const note = clean(request.body?.note);
      if (!statuses.includes(nextStatus as (typeof statuses)[number])) {
        return reply.code(400).send({ error: "VALIDATION_ERROR", message: "Trạng thái không hợp lệ." });
      }
      if (note.length > 1_000) {
        return reply.code(400).send({ error: "VALIDATION_ERROR", message: "Ghi chú tối đa 1.000 ký tự." });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const current = await client.query<{ status: string }>(
          `SELECT status FROM ${schema}.kol_information_proposals WHERE proposal_id = $1 FOR UPDATE`,
          [request.params.proposalId]
        );
        if (!current.rows[0]) {
          await client.query("ROLLBACK");
          return reply.code(404).send({ error: "NOT_FOUND", message: "Không tìm thấy đề xuất." });
        }

        await client.query(
          `UPDATE ${schema}.kol_information_proposals
              SET status = $2,
                  assigned_to = $3,
                  assigned_at = CASE WHEN assigned_at IS NULL THEN now() ELSE assigned_at END,
                  updated_at = now()
            WHERE proposal_id = $1`,
          [request.params.proposalId, nextStatus, admin.sub]
        );
        await client.query(
          `INSERT INTO ${schema}.kol_information_proposal_reviews
            (review_id, proposal_id, reviewer_id, previous_status, next_status, note)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [randomUUID(), request.params.proposalId, admin.sub, current.rows[0].status, nextStatus, note || null]
        );
        await client.query("COMMIT");
        return { data: { proposalId: request.params.proposalId, previousStatus: current.rows[0].status, status: nextStatus } };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
  );
};
