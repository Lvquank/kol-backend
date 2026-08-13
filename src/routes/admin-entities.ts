import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { schema } from "../config.js";
import { query } from "../db.js";
import { avatarMimeTypes, isCloudinaryConfigured, isManagedCloudinaryUrl, uploadAvatar } from "../lib/cloudinary.js";
import { requireAdmin } from "./auth.js";

type InfluencerParams = { key: string };
type McnParams = { sourceId: string };
type InfluencerBody = {
  name?: string;
  nickName?: string;
  gender?: string;
  identityVerified?: boolean;
  avatarUrl?: string;
  sourceUrl?: string;
};
type McnBody = {
  name?: string;
  subtitle?: string;
  avatarUrl?: string;
  platforms?: string[];
  totalChannels?: number;
  totalKols?: number;
  identityVerified?: boolean;
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

function validHttpUrl(value: string) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validateInfluencer(body: InfluencerBody) {
  const name = text(body.name);
  const nickName = text(body.nickName);
  const gender = text(body.gender);
  const avatarUrl = text(body.avatarUrl);
  const avatarProvided = body.avatarUrl !== undefined;
  const sourceUrl = text(body.sourceUrl);
  if (name.length < 2 || name.length > 200) return { error: "Tên KOL phải có từ 2 đến 200 ký tự." };
  if (nickName.length > 200) return { error: "Biệt danh tối đa 200 ký tự." };
  if (gender.length > 50) return { error: "Giới tính tối đa 50 ký tự." };
  if (!sourceUrl || !validHttpUrl(sourceUrl)) return { error: "Đường dẫn nguồn không hợp lệ." };
  if (avatarProvided && !isManagedCloudinaryUrl(avatarUrl)) return { error: "Ảnh đại diện phải được tải lên qua hệ thống." };
  if (body.identityVerified !== undefined && typeof body.identityVerified !== "boolean") return { error: "Trạng thái xác minh không hợp lệ." };
  return { name, nickName: nickName || null, gender: gender || null, avatarProvided, avatarUrl: avatarUrl || null, sourceUrl, identityVerified: body.identityVerified };
}

function validateMcn(body: McnBody) {
  const name = text(body.name);
  const subtitle = text(body.subtitle);
  const avatarUrl = text(body.avatarUrl);
  const avatarProvided = body.avatarUrl !== undefined;
  const platforms = Array.isArray(body.platforms)
    ? [...new Set(body.platforms.map(text).filter(Boolean))]
    : [];
  const totalChannels = Number(body.totalChannels);
  const totalKols = Number(body.totalKols);
  if (name.length < 2 || name.length > 200) return { error: "Tên MCN phải có từ 2 đến 200 ký tự." };
  if (subtitle.length > 300) return { error: "Mô tả ngắn tối đa 300 ký tự." };
  if (avatarProvided && !isManagedCloudinaryUrl(avatarUrl)) return { error: "Ảnh đại diện phải được tải lên qua hệ thống." };
  if (platforms.length > 20 || platforms.some((item) => item.length > 50)) return { error: "Danh sách nền tảng không hợp lệ." };
  if (!Number.isInteger(totalChannels) || totalChannels < 0 || totalChannels > 1_000_000) return { error: "Tổng số kênh không hợp lệ." };
  if (!Number.isInteger(totalKols) || totalKols < 0 || totalKols > 1_000_000) return { error: "Tổng số KOL không hợp lệ." };
  if (body.identityVerified !== undefined && typeof body.identityVerified !== "boolean") return { error: "Trạng thái xác minh không hợp lệ." };
  return { name, subtitle: subtitle || null, avatarProvided, avatarUrl: avatarUrl || null, platforms, totalChannels, totalKols, identityVerified: body.identityVerified };
}

export const adminEntityRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/admin/avatar",
    { schema: { tags: ["Administration"], summary: "Upload an admin-managed avatar to Cloudinary" } },
    async (request, reply) => {
      await requireAdmin(request);
      if (!isCloudinaryConfigured()) {
        return reply.code(503).send({ error: "CLOUDINARY_NOT_CONFIGURED", message: "Dịch vụ tải ảnh chưa được cấu hình." });
      }
      if (!request.isMultipart()) {
        return reply.code(415).send({ error: "UNSUPPORTED_MEDIA_TYPE", message: "Ảnh phải được gửi bằng multipart/form-data." });
      }

      try {
        const part = await request.file({ limits: { files: 1, fileSize: 20 * 1024 * 1024, parts: 1 } });
        if (!part) return reply.code(400).send({ error: "IMAGE_REQUIRED", message: "Vui lòng chọn một ảnh để tải lên." });
        if (!avatarMimeTypes.has(part.mimetype)) {
          part.file.resume();
          return reply.code(415).send({ error: "INVALID_IMAGE_TYPE", message: "Chỉ chấp nhận ảnh JPG, PNG, WebP, GIF hoặc AVIF." });
        }

        const uploaded = await uploadAvatar(await part.toBuffer(), `admin-${randomUUID()}`);
        return reply.code(201).send({ data: uploaded });
      } catch (cause) {
        if (cause instanceof app.multipartErrors.RequestFileTooLargeError) {
          return reply.code(413).send({ error: "IMAGE_TOO_LARGE", message: "Dung lượng ảnh không được vượt quá 20MB." });
        }
        request.log.error({ err: cause }, "Cloudinary admin avatar upload failed");
        return reply.code(502).send({ error: "IMAGE_UPLOAD_FAILED", message: "Không thể tải ảnh lên vào lúc này. Vui lòng thử lại." });
      }
    }
  );

  app.patch<{ Params: InfluencerParams; Body: InfluencerBody }>(
    "/admin/influencers/:key",
    { schema: { tags: ["Administration"], summary: "Update an influencer profile" } },
    async (request, reply) => {
      const admin = await requireAdmin(request);
      const validated = validateInfluencer(request.body ?? {});
      if ("error" in validated) return reply.code(400).send({ error: "VALIDATION_ERROR", message: validated.error });
      const result = await query<{ influencer_key: string; identity_verified: boolean }>(
        `UPDATE ${schema}.influencers
            SET name = $2, nick_name = $3, gender = $4,
                identity_verified = CASE WHEN $5::boolean IS NOT NULL THEN $5 ELSE identity_verified END,
                avatar_url = CASE WHEN $6::boolean THEN $7 ELSE avatar_url END,
                source_url = $8, updated_at = now(), updated_by = $9
          WHERE influencer_key = $1
          RETURNING influencer_key, identity_verified`,
        [request.params.key, validated.name, validated.nickName, validated.gender, validated.identityVerified ?? null, validated.avatarProvided, validated.avatarUrl, validated.sourceUrl, admin.sub]
      );
      if (!result.rows[0]) return reply.code(404).send({ error: "NOT_FOUND", message: "Không tìm thấy KOL." });
      return { data: { influencerKey: result.rows[0].influencer_key, identityVerified: result.rows[0].identity_verified, updatedAt: new Date().toISOString() } };
    }
  );

  app.post<{ Params: InfluencerParams }>(
    "/admin/influencers/:key/toggle-visibility",
    { schema: { tags: ["Administration"], summary: "Toggle influencer visibility (hide/show on frontend)" } },
    async (request, reply) => {
      const admin = await requireAdmin(request);
      const result = await query<{ influencer_key: string; identity_verified: boolean }>(
        `UPDATE ${schema}.influencers
            SET identity_verified = NOT COALESCE(identity_verified, false),
                updated_at = now(), updated_by = $2
          WHERE influencer_key = $1
          RETURNING influencer_key, identity_verified`,
        [request.params.key, admin.sub]
      );
      if (!result.rows[0]) return reply.code(404).send({ error: "NOT_FOUND", message: "Không tìm thấy KOL." });
      return { data: { influencerKey: result.rows[0].influencer_key, identityVerified: result.rows[0].identity_verified, updatedAt: new Date().toISOString() } };
    }
  );

  app.delete<{ Params: InfluencerParams }>(
    "/admin/influencers/:key",
    { schema: { tags: ["Administration"], summary: "Delete an influencer and its dependent data" } },
    async (request, reply) => {
      await requireAdmin(request, ["super_admin"]);
      const result = await query<{ influencer_key: string }>(
        `DELETE FROM ${schema}.influencers
          WHERE influencer_key = $1
          RETURNING influencer_key`,
        [request.params.key]
      );
      if (!result.rows[0]) return reply.code(404).send({ error: "NOT_FOUND", message: "Không tìm thấy KOL." });
      return reply.code(204).send();
    }
  );

  app.patch<{ Params: McnParams; Body: McnBody }>(
    "/admin/mcns/:sourceId",
    { schema: { tags: ["Administration"], summary: "Update an MCN profile" } },
    async (request, reply) => {
      const admin = await requireAdmin(request);
      const validated = validateMcn(request.body ?? {});
      if ("error" in validated) return reply.code(400).send({ error: "VALIDATION_ERROR", message: validated.error });
      const result = await query<{ source_id: string; identity_verified: boolean }>(
        `UPDATE ${schema}.mcn_owners
            SET name = $2, subtitle = $3,
                avatar_url = CASE WHEN $4::boolean THEN $5 ELSE avatar_url END,
                platforms = $6::jsonb, total_channels = $7, total_kols = $8,
                identity_verified = CASE WHEN $10::boolean IS NOT NULL THEN $10 ELSE COALESCE(identity_verified, false) END,
                updated_at = now(), updated_by = $9
          WHERE source_id = $1
          RETURNING source_id, identity_verified`,
        [request.params.sourceId, validated.name, validated.subtitle, validated.avatarProvided, validated.avatarUrl, JSON.stringify(validated.platforms), validated.totalChannels, validated.totalKols, admin.sub, validated.identityVerified ?? null]
      );
      if (!result.rows[0]) return reply.code(404).send({ error: "NOT_FOUND", message: "Không tìm thấy MCN." });
      return { data: { sourceId: result.rows[0].source_id, identityVerified: result.rows[0].identity_verified, updatedAt: new Date().toISOString() } };
    }
  );

  app.post<{ Params: McnParams }>(
    "/admin/mcns/:sourceId/toggle-visibility",
    { schema: { tags: ["Administration"], summary: "Toggle MCN visibility (hide/show on frontend)" } },
    async (request, reply) => {
      const admin = await requireAdmin(request);
      const result = await query<{ source_id: string; identity_verified: boolean }>(
        `UPDATE ${schema}.mcn_owners
            SET identity_verified = NOT COALESCE(identity_verified, false),
                updated_at = now(), updated_by = $2
          WHERE source_id = $1
          RETURNING source_id, identity_verified`,
        [request.params.sourceId, admin.sub]
      );
      if (!result.rows[0]) return reply.code(404).send({ error: "NOT_FOUND", message: "Không tìm thấy MCN." });
      return { data: { sourceId: result.rows[0].source_id, identityVerified: result.rows[0].identity_verified, updatedAt: new Date().toISOString() } };
    }
  );

  app.delete<{ Params: McnParams }>(
    "/admin/mcns/:sourceId",
    { schema: { tags: ["Administration"], summary: "Delete an MCN and its dependent data" } },
    async (request, reply) => {
      await requireAdmin(request, ["super_admin"]);
      const result = await query<{ source_id: string }>(
        `DELETE FROM ${schema}.mcn_owners
          WHERE source_id = $1
          RETURNING source_id`,
        [request.params.sourceId]
      );
      if (!result.rows[0]) return reply.code(404).send({ error: "NOT_FOUND", message: "Không tìm thấy MCN." });
      return reply.code(204).send();
    }
  );
};
