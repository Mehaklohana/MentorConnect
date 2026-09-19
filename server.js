require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const app = express();
const port = Number(process.env.PORT || 3000);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            imgSrc: ["'self'", 'data:', 'blob:'],
            connectSrc: ["'self'"]
        }
    }
}));
app.use(cors({ origin: process.env.CLIENT_ORIGIN || true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname)));

function asyncRoute(handler) {
    return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function issueToken(user) {
    return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function publicUser(row) {
    return {
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        role: row.role,
        bio: row.bio,
        photo: row.photo,
        university: row.university,
        major: row.major,
        year: row.year,
        company: row.company,
        position: row.position,
        experience: row.experience,
        linkedin: row.linkedin,
        github: row.github,
        createdAt: row.created_at
    };
}

function publicSession(row) {
    return {
        id: row.id,
        studentId: row.student_id,
        mentorId: row.mentor_id,
        date: row.session_date,
        time: row.session_time,
        callType: row.call_type,
        topic: row.topic,
        status: row.status,
        reviewed: row.reviewed,
        createdAt: row.created_at
    };
}

function publicCommunity(row) {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        icon: row.icon,
        members: row.members,
        createdAt: row.created_at
    };
}

function publicPost(row) {
    return {
        id: row.id,
        communityId: row.community_id,
        authorId: row.author_id,
        title: row.title,
        category: row.category,
        content: row.content,
        tags: row.tags,
        authorFirstName: row.authorFirstName,
        authorLastName: row.authorLastName,
        createdAt: row.created_at
    };
}

function publicComment(row) {
    return {
        id: row.id,
        postId: row.post_id,
        authorId: row.author_id,
        content: row.content,
        authorFirstName: row.authorFirstName,
        authorLastName: row.authorLastName,
        createdAt: row.created_at
    };
}

function publicBilling(row) {
    return {
        id: row.id,
        userId: row.user_id,
        plan: row.plan,
        amount: row.amount,
        status: row.status,
        createdAt: row.created_at
    };
}

function authRequired(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    try {
        req.auth = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}

function roleRequired(...roles) {
    return (req, res, next) => roles.includes(req.auth.role)
        ? next()
        : res.status(403).json({ error: 'Insufficient permissions' });
}

async function getUser(id) {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0] || null;
}

app.get('/api/health', asyncRoute(async (req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'mentorconnect-api' });
}));

// ---- NEW REGISTRATION FEED (file-backed; works without the database) ----
// Lets the admin portal know when someone creates an account, even when the
// signup happens on a different device (e.g. a visitor via an ngrok tunnel).
const REGISTRATIONS_FILE = path.join(__dirname, 'data', 'registrations.json');

function readRegistrations() {
    try { return JSON.parse(fs.readFileSync(REGISTRATIONS_FILE, 'utf8')); }
    catch (error) { return []; }
}

function writeRegistrations(list) {
    fs.mkdirSync(path.dirname(REGISTRATIONS_FILE), { recursive: true });
    fs.writeFileSync(REGISTRATIONS_FILE, JSON.stringify(list, null, 2));
}

app.get('/api/registrations', (req, res) => {
    res.json({ registrations: readRegistrations() });
});

app.post('/api/registrations', (req, res) => {
    const firstName = String(req.body.firstName || '').trim();
    const lastName = String(req.body.lastName || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    if (firstName.length < 2 || lastName.length < 2 || !/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ error: 'Valid names and email are required' });
    }
    const list = readRegistrations();
    if (list.some(r => r.email === email)) return res.json({ ok: true, duplicate: true });
    list.push({
        id: String(req.body.id || ('reg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8))),
        firstName,
        lastName,
        email,
        role: ['student', 'mentor'].includes(req.body.role) ? req.body.role : 'student',
        passwordHash: String(req.body.passwordHash || ''),
        createdAt: String(req.body.createdAt || new Date().toISOString()),
        seen: false
    });
    writeRegistrations(list.slice(-500));
    res.status(201).json({ ok: true, count: list.length });
});

app.post('/api/registrations/seen', (req, res) => {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String) : [];
    const list = readRegistrations();
    let changed = false;
    list.forEach(r => { if (ids.includes(r.id) && !r.seen) { r.seen = true; changed = true; } });
    if (changed) writeRegistrations(list);
    res.json({ ok: true, updated: ids.length });
});

