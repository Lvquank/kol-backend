import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { schema } from "../config.js";
import { pool, query } from "../db.js";

type RegistrationBody = {
  applicantType: "individual" | "organization";
  profile: {
    name: string; nationality: string; address: string; phone?: string; email: string; zalo: string;
    avatarFileName?: string; activityCategories: string[]; livestreamCertVerified?: boolean;
    businessLicenseNo?: string; licenseIssuedAt?: string; licenseIssuedBy?: string; legalRepresentative?: string;
    channelQuantity?: string; channelManager?: string; channelManagerPhone?: string; channelDetailFileName?: string; whiteListRequestFileName?: string;
  };
  channels: Array<{ platform: string; name: string; url: string }>;
  declaration: { accuracyConfirmed: boolean; termsConfirmed: boolean };
};

type ChannelLinkCheckBody = { urls: string[] };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isValidChannelUrl(value: unknown): boolean {
  try {
    const url = new URL(text(value));
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const isSupported = ["youtube.com", "youtu.be", "tiktok.com", "instagram.com", "facebook.com", "fb.com", "twitter.com", "x.com"].some((domain) => host === domain || host.endsWith(`.${domain}`));
    return ["http:", "https:"].includes(url.protocol) && isSupported && url.pathname.length > 1;
  } catch { return false; }
}

function isVietnamesePhone(value: unknown): boolean { return /^0\d{9}$/.test(text(value)); }
function isValidEmail(value: unknown): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text(value)); }

function validate(body: RegistrationBody): string | null {
  const profile = body?.profile;
  if (!body || !["individual", "organization"].includes(body.applicantType)) return "Loại hồ sơ không hợp lệ.";
  if (!profile || !text(profile.name) || !text(profile.nationality) || !text(profile.address) || !text(profile.email) || !text(profile.zalo)) return "Vui lòng điền đầy đủ thông tin bắt buộc.";
  if (!isValidEmail(profile.email)) return "Email không đúng định dạng.";
  if (text(profile.phone) && !isVietnamesePhone(profile.phone)) return "Số điện thoại phải có 10 số và bắt đầu bằng 0.";
  if (!isVietnamesePhone(profile.zalo)) return "Số Zalo phải có 10 số và bắt đầu bằng 0.";
  if (body.applicantType === "individual" && (!Array.isArray(profile.activityCategories) || profile.activityCategories.length === 0)) return "Vui lòng chọn ít nhất một danh mục hoạt động.";
  if (body.applicantType === "individual" && (!Array.isArray(body.channels) || body.channels.length === 0 || body.channels.some((channel) => !text(channel.platform) || !text(channel.name) || !isValidChannelUrl(channel.url)))) return "Vui lòng khai báo ít nhất một kênh có URL kênh hợp lệ.";
  if (!body.declaration?.accuracyConfirmed || !body.declaration?.termsConfirmed) return "Bạn cần xác nhận cam kết trước khi nộp hồ sơ.";
  if (text(profile.channelManagerPhone) && !isVietnamesePhone(profile.channelManagerPhone)) return "Số điện thoại nhân sự phải có 10 số và bắt đầu bằng 0.";
  if (body.applicantType === "organization" && (!text(profile.businessLicenseNo) || !text(profile.licenseIssuedAt) || !text(profile.licenseIssuedBy) || !text(profile.legalRepresentative) || !text(profile.channelManager) || !isVietnamesePhone(profile.channelManagerPhone) || !Number.isInteger(Number(text(profile.channelQuantity))) || Number(text(profile.channelQuantity)) < 1 || !text(profile.channelDetailFileName) || !text(profile.whiteListRequestFileName))) return "Vui lòng điền đầy đủ thông tin pháp lý, thông tin quản lý kênh và các tài liệu đính kèm.";
  return null;
}

