-- ============================================================
-- CloudBase PostgreSQL 索引脚本（第 3/4 部分）
-- 项目：AI 背诵卡片
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_topics_user_id ON topics(user_id);
CREATE INDEX IF NOT EXISTS idx_chapters_user_id ON chapters(user_id);
CREATE INDEX IF NOT EXISTS idx_units_user_id ON units(user_id);
CREATE INDEX IF NOT EXISTS idx_cards_user_id ON cards(user_id);
CREATE INDEX IF NOT EXISTS idx_cards_unit_id ON cards(unit_id);
CREATE INDEX IF NOT EXISTS idx_card_status_user_id ON card_status(user_id);
CREATE INDEX IF NOT EXISTS idx_card_status_card_id ON card_status(card_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_wrong_answers_user_id ON wrong_answers(user_id);
CREATE INDEX IF NOT EXISTS idx_test_questions_user_id ON test_questions(user_id);
CREATE INDEX IF NOT EXISTS idx_test_records_user_id ON test_records(user_id);
CREATE INDEX IF NOT EXISTS idx_test_sessions_user_id ON test_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_review_history_user_id ON review_history(user_id);
CREATE INDEX IF NOT EXISTS idx_study_plans_user_id ON study_plans(user_id);
