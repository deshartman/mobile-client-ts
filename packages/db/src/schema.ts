export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
    user_guid         TEXT PRIMARY KEY,
    name              TEXT NOT NULL,
    phone             TEXT UNIQUE,
    email             TEXT UNIQUE,
    twilio_number     TEXT UNIQUE,
    twilio_number_sid TEXT,
    active            INTEGER NOT NULL DEFAULT 1,
    created           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS otp_verifications (
    phone        TEXT PRIMARY KEY,
    code_hash    TEXT NOT NULL,
    attempts     INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    expires_at   TEXT NOT NULL,
    verified     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS contacts (
    contact_guid  TEXT PRIMARY KEY,
    user_guid     TEXT NOT NULL REFERENCES users(user_guid) ON DELETE CASCADE,
    first_name    TEXT,
    last_name     TEXT,
    company       TEXT,
    photo_data    TEXT
);
CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_guid);

CREATE TABLE IF NOT EXISTS contact_identities (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_guid  TEXT NOT NULL REFERENCES contacts(contact_guid) ON DELETE CASCADE,
    type          TEXT NOT NULL,
    value         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_identities_contact ON contact_identities(contact_guid);

CREATE TABLE IF NOT EXISTS activities (
    id             TEXT PRIMARY KEY,
    user_guid      TEXT NOT NULL REFERENCES users(user_guid) ON DELETE CASCADE,
    type           TEXT NOT NULL,
    datetime       TEXT NOT NULL,
    duration       INTEGER NOT NULL DEFAULT 0,
    identity_value TEXT,
    contact_guid   TEXT REFERENCES contacts(contact_guid) ON DELETE SET NULL,
    call_sid       TEXT
);
CREATE INDEX IF NOT EXISTS idx_activities_user_dt ON activities(user_guid, datetime DESC);
CREATE INDEX IF NOT EXISTS idx_activities_call_sid ON activities(call_sid);

CREATE TABLE IF NOT EXISTS transcriptions (
    correlation_sid  TEXT NOT NULL,
    sequence_id      INTEGER NOT NULL,
    track            TEXT,
    transcript       TEXT NOT NULL,
    confidence       REAL,
    datetime         TEXT NOT NULL,
    source           TEXT NOT NULL DEFAULT 'voice',
    participant_sid  TEXT,
    PRIMARY KEY (correlation_sid, sequence_id)
);
CREATE INDEX IF NOT EXISTS idx_transcriptions_correlation ON transcriptions(correlation_sid);

CREATE TABLE IF NOT EXISTS threads (
    thread_id       TEXT PRIMARY KEY,
    user_guid       TEXT NOT NULL REFERENCES users(user_guid) ON DELETE CASCADE,
    contact_guid    TEXT REFERENCES contacts(contact_guid) ON DELETE SET NULL,
    remote_address  TEXT NOT NULL,
    proxy_address   TEXT NOT NULL,
    activity_id     TEXT REFERENCES activities(id) ON DELETE SET NULL,
    created         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_threads_user_pair
    ON threads(user_guid, proxy_address, remote_address);

CREATE TABLE IF NOT EXISTS video_invites (
    invite_token     TEXT PRIMARY KEY,
    user_guid        TEXT NOT NULL REFERENCES users(user_guid) ON DELETE CASCADE,
    contact_guid     TEXT REFERENCES contacts(contact_guid) ON DELETE SET NULL,
    remote_address   TEXT NOT NULL,
    room_sid         TEXT NOT NULL,
    room_name        TEXT NOT NULL,
    created_at       TEXT NOT NULL,
    expires_at       TEXT NOT NULL,
    consumed_at      TEXT,
    ended_at         TEXT,
    guest_joined_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_video_invites_user ON video_invites(user_guid);
CREATE INDEX IF NOT EXISTS idx_video_invites_room ON video_invites(room_sid);

CREATE TABLE IF NOT EXISTS messages (
    message_sid  TEXT PRIMARY KEY,
    thread_id    TEXT NOT NULL REFERENCES threads(thread_id) ON DELETE CASCADE,
    direction    TEXT NOT NULL,
    author       TEXT,
    body         TEXT,
    datetime     TEXT NOT NULL,
    idx          INTEGER,
    status       TEXT,
    read_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_thread_dt
    ON messages(thread_id, datetime);
CREATE INDEX IF NOT EXISTS idx_messages_unread
    ON messages(thread_id) WHERE direction = 'inbound' AND read_at IS NULL;
`;