export const registrationRoutes: FastifyPluginAsync = async (app) => {
  app.get("/registration/categories", { schema: { tags: ["Registrations"], summary: "List registration activity categories" } }, async () => {
    const result = await query<{ category_key: string; name: string }>(`SELECT category_key, name FROM ${schema}.activity_categories WHERE is_active = true ORDER BY sort_order, name`);
    return { data: result.rows };
  });

  app.post<{ Body: ChannelLinkCheckBody }>("/registration/channel-links/check", { schema: { tags: ["Registrations"], summary: "Check whether channel links already exist" } }, async (request, reply) => {
    const urls = Array.isArray(request.body?.urls)
      ? [...new Set(request.body.urls.map((value) => text(value).toLowerCase().replace(/\/+$/, "")).filter(isValidChannelUrl))].slice(0, 100)
      : [];
    if (urls.length === 0) return reply.code(400).send({ error: "VALIDATION_ERROR", message: "Cần cung cấp ít nhất một link hợp lệ." });
    const result = await query<{ channel_url: string }>(`
      SELECT DISTINCT channel_url FROM (
        SELECT channel_url FROM ${schema}.social_channels
        UNION ALL
        SELECT channel_url FROM ${schema}.registration_channels
      ) AS channels
      WHERE regexp_replace(lower(trim(channel_url)), '/+$', '') = ANY($1::text[])
    `, [urls]);
    return { data: { duplicateUrls: result.rows.map((row) => text(row.channel_url).toLowerCase().replace(/\/+$/, "")) } };
  });

  app.post<{ Body: RegistrationBody }>("/registration/applications", { schema: { tags: ["Registrations"], summary: "Submit a KOL or MCN registration" } }, async (request, reply) => {
    const error = validate(request.body);
    if (error) return reply.code(400).send({ error: "VALIDATION_ERROR", message: error });
    const body = request.body;
    const applicationId = randomUUID();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`INSERT INTO ${schema}.registration_applications (application_id, applicant_type, display_name, nationality, address, phone, email, violation_alert_zalo, avatar_file_name, submitted_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())`, [applicationId, body.applicantType, text(body.profile.name), text(body.profile.nationality), text(body.profile.address), text(body.profile.phone) || null, text(body.profile.email).toLowerCase(), text(body.profile.zalo), text(body.profile.avatarFileName) || null]);
      if (body.applicantType === "individual") await client.query(`INSERT INTO ${schema}.registration_individual_details (application_id, livestream_cert_verified) VALUES ($1,$2)`, [applicationId, Boolean(body.profile.livestreamCertVerified)]);
      else await client.query(`INSERT INTO ${schema}.registration_organization_details (application_id, business_license_no, license_issued_at, license_issued_by, legal_representative, declared_channel_count, content_manager_name, content_manager_phone, channel_detail_file_name, white_list_request_file_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [applicationId, text(body.profile.businessLicenseNo), text(body.profile.licenseIssuedAt), text(body.profile.licenseIssuedBy), text(body.profile.legalRepresentative), Number.parseInt(text(body.profile.channelQuantity), 10) || null, text(body.profile.channelManager) || null, text(body.profile.channelManagerPhone) || null, text(body.profile.channelDetailFileName), text(body.profile.whiteListRequestFileName)]);
      for (const categoryKey of [...new Set(body.profile.activityCategories ?? [])]) await client.query(`INSERT INTO ${schema}.registration_application_categories (application_id, category_key) VALUES ($1,$2)`, [applicationId, categoryKey]);
      for (const channel of body.channels) await client.query(`INSERT INTO ${schema}.registration_channels (channel_id, application_id, platform, channel_name, channel_url) VALUES ($1,$2,$3,$4,$5)`, [randomUUID(), applicationId, text(channel.platform), text(channel.name), text(channel.url)]);
      await client.query(`INSERT INTO ${schema}.registration_declarations (application_id, accuracy_confirmed, terms_confirmed) VALUES ($1,true,true)`, [applicationId]);
      await client.query("COMMIT");
      return reply.code(201).send({ data: { applicationId, status: "submitted", message: "Hồ sơ đã được tiếp nhận để xem xét." } });
    } catch (cause) {
      await client.query("ROLLBACK");
      throw cause;
    } finally { client.release(); }
  });
};