app.post('/api/auth/signup', asyncRoute(async (req, res) => {
    const firstName = String(req.body.firstName || '').trim();
    const lastName = String(req.body.lastName || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const role = ['student', 'mentor'].includes(req.body.role) ? req.body.role : 'student';
    if (firstName.length < 2 || lastName.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
        return res.status(400).json({ error: 'Valid names, email, and an 8-character password are required' });
    }
    try {
        const hash = await bcrypt.hash(password, 12);
        const result = await pool.query(
            'INSERT INTO users (first_name, last_name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [firstName, lastName, email, hash, role]
        );
        res.status(201).json({ user: publicUser(result.rows[0]), token: issueToken(result.rows[0]) });
    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'An account with this email already exists' });
        throw error;
    }
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = (await pool.query('SELECT * FROM users WHERE email = $1', [email])).rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Invalid email or password' });
    res.json({ user: publicUser(user), token: issueToken(user) });
}));

app.get('/api/auth/me', authRequired, asyncRoute(async (req, res) => {
    const user = await getUser(req.auth.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: publicUser(user) });
}));

app.get('/api/users/me', authRequired, asyncRoute(async (req, res) => {
    const user = await getUser(req.auth.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const [skills, interests] = await Promise.all([
        pool.query('SELECT skill FROM user_skills WHERE user_id = $1 ORDER BY skill', [req.auth.id]),
        pool.query('SELECT interest FROM user_interests WHERE user_id = $1 ORDER BY interest', [req.auth.id])
    ]);
    res.json({ user: { ...publicUser(user), skills: skills.rows.map(row => row.skill), interests: interests.rows.map(row => row.interest) } });
}));

app.patch('/api/users/me', authRequired, asyncRoute(async (req, res) => {
    const fields = { firstName: 'first_name', lastName: 'last_name', bio: 'bio', photo: 'photo', university: 'university', major: 'major', year: 'year', company: 'company', position: 'position', experience: 'experience', linkedin: 'linkedin', github: 'github' };
    const entries = Object.keys(fields).filter(key => req.body[key] !== undefined);
    if (!entries.length) return res.status(400).json({ error: 'No profile fields supplied' });
    const values = entries.map(key => req.body[key]);
    const assignments = entries.map((key, index) => `${fields[key]} = $${index + 1}`);
    values.push(req.auth.id);
    const result = await pool.query(`UPDATE users SET ${assignments.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`, values);
    res.json({ user: publicUser(result.rows[0]) });
}));

app.get('/api/mentors', authRequired, asyncRoute(async (req, res) => {
    const search = `%${String(req.query.search || '').toLowerCase()}%`;
    const result = await pool.query(`SELECT * FROM users WHERE role = 'mentor' AND (lower(first_name || ' ' || last_name) LIKE $1 OR lower(coalesce(position, '')) LIKE $1 OR lower(coalesce(company, '')) LIKE $1 OR lower(coalesce(bio, '')) LIKE $1) ORDER BY created_at DESC`, [search]);
    res.json({ mentors: result.rows.map(publicUser) });
}));

app.post('/api/connections/:userId', authRequired, asyncRoute(async (req, res) => {
    if (req.auth.id === req.params.userId) return res.status(400).json({ error: 'Cannot connect with yourself' });
    const result = await pool.query('INSERT INTO connections (sender_id, receiver_id) VALUES ($1, $2) RETURNING *', [req.auth.id, req.params.userId]);
    res.status(201).json({ connection: result.rows[0] });
}));

app.get('/api/messages/:userId', authRequired, asyncRoute(async (req, res) => {
    await pool.query('UPDATE messages SET read_at = NOW() WHERE sender_id = $1 AND receiver_id = $2 AND read_at IS NULL', [req.params.userId, req.auth.id]);
    const result = await pool.query('SELECT id, sender_id AS "senderId", receiver_id AS "receiverId", content, read_at AS "readAt", created_at AS "createdAt" FROM messages WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1) ORDER BY created_at', [req.auth.id, req.params.userId]);
    res.json({ messages: result.rows });
}));

app.post('/api/messages/:userId', authRequired, asyncRoute(async (req, res) => {
    const content = String(req.body.content || '').trim();
    if (!content) return res.status(400).json({ error: 'Message content is required' });
    const result = await pool.query('INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1, $2, $3) RETURNING id, sender_id AS "senderId", receiver_id AS "receiverId", content, created_at AS "createdAt"', [req.auth.id, req.params.userId, content]);
    res.status(201).json({ message: result.rows[0] });
}));

app.get('/api/sessions', authRequired, asyncRoute(async (req, res) => {
    const result = await pool.query('SELECT * FROM sessions WHERE student_id = $1 OR mentor_id = $1 ORDER BY session_date DESC, session_time DESC', [req.auth.id]);
    res.json({ sessions: result.rows.map(publicSession) });
}));

app.post('/api/sessions', authRequired, roleRequired('student'), asyncRoute(async (req, res) => {
    const { mentorId, date, time, topic = 'Mentorship session' } = req.body;
    const callType = req.body.callType === 'audio' ? 'audio' : 'video';
    if (!mentorId || !date || !time) return res.status(400).json({ error: 'mentorId, date, and time are required' });
    const result = await pool.query('INSERT INTO sessions (student_id, mentor_id, session_date, session_time, call_type, topic) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', [req.auth.id, mentorId, date, time, callType, topic]);
    res.status(201).json({ session: publicSession(result.rows[0]) });
}));

app.patch('/api/sessions/:id', authRequired, asyncRoute(async (req, res) => {
    const status = ['confirmed', 'completed', 'cancelled', 'rejected'].includes(req.body.status) ? req.body.status : null;
    if (!status) return res.status(400).json({ error: 'Invalid session status' });
    const result = await pool.query('UPDATE sessions SET status = $1 WHERE id = $2 AND (student_id = $3 OR mentor_id = $3) RETURNING *', [status, req.params.id, req.auth.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Session not found' });
    res.json({ session: publicSession(result.rows[0]) });
}));

app.get('/api/career', authRequired, asyncRoute(async (req, res) => {
    const result = await pool.query('SELECT current_field AS "currentField", target_field AS "targetField", skill_progress AS "skillProgress", milestones FROM career_profiles WHERE user_id = $1', [req.auth.id]);
    res.json({ career: result.rows[0] || { currentField: '', targetField: '', skillProgress: {}, milestones: [] } });
}));

app.put('/api/career', authRequired, asyncRoute(async (req, res) => {
    const result = await pool.query(`INSERT INTO career_profiles (user_id, current_field, target_field, skill_progress, milestones) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id) DO UPDATE SET current_field = EXCLUDED.current_field, target_field = EXCLUDED.target_field, skill_progress = EXCLUDED.skill_progress, milestones = EXCLUDED.milestones RETURNING current_field AS "currentField", target_field AS "targetField", skill_progress AS "skillProgress", milestones`, [req.auth.id, req.body.currentField || '', req.body.targetField || '', req.body.skillProgress || {}, JSON.stringify(req.body.milestones || [])]);
    res.json({ career: result.rows[0] });
}));

app.get('/api/communities', authRequired, asyncRoute(async (req, res) => {
    const result = await pool.query('SELECT c.*, COUNT(cm.user_id)::int AS members FROM communities c LEFT JOIN community_members cm ON cm.community_id = c.id GROUP BY c.id ORDER BY c.name');
    res.json({ communities: result.rows.map(publicCommunity) });
}));

app.post('/api/communities/:id/join', authRequired, asyncRoute(async (req, res) => {
    await pool.query('INSERT INTO community_members (community_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.params.id, req.auth.id]);
    res.status(201).json({ joined: true });
}));

app.delete('/api/communities/:id/join', authRequired, asyncRoute(async (req, res) => {
    await pool.query('DELETE FROM community_members WHERE community_id = $1 AND user_id = $2', [req.params.id, req.auth.id]);
    res.json({ joined: false });
}));

app.get('/api/communities/:id/posts', authRequired, asyncRoute(async (req, res) => {
    const result = await pool.query('SELECT p.*, u.first_name AS "authorFirstName", u.last_name AS "authorLastName" FROM posts p JOIN users u ON u.id = p.author_id WHERE p.community_id = $1 ORDER BY p.created_at DESC', [req.params.id]);
    res.json({ posts: result.rows.map(publicPost) });
}));

app.post('/api/communities/:id/posts', authRequired, asyncRoute(async (req, res) => {
    const { title, content, category = 'discussion', tags = [] } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'title and content are required' });
    const result = await pool.query('INSERT INTO posts (community_id, author_id, title, content, category, tags) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', [req.params.id, req.auth.id, title, content, category, JSON.stringify(tags)]);
    res.status(201).json({ post: publicPost(result.rows[0]) });
}));

app.get('/api/posts/:id/comments', authRequired, asyncRoute(async (req, res) => {
    const result = await pool.query('SELECT c.*, u.first_name AS "authorFirstName", u.last_name AS "authorLastName" FROM comments c JOIN users u ON u.id = c.author_id WHERE c.post_id = $1 ORDER BY c.created_at', [req.params.id]);
    res.json({ comments: result.rows.map(publicComment) });
}));

app.post('/api/posts/:id/comments', authRequired, asyncRoute(async (req, res) => {
    const content = String(req.body.content || '').trim();
    if (!content) return res.status(400).json({ error: 'Comment content is required' });
    const result = await pool.query('INSERT INTO comments (post_id, author_id, content) VALUES ($1, $2, $3) RETURNING *', [req.params.id, req.auth.id, content]);
    res.status(201).json({ comment: publicComment(result.rows[0]) });
}));

app.get('/api/billing', authRequired, asyncRoute(async (req, res) => {
    const result = await pool.query('SELECT * FROM billing WHERE user_id = $1 ORDER BY created_at DESC', [req.auth.id]);
    res.json({ billing: result.rows.map(publicBilling) });
}));

app.post('/api/billing/checkout', authRequired, asyncRoute(async (req, res) => {
    const amount = { premium: 2500, pro: 5000 }[req.body.plan];
    if (!amount) return res.status(400).json({ error: 'Invalid plan' });
    const result = await pool.query('INSERT INTO billing (user_id, plan, amount) VALUES ($1, $2, $3) RETURNING *', [req.auth.id, req.body.plan, amount]);
    res.status(201).json({ payment: publicBilling(result.rows[0]), message: 'Mock payment recorded; connect Stripe before production.' });
}));

// ---- AI CAREER COACH (Gemini proxy — the API key never reaches the browser) ----
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent';

function sanitizeAiText(text) {
    // The coach speaks plain text: strip markdown emphasis/headers the model may add.
    return String(text)
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2')
        .replace(/^#{1,6}\s*/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

app.get('/api/ai/status', (req, res) => {
    res.json({ configured: Boolean(GEMINI_API_KEY), model: GEMINI_MODEL });
});

app.post('/api/ai/chat', asyncRoute(async (req, res) => {
    const message = String(req.body.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Message is required' });
    if (!GEMINI_API_KEY) return res.json({ ok: false, error: 'gemini-not-configured' });

    // Personalize the coach with the student's platform profile.
    const profile = req.body.profile || {};
    const contextLines = [];
    if (profile.name) contextLines.push('Name: ' + profile.name);
    if (profile.currentField) contextLines.push('Current field: ' + profile.currentField);
    if (profile.targetField) contextLines.push('Target field: ' + profile.targetField);
    if (Array.isArray(profile.transferableSkills) && profile.transferableSkills.length) contextLines.push('Transferable skills: ' + profile.transferableSkills.join(', '));
    if (Array.isArray(profile.missingSkills) && profile.missingSkills.length) contextLines.push('Skill gaps to close: ' + profile.missingSkills.join(', '));
    if (profile.milestones && typeof profile.milestones.total === 'number') contextLines.push('Milestones completed: ' + profile.milestones.done + ' of ' + profile.milestones.total);
    if (profile.plan) contextLines.push('Plan: ' + profile.plan);
    if (Array.isArray(profile.upcomingSessions) && profile.upcomingSessions.length) contextLines.push('Upcoming sessions: ' + profile.upcomingSessions.join('; '));
    if (Array.isArray(profile.mentors) && profile.mentors.length) contextLines.push('Mentors on the platform (do not invent others): ' + profile.mentors.join('; '));

    const systemPrompt = [
        'You are "Mentor AI", the warm, practical career coach built into MentorConnect, a mentor-mentee platform.',
        'Personalize with the student context below; reference it naturally instead of repeating it verbatim.',
        'Style: 2-5 short sentences, conversational and human (contractions, no lecturing). Ask at most one short follow-up question when it moves the student forward. Plain text only — no markdown, no bullet symbols, at most one emoji.',
        'Platform features you may point to: Discover (finding mentors), connect requests, session booking, communities, career roadmap, skills progress, milestones, and plans (Free / Premium Rs 2,500 per month / Pro Rs 5,000 per year with everything unlimited).',
        'Never invent mentor names beyond the provided list; if unsure, suggest using Discover.',
        'Stay on career, learning, and mentorship topics; gently redirect anything else.',
        'If asked what powers you: you are Mentor AI, powered by Google Gemini.',
        '',
        'STUDENT CONTEXT:',
        contextLines.length ? contextLines.join('\n') : '(profile not filled in yet — help them set a current and target field)'
    ].join('\n');

    const history = Array.isArray(req.body.history) ? req.body.history.slice(-12) : [];
    const contents = history
        .filter(m => m && typeof m.text === 'string' && m.text.trim())
        .map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text.slice(0, 2000) }] }));
    contents.push({ role: 'user', parts: [{ text: message.slice(0, 2000) }] });

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);
        const upstream = await fetch(GEMINI_ENDPOINT + '?key=' + encodeURIComponent(GEMINI_API_KEY), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemPrompt }] },
                contents,
                generationConfig: { temperature: 0.9, topP: 0.95, maxOutputTokens: 350 }
            }),
            signal: controller.signal
        });
        clearTimeout(timer);
        if (!upstream.ok) {
            const detail = await upstream.text().catch(() => '');
            console.error('Gemini API error ' + upstream.status + ': ' + detail.slice(0, 400));
            return res.json({ ok: false, error: 'gemini-unavailable' });
        }
        const data = await upstream.json();
        const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
        const reply = parts ? sanitizeAiText(parts.map(p => p.text || '').join('')) : '';
        if (!reply) return res.json({ ok: false, error: 'gemini-empty' });
        res.json({ ok: true, reply, model: GEMINI_MODEL });
    } catch (error) {
        console.error('Gemini request failed:', error.message);
        res.json({ ok: false, error: 'gemini-request-failed' });
    }
}));

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
});

if (require.main === module) {
    if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) {
        console.error('DATABASE_URL and JWT_SECRET must be set before starting the API.');
        process.exit(1);
    }
    app.listen(port, () => console.log(`MentorConnect API listening on http://localhost:${port}`));
}

module.exports = app;
