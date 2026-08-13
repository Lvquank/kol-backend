import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { schema } from "../config.js";
import { pool, query } from "../db.js";
import { firstTotal, listResponse, pagination, searchPattern } from "../lib/http.js";
import { requireAdmin } from "./auth.js";

type ProposalBody = {
  entityType?: "KOL" | "MCN";
  entityKey?: string;
  influencerKey?: string;
  mcnKey?: string;
  proposalType?: string;
  details?: string;
  submitterEmail?: string;
  declarationConfirmed?: boolean;
};
type AdminListQuery = { entityType?: string; status?: string; type?: string; q?: string; page?: string; limit?: string };
type IdParams = { proposalId: string };
type StatusBody = { status?: string; note?: string };
type EntityRow = { entity_key: string; name: string };

const statuses = ["submitted", "in_review", "resolved", "rejected"] as const;
const kolProposalTypes = [
  "URL kênh bị lỗi hoặc không truy cập được",
  "Thêm kênh còn thiếu trên hệ thống",
  "Rate card/Bảng giá dịch vụ",
  "Ngành/Lĩnh vực hoạt động",
  "Mô tả/Bio kênh",
  "Thông tin khác"
] as const;

const mcnProposalTypes = [
  "Kênh thiếu",
  "Kênh trùng",
  "Kênh không thuộc MCN",
  "Email/Website",
  "Hotline",
  "Người phụ trách",
  "Giấy phép ĐKKD",
  "Mã số thuế (MST)",
  "Địa chỉ",
  "Người chịu trách nhiệm",
  "Số KOL",
  "Lĩnh vực",
  "Logo",
  "Thông tin khác"
] as const;

const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

