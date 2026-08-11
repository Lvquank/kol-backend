import { buildApp } from "../dist/app.js";

const app = await buildApp();
const results = [];

async function check(url) {
  const response = await app.inject({ method: "GET", url });
  let body;
  try {
    body = response.json();
  } catch {
    body = response.body;
  }
  results.push({ url, status: response.statusCode });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`${url} returned ${response.statusCode}: ${JSON.stringify(body)}`);
  }
  return body;
}

try {
  await check("/health");
  await check("/ready");
  await check("/api/v1/");
  await check("/api/v1/stats");

  const influencers = await check("/api/v1/influencers?limit=2&sort=followers&order=desc");
  if (influencers.data[0]) {
    await check(`/api/v1/influencers/${encodeURIComponent(influencers.data[0].influencer_key)}`);
  }
  const tomSource = await check("/api/v1/influencers/source/1869");
  const tomDetail = await check(`/api/v1/influencers/${encodeURIComponent(tomSource.influencer.influencer_key)}`);
  if (!Array.isArray(tomDetail.recent_posts) || tomDetail.recent_posts.length !== 9) {
    throw new Error("KOL 1869 did not return the 9 database-backed public posts");
  }
  if (tomDetail.recent_posts.some((post) => post.platform !== "youtube" || !/^https:\/\/(?:www\.)?youtube\.com\//.test(post.source_url || ""))) {
    throw new Error("KOL 1869 returned a recent post that is not a YouTube URL");
  }

  const channels = await check("/api/v1/channels?limit=2&sort=followers&order=desc");
  if (channels.data[0]) {
    await check(`/api/v1/channels/${encodeURIComponent(channels.data[0].channel_entity_key)}`);
  }

  const mcns = await check("/api/v1/mcns?limit=2&sort=channels&order=desc");
  if (mcns.data[0]) {
    await check(`/api/v1/mcns/${encodeURIComponent(mcns.data[0].source_id)}`);
  }
  const vccorp = await check("/api/v1/mcns/21");
  if (!Array.isArray(vccorp.featured_channels) || vccorp.featured_channels.length !== 10) {
    throw new Error("MCN detail did not return the expected database-backed featured channels");
  }
  const metub = await check("/api/v1/mcns/22");
  if (!Array.isArray(metub.featured_influencers) || metub.featured_influencers.length !== 10) {
    throw new Error("Metub detail did not return 10 database-backed featured influencers");
  }
  if (!Array.isArray(metub.featured_channels) || metub.featured_channels.length !== 10) {
    throw new Error("Metub detail did not return 10 database-backed featured channels");
  }
  for (const metric of [metub.total_interactions, metub.total_views, metub.total_likes]) {
    if (Number(metric) < 0) throw new Error("Metub detail returned a negative highlight metric");
  }

  await check("/api/v1/growth/periods");
  const growth = await check("/api/v1/growth/rankings?entityType=influencer&periodDays=7&limit=2");
  if (growth.data[0]) {
    await check(`/api/v1/growth/entities/${encodeURIComponent(growth.data[0].growth_entity_key)}`);
  }

  await check("/api/v1/bsi/periods");
  const bsi = await check("/api/v1/bsi/rankings?tab=influencer&limit=2");
  await check("/api/v1/bsi/subjects?limit=2");
  if (bsi.data[0]) {
    await check(`/api/v1/bsi/subjects/${encodeURIComponent(bsi.data[0].subject_key)}`);
  }

  await check("/api/v1/news/categories");
  await check("/api/v1/news/tags");
  const news = await check("/api/v1/news?limit=2");
  if (news.data[0]) {
    await check(`/api/v1/news/${encodeURIComponent(news.data[0].slug)}`);
  }

  await check("/docs/json");
  console.table(results);
} finally {
  await app.close();
}
