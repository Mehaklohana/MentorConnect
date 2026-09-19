CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'mentor', 'admin')),
    bio TEXT NOT NULL DEFAULT '',
    photo TEXT,
    university TEXT,
    major TEXT,
    year TEXT,
    company TEXT,
    position TEXT,
    experience TEXT,
    linkedin TEXT,
    github TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_skills (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    skill TEXT NOT NULL,
    PRIMARY KEY (user_id, skill)
);

CREATE TABLE IF NOT EXISTS user_interests (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    interest TEXT NOT NULL,
    PRIMARY KEY (user_id, interest)
);

CREATE TABLE IF NOT EXISTS connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'connected', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (sender_id, receiver_id)
);

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (length(trim(content)) > 0),
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mentor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_date DATE NOT NULL,
    session_time TEXT NOT NULL,
    call_type TEXT NOT NULL DEFAULT 'video' CHECK (call_type IN ('audio', 'video')),
    topic TEXT NOT NULL DEFAULT 'Mentorship session',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'rejected')),
    reviewed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS call_type TEXT NOT NULL DEFAULT 'video';

CREATE TABLE IF NOT EXISTS availability (
    mentor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    weekday TEXT NOT NULL,
    slot TEXT NOT NULL,
    PRIMARY KEY (mentor_id, weekday, slot)
);

CREATE TABLE IF NOT EXISTS career_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    current_field TEXT NOT NULL DEFAULT '',
    target_field TEXT NOT NULL DEFAULT '',
    skill_progress JSONB NOT NULL DEFAULT '{}'::jsonb,
    milestones JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS communities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL DEFAULT '💬',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_members (
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (community_id, user_id)
);

CREATE TABLE IF NOT EXISTS posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
    author_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'discussion',
    content TEXT NOT NULL,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    author_id UUID REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    plan TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount >= 0),
    status TEXT NOT NULL DEFAULT 'paid',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages (sender_id, receiver_id, created_at);
CREATE INDEX IF NOT EXISTS sessions_participants_idx ON sessions (student_id, mentor_id, session_date);
CREATE INDEX IF NOT EXISTS posts_community_idx ON posts (community_id, created_at DESC);

INSERT INTO communities (name, description, icon) VALUES
    ('UI/UX Design', 'Discuss design principles, tools, and best practices', '🎨'),
    ('Web Development', 'Frontend, backend, and full-stack development', '🌐'),
    ('Artificial Intelligence', 'Machine learning, deep learning, and AI applications', '🤖'),
    ('Product Management', 'Product strategy, roadmaps, and user research', '📋')
ON CONFLICT (name) DO NOTHING;