async function ensureAllProposalTables() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS ${schema}.kol_information_proposals (
        proposal_id uuid PRIMARY KEY,
        influencer_key text NOT NULL REFERENCES ${schema}.influencers(influencer_key) ON DELETE CASCADE,
        proposal_type text NOT NULL,
        details text NOT NULL,
        submitter_email text,
        declaration_confirmed boolean NOT NULL DEFAULT false,
        status text NOT NULL DEFAULT 'submitted'
          CHECK (status IN ('submitted', 'in_review', 'resolved', 'rejected')),
        assigned_to uuid REFERENCES ${schema}.admin_users(user_id),
        assigned_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS ${schema}.kol_information_proposal_reviews (
        review_id uuid PRIMARY KEY,
        proposal_id uuid NOT NULL REFERENCES ${schema}.kol_information_proposals(proposal_id) ON DELETE CASCADE,
        reviewer_id uuid NOT NULL REFERENCES ${schema}.admin_users(user_id),
        previous_status text NOT NULL,
        next_status text NOT NULL,
        note text,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS ${schema}.mcn_information_proposals (
        proposal_id uuid PRIMARY KEY,
        mcn_key text NOT NULL REFERENCES ${schema}.mcn_owners(source_id) ON DELETE CASCADE,
        proposal_type text NOT NULL,
        details text NOT NULL,
        submitter_email text,
        declaration_confirmed boolean NOT NULL DEFAULT false,
        status text NOT NULL DEFAULT 'submitted'
          CHECK (status IN ('submitted', 'in_review', 'resolved', 'rejected')),
        assigned_to uuid REFERENCES ${schema}.admin_users(user_id),
        assigned_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS ${schema}.mcn_information_proposal_reviews (
        review_id uuid PRIMARY KEY,
        proposal_id uuid NOT NULL REFERENCES ${schema}.mcn_information_proposals(proposal_id) ON DELETE CASCADE,
        reviewer_id uuid NOT NULL REFERENCES ${schema}.admin_users(user_id),
        previous_status text NOT NULL,
        next_status text NOT NULL,
        note text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
  } catch {
    // Ignore schema errors if tables exist
  }
}

function validateProposal(body: ProposalBody) {
  const entityType = body.entityType === "MCN" || Boolean(body.mcnKey) ? "MCN" : "KOL";
  const entityKey = clean(body.entityKey || (entityType === "MCN" ? body.mcnKey : body.influencerKey));
  const proposalType = clean(body.proposalType);
  const details = clean(body.details);
  const submitterEmail = clean(body.submitterEmail).toLowerCase();

  if (!entityKey) return { error: `Không xác định được ${entityType} cần bổ sung thông tin.` };

  const validTypes = entityType === "MCN" ? mcnProposalTypes : kolProposalTypes;
  if (!validTypes.includes(proposalType as any)) {
    return { error: "Nhóm thông tin đề xuất không hợp lệ." };
  }
  if (details.length < 10 || details.length > 2_000) {
    return { error: "Nội dung đề xuất phải có từ 10 đến 2.000 ký tự." };
  }
  if (submitterEmail && !validEmail(submitterEmail)) return { error: "Email không đúng định dạng." };
  if (body.declarationConfirmed !== true) return { error: "Bạn cần xác nhận cam kết trước khi gửi." };

  return { entityType, entityKey, proposalType, details, submitterEmail: submitterEmail || null };
}

export const informationProposalRoutes: FastifyPluginAsync = async (app) => {
  await ensureAllProposalTables();

  app.post<{ Body: ProposalBody }>(
    "/information-proposals",
    { schema: { tags: ["Information proposals"], summary: "Submit a public information proposal for KOL or MCN" } },
    async (request, reply) => {
      await ensureAllProposalTables();
      const validated = validateProposal(request.body ?? {});
      if ("error" in validated) {
        return reply.code(400).send({ error: "VALIDATION_ERROR", message: validated.error });
      }

      const proposalId = randomUUID();

      if (validated.entityType === "MCN") {
        const mcn = await query<EntityRow>(
          `SELECT source_id AS entity_key, name FROM ${schema}.mcn_owners WHERE source_id = $1 LIMIT 1`,
          [validated.entityKey]
        );
        if (!mcn.rows[0]) {
          return reply.code(404).send({ error: "NOT_FOUND", message: "Không tìm thấy MCN được đề xuất." });
        }

        await query(
          `INSERT INTO ${schema}.mcn_information_proposals
            (proposal_id, mcn_key, proposal_type, details, submitter_email, declaration_confirmed)
           VALUES ($1, $2, $3, $4, $5, true)`,
          [proposalId, mcn.rows[0].entity_key, validated.proposalType, validated.details, validated.submitterEmail]
        );

        return reply.code(201).send({
          data: {
            proposalId,
            entityName: mcn.rows[0].name,
            entityType: "MCN",
            status: "submitted",
            message: "Đề xuất thông tin MCN đã được gửi tới bộ phận quản trị."
          }
        });
      }

      const influencer = await query<EntityRow>(
        `SELECT influencer_key AS entity_key, name FROM ${schema}.influencers WHERE influencer_key = $1 LIMIT 1`,
        [validated.entityKey]
      );
      if (!influencer.rows[0]) {
        return reply.code(404).send({ error: "NOT_FOUND", message: "Không tìm thấy KOL được đề xuất." });
      }

      await query(
        `INSERT INTO ${schema}.kol_information_proposals
          (proposal_id, influencer_key, proposal_type, details, submitter_email, declaration_confirmed)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [proposalId, influencer.rows[0].entity_key, validated.proposalType, validated.details, validated.submitterEmail]
      );

      return reply.code(201).send({
        data: {
          proposalId,
          influencerName: influencer.rows[0].name,
          entityType: "KOL",
          status: "submitted",
          message: "Đề xuất đã được gửi tới bộ phận quản trị."
        }
      });
    }
  );

  app.get<{ Querystring: AdminListQuery }>(
    "/admin/information-proposals",
    { schema: { tags: ["Information proposals"], summary: "List public information proposals" } },
    async (request) => {
      await requireAdmin(request);
      await ensureAllProposalTables();
      const pageInfo = pagination(request.query);
      const values: unknown[] = [];
      const conditions: string[] = [];

      if (statuses.includes(request.query.status as any)) {
        values.push(request.query.status);
        conditions.push(`p.status = $${values.length}`);
      }
      if (kolProposalTypes.includes(request.query.type as any) || mcnProposalTypes.includes(request.query.type as any)) {
        values.push(request.query.type);
        conditions.push(`p.proposal_type = $${values.length}`);
      }
      const pattern = searchPattern(request.query.q);
      if (pattern) {
        values.push(pattern);
        conditions.push(`(p.entity_name ILIKE $${values.length} ESCAPE '\\' OR p.details ILIKE $${values.length} ESCAPE '\\' OR COALESCE(p.submitter_email, '') ILIKE $${values.length} ESCAPE '\\')`);
      }

      const entityFilter = request.query.entityType?.toUpperCase();
      let entityWhere = "";
      if (entityFilter === "KOL") entityWhere = "AND p.entity_type = 'KOL'";
      else if (entityFilter === "MCN") entityWhere = "AND p.entity_type = 'MCN'";

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")} ${entityWhere}` : (entityWhere ? `WHERE 1=1 ${entityWhere}` : "");
      values.push(pageInfo.limit, pageInfo.offset);

      const unionSql = `
        WITH combined AS (
          SELECT p.proposal_id,
                 p.influencer_key AS entity_key,
                 p.influencer_key AS influencer_key,
                 'KOL' AS entity_type,
                 i.name AS entity_name,
                 i.name AS influencer_name,
                 p.proposal_type, p.details, p.submitter_email, p.status, p.assigned_to, p.assigned_at, p.created_at
            FROM ${schema}.kol_information_proposals p
            JOIN ${schema}.influencers i ON i.influencer_key = p.influencer_key
          UNION ALL
          SELECT p.proposal_id,
                 p.mcn_key AS entity_key,
                 p.mcn_key AS influencer_key,
                 'MCN' AS entity_type,
                 m.name AS entity_name,
                 m.name AS influencer_name,
                 p.proposal_type, p.details, p.submitter_email, p.status, p.assigned_to, p.assigned_at, p.created_at
            FROM ${schema}.mcn_information_proposals p
            JOIN ${schema}.mcn_owners m ON m.source_id = p.mcn_key
        )
        SELECT p.proposal_id, p.entity_key, p.entity_type, p.entity_name,
               p.influencer_key, p.influencer_name,
               p.proposal_type, p.details, p.submitter_email, p.status, p.assigned_to, p.assigned_at, p.created_at,
               count(*) OVER()::text AS total_count
          FROM combined p
          ${where}
         ORDER BY CASE p.status WHEN 'submitted' THEN 0 WHEN 'in_review' THEN 1 ELSE 2 END, p.created_at DESC
         LIMIT $${values.length - 1} OFFSET $${values.length}
      `;

      const result = await query<Record<string, unknown>>(unionSql, values);
      return listResponse(result.rows.map(({ total_count: _totalCount, ...row }) => row), pageInfo.page, pageInfo.limit, firstTotal(result.rows[0]));
    }
  );

  app.get<{ Params: IdParams }>(
    "/admin/information-proposals/:proposalId",
    { schema: { tags: ["Information proposals"], summary: "Get an information proposal" } },
    async (request, reply) => {
      await requireAdmin(request);
      await ensureAllProposalTables();

      const kolResult = await query<Record<string, unknown>>(
        `SELECT p.proposal_id, p.influencer_key AS entity_key, 'KOL' AS entity_type, i.name AS entity_name,
                i.name AS influencer_name, p.influencer_key,
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
      if (kolResult.rows[0]) return { data: kolResult.rows[0] };

      const mcnResult = await query<Record<string, unknown>>(
        `SELECT p.proposal_id, p.mcn_key AS entity_key, 'MCN' AS entity_type, m.name AS entity_name,
                m.name AS influencer_name, p.mcn_key AS influencer_key,
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
                  FROM ${schema}.mcn_information_proposal_reviews r
                  WHERE r.proposal_id = p.proposal_id
                ), '[]'::jsonb) AS reviews
           FROM ${schema}.mcn_information_proposals p
           JOIN ${schema}.mcn_owners m ON m.source_id = p.mcn_key
          WHERE p.proposal_id = $1`,
        [request.params.proposalId]
      );
      if (mcnResult.rows[0]) return { data: mcnResult.rows[0] };

      return reply.code(404).send({ error: "NOT_FOUND", message: "Không tìm thấy đề xuất." });
    }
  );

  app.patch<{ Params: IdParams; Body: StatusBody }>(
    "/admin/information-proposals/:proposalId/status",
    { schema: { tags: ["Information proposals"], summary: "Review an information proposal" } },
    async (request, reply) => {
      const admin = await requireAdmin(request);
      await ensureAllProposalTables();
      const nextStatus = request.body?.status;
      const note = clean(request.body?.note);
      if (!statuses.includes(nextStatus as any)) {
        return reply.code(400).send({ error: "VALIDATION_ERROR", message: "Trạng thái không hợp lệ." });
      }
      if (note.length > 1_000) {
        return reply.code(400).send({ error: "VALIDATION_ERROR", message: "Ghi chú tối đa 1.000 ký tự." });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        let isMcn = false;
        let current = await client.query<{ status: string }>(
          `SELECT status FROM ${schema}.kol_information_proposals WHERE proposal_id = $1 FOR UPDATE`,
          [request.params.proposalId]
        );
        if (!current.rows[0]) {
          current = await client.query<{ status: string }>(
            `SELECT status FROM ${schema}.mcn_information_proposals WHERE proposal_id = $1 FOR UPDATE`,
            [request.params.proposalId]
          );
          if (!current.rows[0]) {
            await client.query("ROLLBACK");
            return reply.code(404).send({ error: "NOT_FOUND", message: "Không tìm thấy đề xuất." });
          }
          isMcn = true;
        }

        const tablePrefix = isMcn ? "mcn" : "kol";
        await client.query(
          `UPDATE ${schema}.${tablePrefix}_information_proposals
              SET status = $2,
                  assigned_to = $3,
                  assigned_at = CASE WHEN assigned_at IS NULL THEN now() ELSE assigned_at END,
                  updated_at = now()
            WHERE proposal_id = $1`,
          [request.params.proposalId, nextStatus, admin.sub]
        );
        await client.query(
          `INSERT INTO ${schema}.${tablePrefix}_information_proposal_reviews
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
