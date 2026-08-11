BEGIN;

SET search_path TO kol_gov, public;

ALTER TABLE influencers ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE social_channels ADD COLUMN IF NOT EXISTS posts_count integer;
ALTER TABLE social_channels ADD COLUMN IF NOT EXISTS videos_count integer;

CREATE TABLE IF NOT EXISTS influencer_posts (
    post_key text PRIMARY KEY,
    influencer_key text NOT NULL REFERENCES influencers(influencer_key) ON DELETE CASCADE,
    platform text NOT NULL,
    title text NOT NULL,
    thumbnail_url text,
    source_url text,
    views bigint,
    likes bigint,
    published_date date,
    display_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS mcn_featured_channels (
    featured_channel_key text PRIMARY KEY,
    mcn_source_id text NOT NULL REFERENCES mcn_owners(source_id) ON DELETE CASCADE,
    rank integer NOT NULL,
    name text NOT NULL,
    platform text NOT NULL,
    channel_url text NOT NULL,
    avatar_url text,
    interaction_value bigint,
    growth_rate numeric,
    UNIQUE (mcn_source_id, rank)
);

CREATE INDEX IF NOT EXISTS idx_influencer_posts_influencer ON influencer_posts (influencer_key, display_order);
CREATE INDEX IF NOT EXISTS idx_mcn_featured_channels_mcn ON mcn_featured_channels (mcn_source_id, rank);

UPDATE influencers
SET avatar_url = '/assets/detail/ben-eagle.jpg'
WHERE influencer_key = 'kol_b7ee88dd5df07f7770bd1b25e2d2268c';

UPDATE social_channels SET posts_count = 173
WHERE channel_key = 'chn_a72dfce2a44d2591ba258bd280b0088c';

UPDATE social_channels SET videos_count = 12912
WHERE channel_key = 'chn_b0e057c469f14ad81d8ebfefa34c4b61';

UPDATE mcn_owners SET avatar_url = '/assets/detail/vccorp.webp'
WHERE source_id = '21';

INSERT INTO influencer_posts (
  post_key, influencer_key, platform, title, thumbnail_url, source_url,
  views, likes, published_date, display_order
) VALUES
('post_ben_eagle_1', 'kol_b7ee88dd5df07f7770bd1b25e2d2268c', 'youtube', 'Tổng hợp videos trend, tab thịnh hành [BEN EAGLE] #beneagle #training #kungfu #martialarts #fighting', '/assets/detail/ben-eagle-post-1.jpg', 'https://www.youtube.com/channel/UCbGPgvNunvclTypPtL3sa0w', 555300000, 7900000, '2025-02-11', 1),
('post_ben_eagle_2', 'kol_b7ee88dd5df07f7770bd1b25e2d2268c', 'youtube', 'Chơi khăm thế [BEN EAGLE] #beneagle #training #kungfu #martialarts #fighting', '/assets/detail/ben-eagle-post-2.jpg', 'https://www.youtube.com/channel/UCbGPgvNunvclTypPtL3sa0w', 536100000, 6100000, '2024-11-12', 2),
('post_ben_eagle_3', 'kol_b7ee88dd5df07f7770bd1b25e2d2268c', 'youtube', 'Ben tổng hợp những video viral [BEN EAGLE] #beneagle #kungfu #bestmoments #trending #viralclips', '/assets/detail/ben-eagle-post-3.jpg', 'https://www.youtube.com/channel/UCbGPgvNunvclTypPtL3sa0w', 523200000, 4100000, '2025-07-14', 3)
ON CONFLICT (post_key) DO UPDATE SET
  title = EXCLUDED.title,
  thumbnail_url = EXCLUDED.thumbnail_url,
  source_url = EXCLUDED.source_url,
  views = EXCLUDED.views,
  likes = EXCLUDED.likes,
  published_date = EXCLUDED.published_date,
  display_order = EXCLUDED.display_order;

INSERT INTO mcn_featured_channels (
  featured_channel_key, mcn_source_id, rank, name, platform, channel_url,
  avatar_url, interaction_value, growth_rate
) VALUES
('mfc_21_1', '21', 1, 'CafeBiz', 'tiktok', 'https://www.tiktok.com/@cafebiz.official', '/assets/detail/vccorp-cafebiz-tiktok.jpg', 23300000, 67.8),
('mfc_21_2', '21', 2, 'Kenh14.vn', 'tiktok', 'https://www.tiktok.com/@kenh14official', '/assets/detail/vccorp-kenh14-tiktok.jpg', 15900000, 30.0),
('mfc_21_3', '21', 3, 'Gamek.vn', 'tiktok', 'https://www.tiktok.com/@gamek.vn', '/assets/detail/vccorp-gamek-tiktok.jpg', 3800000, 53.8),
('mfc_21_4', '21', 4, 'CafeF', 'tiktok', 'https://www.tiktok.com/@cafef_official', '/assets/detail/vccorp-cafef-tiktok.jpg', 2100000, 16.9),
('mfc_21_5', '21', 5, 'Kenh14 Food', 'tiktok', 'https://www.tiktok.com/@kenh14food', '/assets/detail/vccorp-kenh14food-tiktok.jpg', 1900000, 22.0),
('mfc_21_6', '21', 6, 'CafeBiz', 'facebook', 'https://www.facebook.com/cafebiz.vn', '/assets/detail/vccorp-cafebiz-facebook.jpg', 1300000, 39.4),
('mfc_21_7', '21', 7, 'Kenh14.vn', 'facebook', 'https://www.facebook.com/K14vn', '/assets/detail/vccorp-kenh14-facebook.jpg', 1200000, 10.1),
('mfc_21_8', '21', 8, 'aFamily.vn', 'facebook', 'https://www.facebook.com/afamilyvccorp', '/assets/detail/vccorp-afamily-facebook.jpg', 925811, 15.9),
('mfc_21_9', '21', 9, 'CafeF', 'facebook', 'https://www.facebook.com/CafeF', '/assets/detail/vccorp-cafef-facebook.png', 880219, 30.0),
('mfc_21_10', '21', 10, 'Kenh14 Special', 'facebook', 'https://www.facebook.com/K14special', '/assets/detail/vccorp-kenh14special-facebook.jpg', 65033, 1.6)
ON CONFLICT (featured_channel_key) DO UPDATE SET
  rank = EXCLUDED.rank,
  name = EXCLUDED.name,
  platform = EXCLUDED.platform,
  channel_url = EXCLUDED.channel_url,
  avatar_url = EXCLUDED.avatar_url,
  interaction_value = EXCLUDED.interaction_value,
  growth_rate = EXCLUDED.growth_rate;

COMMIT;

