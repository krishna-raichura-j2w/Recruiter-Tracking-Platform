CREATE TABLE IF NOT EXISTS user_leaves (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    leave_date  DATE    NOT NULL,
    marked_by   INTEGER REFERENCES users(id),
    note        TEXT,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, leave_date)
);

CREATE INDEX IF NOT EXISTS idx_user_leaves_date    ON user_leaves(leave_date);
CREATE INDEX IF NOT EXISTS idx_user_leaves_user_id ON user_leaves(user_id);
