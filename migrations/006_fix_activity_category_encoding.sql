-- Repair category names that were imported through a non-UTF-8 console.
UPDATE kol_gov.activity_categories
SET name = CASE category_key
  WHEN 'real_estate' THEN 'Bất động sản'
  WHEN 'technology' THEN 'Công nghệ'
  WHEN 'travel' THEN 'Du lịch'
  WHEN 'gaming' THEN 'Game & Thể thao điện tử'
  WHEN 'education' THEN 'Giáo dục'
  WHEN 'entertainment' THEN 'Giải trí'
  WHEN 'business_marketing' THEN 'Kinh doanh, Truyền thông & Marketing'
  WHEN 'economy_finance_investment' THEN 'Kinh tế, Tài chính & Đầu tư'
  WHEN 'beauty_fashion' THEN 'Làm đẹp & Thời trang'
  WHEN 'film_animation' THEN 'Phim & Hoạt hình'
  WHEN 'feng_shui' THEN 'Phong thủy'
  WHEN 'health' THEN 'Sức khỏe'
  WHEN 'sports' THEN 'Thể thao'
  WHEN 'news_current_affairs' THEN 'Tin tức & Thời sự'
  WHEN 'automotive' THEN 'Xe'
  WHEN 'music' THEN 'Âm nhạc'
  WHEN 'lifestyle_family' THEN 'Đời sống & Gia đình'
  WHEN 'food_beverage' THEN 'Ẩm thực & Đồ uống'
  ELSE name
END
WHERE category_key IN (
  'real_estate', 'technology', 'travel', 'gaming', 'education', 'entertainment',
  'business_marketing', 'economy_finance_investment', 'beauty_fashion',
  'film_animation', 'feng_shui', 'health', 'sports', 'news_current_affairs',
  'automotive', 'music', 'lifestyle_family', 'food_beverage'
);
