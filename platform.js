/* ========================================
   SUPER PHASES 6–10 — Sessions, Career, AI, Billing
   ======================================== */

var bookingDraft = null;
var reviewSessionId = null;
var upgradePlanChoice = 'premium';
var sessionsTab = 'upcoming';
var selectedBookingSlot = null;
var availabilityDraft = null;

var CAREER_FIELDS = {
    'software-engineering': {
        name: 'Software Engineering',
        skills: ['JavaScript', 'Python', 'Data Structures', 'Git', 'APIs', 'Testing', 'Problem Solving', 'Collaboration']
    },
    'ui-ux-design': {
        name: 'UI/UX Design',
        skills: ['Figma', 'User Research', 'Wireframing', 'Prototyping', 'Visual Design', 'Accessibility', 'Design Systems', 'Collaboration']
    },
    'data-science': {
        name: 'Data Science',
        skills: ['Python', 'Statistics', 'SQL', 'Machine Learning', 'Data Visualization', 'Problem Solving']
    },
    'product-management': {
        name: 'Product Management',
        skills: ['Roadmapping', 'User Research', 'Communication', 'Prioritization', 'Analytics']
    }
};

var DEFAULT_SLOTS = ['10:00', '11:00', '14:00', '15:00', '16:00'];
var WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

function lsGet(key, fallback) {
    var raw = localStorage.getItem(key);
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
}
function lsSet(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

var SESSION_STATUS_RANK = { completed: 5, confirmed: 4, pending: 3, reschedule: 2, cancelled: 1, rejected: 0 };

function getSessions() {
    var list = lsGet('mentorconnect_sessions', []);
    // Self-heal: one record per real meeting (student + mentor + date + time).
    // Duplicate bookings of the same slot (double-submits, cancelled + rebooked
    // same slot, etc.) are collapsed into the most meaningful record.
    var seen = {};
    var deduped = [];
    list.forEach(function (s) {
        var key = [s.studentId, s.mentorId, s.date, s.time].join('|');
        if (seen[key] === undefined) {
            seen[key] = deduped.length;
            deduped.push(s);
            return;
        }
        var current = deduped[seen[key]];
        var statusA = SESSION_STATUS_RANK[s.status] != null ? SESSION_STATUS_RANK[s.status] : -1;
        var statusB = SESSION_STATUS_RANK[current.status] != null ? SESSION_STATUS_RANK[current.status] : -1;
        var infoA = (s.reviewed ? 2 : 0) + (s.completedAt ? 1 : 0) + (s.topic ? 1 : 0);
        var infoB = (current.reviewed ? 2 : 0) + (current.completedAt ? 1 : 0) + (current.topic ? 1 : 0);
        if (statusA > statusB || (statusA === statusB && infoA > infoB)) {
            deduped[seen[key]] = s;
        }
    });
    if (deduped.length !== list.length) saveSessions(deduped);
    return deduped;
}
function saveSessions(list) { lsSet('mentorconnect_sessions', list); }
function getAvailabilityMap() { return lsGet('mentorconnect_availability', {}); }
function saveAvailabilityMap(map) { lsSet('mentorconnect_availability', map); }
function getReviews() { return lsGet('mentorconnect_reviews', []); }
function saveReviews(list) { lsSet('mentorconnect_reviews', list); }
function getBilling() { return lsGet('mentorconnect_billing', []); }
function saveBilling(list) { lsSet('mentorconnect_billing', list); }

function getCareerProfile() {
    if (!currentUser) return { currentField: '', targetField: '', skillProgress: {}, milestones: [] };
    return lsGet('mentorconnect_career_' + currentUser.id, { currentField: '', targetField: '', skillProgress: {}, milestones: [] });
}
function saveCareerProfile(profile) {
    if (!currentUser) return;
    lsSet('mentorconnect_career_' + currentUser.id, profile);
}

function getSub() {
    if (!currentUser) return defaultSub();
    return lsGet('mentorconnect_sub_' + currentUser.id, defaultSub());
}
function defaultSub() {
    return {
        plan: 'free',
        trialEnds: Date.now() + 7 * 24 * 60 * 60 * 1000,
        sessionsUsed: 0,
        sessionLimit: 2,
        aiUses: 0
    };
}
function saveSub(sub) {
    if (!currentUser) return;
    lsSet('mentorconnect_sub_' + currentUser.id, sub);
}

function isPremium() {
    var sub = getSub();
    return sub.plan === 'premium' || sub.plan === 'pro';
}

function removeBuiltInDemoData() {
    var demoIds = ['demo-student', 'demo-priya', 'demo-james', 'demo-maria', 'demo-david', 'demo-sarah', 'demo-michael', 'demo-emily', 'demo-jennifer'];
    var demoEmails = [
        'alex.student@mentorconnect.dev',
        'priya.design@mentorconnect.dev',
        'james.eng@mentorconnect.dev',
        'admin@mentorconnect.io',
        'maria.garcia@mentorconnect.dev',
        'david.chen@mentorconnect.dev',
        'sarah.johnson@mentorconnect.dev',
        'michael.brown@mentorconnect.dev',
        'emily.davis@mentorconnect.dev',
        'jennifer.wilson@mentorconnect.dev'
    ];
    var users = getUsers();
    var removedIds = users.filter(function (user) {
        return demoIds.indexOf(user.id) !== -1 || demoEmails.indexOf(String(user.email || '').toLowerCase()) !== -1;
    }).map(function (user) { return user.id; });
    if (!removedIds.length) return;

    saveUsers(users.filter(function (user) { return removedIds.indexOf(user.id) === -1; }));

    saveSessions(getSessions().filter(function (session) {
        return removedIds.indexOf(session.studentId) === -1 && removedIds.indexOf(session.mentorId) === -1 &&
            ['seed-history', 'seed-upcoming'].indexOf(session.id) === -1;
    }));
    saveReviews(getReviews().filter(function (review) {
        return removedIds.indexOf(review.studentId) === -1 && removedIds.indexOf(review.mentorId) === -1 && review.id !== 'seed-review';
    }));

    var availability = getAvailabilityMap();
    removedIds.forEach(function (id) { delete availability[id]; });
    saveAvailabilityMap(availability);

    removedIds.forEach(function (id) {
        Object.keys(localStorage).forEach(function (key) {
            if (key.indexOf('mentorconnect_') === 0 && key.endsWith('_' + id)) {
                localStorage.removeItem(key);
            }
        });
    });
    localStorage.removeItem('mentorconnect_seeded_v10');
    localStorage.removeItem('mentorconnect_seeded_v11');
}

function ensureAdminAccount() {
    var users = getUsers();
    var admin = users.find(function (user) { return user.email === 'admin@mentorconnect.dev' && user.role === 'admin'; });
    if (!admin) {
        users.push({
            id: 'system-admin',
            firstName: 'Admin',
            lastName: 'User',
            email: 'admin@mentorconnect.dev',
            password: hashPassword('admin123'),
            role: 'admin',
            bio: 'MentorConnect platform administrator.',
            emailVerified: true,
            createdAt: new Date().toISOString()
        });
        saveUsers(users);
        return;
    }
    // Migration: very old seeds stored the literal placeholder 'hashed_3k8m2p1',
    // which no hash produced by hashPassword() can ever equal — so the documented
    // admin123 password could never log in. Only a real user-changed password
    // would store a different value; repair ONLY the known-broken placeholder.
    if (admin.password === 'hashed_3k8m2p1') {
        admin.password = hashPassword('admin123');
        saveUsers(users);
        if (typeof resetFailedAttempts === 'function') resetFailedAttempts('admin@mentorconnect.dev');
    }
}

// Demo mentor accounts so reviewers/tests can log in with known credentials.
// Idempotent: accounts are added only if their email is not already registered.
// Credentials:
//   Priya Sharma  -> priya.sharma@mentorconnect.dev  / Mentor@123
//   James Okeke   -> james.okeke@mentorconnect.dev   / Mentor@123
function ensureDemoMentors() {
    var users = getUsers();
    function upsertMentor(user) {
        var idx = users.findIndex(function (u) { return u.email === user.email; });
        if (idx === -1) users.push(user);
        else users[idx] = Object.assign({}, users[idx], user);
        saveUsers(users);
    }
    upsertMentor({
        id: 'demo-mentor-priya',
        firstName: 'Priya',
        lastName: 'Sharma',
        email: 'priya.sharma@mentorconnect.dev',
        password: hashPassword('Mentor@123'),
        role: 'mentor',
        bio: 'Senior product designer helping engineers transition into UI/UX. I coach portfolio reviews, Figma craft, and user research methods.',
        skills: ['Figma', 'User Research', 'Wireframing', 'Prototyping', 'Visual Design', 'Design Systems'],
        interests: ['Mentorship', 'Career Transitions'],
        company: 'Northstar Labs',
        position: 'Lead UI/UX Designer',
        experience: '8 years',
        studentsMentored: 24,
        sessions: 86,
        rating: 4.9,
        emailVerified: true,
        profileCompleted: true,
        verified: true,
        mentorVerificationStatus: 'approved',
        createdAt: new Date(Date.now() - 240 * 24 * 60 * 60 * 1000).toISOString()
    });
    upsertMentor({
        id: 'demo-mentor-james',
        firstName: 'James',
        lastName: 'Okeke',
        email: 'james.okeke@mentorconnect.dev',
        password: hashPassword('Mentor@123'),
        role: 'mentor',
        bio: 'Staff software engineer mentoring students on system design, clean code, and career growth in tech.',
        skills: ['JavaScript', 'Python', 'System Design', 'APIs', 'Testing', 'Git'],
        interests: ['Mentorship', 'Career Growth'],
        company: 'Cloudline',
        position: 'Staff Engineer',
        experience: '10 years',
        studentsMentored: 18,
        sessions: 54,
        rating: 4.7,
        emailVerified: true,
        profileCompleted: true,
        verified: true,
        mentorVerificationStatus: 'approved',
        createdAt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString()
    });
}

function seedPlatformData() {
    removeBuiltInDemoData();
    ensureAdminAccount();
    ensureDemoMentors();
    return;

    if (localStorage.getItem('mentorconnect_seeded_v10')) {
        ensureDemoUsers();
        return;
    }
    var users = getUsers();

    function upsert(user) {
        var idx = users.findIndex(function (u) { return u.email === user.email; });
        if (idx === -1) users.push(user);
        else users[idx] = Object.assign({}, users[idx], user, { id: users[idx].id });
        return users.find(function (u) { return u.email === user.email; });
    }

    var student = upsert({
        id: 'demo-student',
        firstName: 'Alex',
        lastName: 'Student',
        email: 'alex.student@mentorconnect.dev',
        password: 'hashed_2nj1t9k',
        role: 'student',
        bio: 'Software engineering student exploring a move into product design.',
        skills: ['JavaScript', 'Python', 'Git', 'APIs'],
        interests: ['UI/UX Design', 'Product Design'],
        university: 'State University',
        major: 'Software Engineering',
        year: 'Junior',
        connectedMentors: 1,
        sessions: 1,
        rating: 0,
        verified: false,
        createdAt: new Date().toISOString()
    });

    var priya = upsert({
        id: 'demo-priya',
        firstName: 'Priya',
        lastName: 'Sharma',
        email: 'priya.design@mentorconnect.dev',
        password: 'hashed_2nj1t9k',
        role: 'mentor',
        bio: 'Senior product designer helping engineers transition into UI/UX. I coach portfolio reviews, Figma craft, and research methods.',
        skills: ['Figma', 'User Research', 'Wireframing', 'Prototyping', 'Visual Design', 'Design Systems'],
        interests: ['Mentorship', 'Career Transitions'],
        company: 'Northstar Labs',
        position: 'Lead UI/UX Designer',
        experience: '8 years',
        studentsMentored: 24,
        sessions: 86,
        rating: 4.9,
        verified: false,
        verificationStatus: 'pending',
        createdAt: new Date().toISOString()
    });

    upsert({
        id: 'demo-james',
        firstName: 'James',
        lastName: 'Okeke',
        email: 'james.eng@mentorconnect.dev',
        password: 'hashed_2nj1t9k',
        role: 'mentor',
        bio: 'Staff software engineer mentoring students on systems design and career growth.',
        skills: ['JavaScript', 'Python', 'System Design', 'APIs', 'Testing'],
        company: 'Cloudline',
        position: 'Staff Engineer',
        experience: '10 years',
        studentsMentored: 18,
        sessions: 54,
        rating: 4.7,
        verified: true,
        verificationStatus: 'approved',
        createdAt: new Date().toISOString()
    });

    upsert({
        id: 'demo-admin',
        firstName: 'Portal',
        lastName: 'Admin',
        email: 'admin@mentorconnect.dev',
        password: hashPassword('admin123'),
        role: 'admin',
        bio: 'MentorConnect platform administrator.',
        createdAt: new Date().toISOString()
    });

    // Additional seed users for user management system
    upsert({
        id: 'demo-maria',
        firstName: 'Maria',
        lastName: 'Garcia',
        email: 'maria.garcia@mentorconnect.dev',
        password: 'hashed_2nj1t9k',
        role: 'student',
        bio: 'Computer science student interested in machine learning and data science.',
        skills: ['Python', 'R', 'SQL', 'Statistics'],
        interests: ['Machine Learning', 'Data Science'],
        university: 'Tech Institute',
        major: 'Computer Science',
        year: 'Senior',
        verified: false,
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    });

    upsert({
        id: 'demo-david',
        firstName: 'David',
        lastName: 'Chen',
        email: 'david.chen@mentorconnect.dev',
        password: 'hashed_2nj1t9k',
        role: 'mentor',
        bio: 'Full-stack developer and tech lead with expertise in cloud architecture and DevOps.',
        skills: ['AWS', 'Docker', 'Kubernetes', 'Node.js', 'React', 'TypeScript'],
        company: 'CloudScale Inc.',
        position: 'Senior Tech Lead',
        experience: '12 years',
        studentsMentored: 32,
        sessions: 128,
        rating: 4.8,
        verified: true,
        verificationStatus: 'approved',
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
    });

    upsert({
        id: 'demo-sarah',
        firstName: 'Sarah',
        lastName: 'Johnson',
        email: 'sarah.johnson@mentorconnect.dev',
        password: 'hashed_2nj1t9k',
        role: 'student',
        bio: 'Marketing professional transitioning to product management. Learning agile methodologies.',
        skills: ['Marketing Strategy', 'Analytics', 'Project Management'],
        interests: ['Product Management', 'Agile'],
        university: 'Business School',
        major: 'MBA',
        year: 'First Year',
        verified: false,
        createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
    });

    upsert({
        id: 'demo-michael',
        firstName: 'Michael',
        lastName: 'Brown',
        email: 'michael.brown@mentorconnect.dev',
        password: 'hashed_2nj1t9k',
        role: 'mentor',
        bio: 'Product manager at a Fortune 500 company. Passionate about helping others break into tech.',
        skills: ['Product Strategy', 'Roadmapping', 'User Stories', 'A/B Testing', 'SQL'],
        company: 'TechCorp Global',
        position: 'Senior Product Manager',
        experience: '9 years',
        studentsMentored: 45,
        sessions: 210,
        rating: 4.9,
        verified: true,
        verificationStatus: 'approved',
        createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    });

    upsert({
        id: 'demo-emily',
        firstName: 'Emily',
        lastName: 'Davis',
        email: 'emily.davis@mentorconnect.dev',
        password: 'hashed_2nj1t9k',
        role: 'student',
        bio: 'Recent graduate looking for career guidance in software development.',
        skills: ['Java', 'C++', 'Git'],
        interests: ['Software Development', 'Web Development'],
        university: 'State College',
        major: 'Computer Science',
        year: 'Recent Graduate',
        verified: false,
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    });

    upsert({
        id: 'demo-jennifer',
        firstName: 'Jennifer',
        lastName: 'Wilson',
        email: 'jennifer.wilson@mentorconnect.dev',
        password: 'hashed_2nj1t9k',
        role: 'mentor',
        bio: 'UX researcher with a background in psychology. Specializing in accessibility and inclusive design.',
        skills: ['User Research', 'Usability Testing', 'Accessibility', 'Survey Design', 'Figma'],
        company: 'DesignFirst Agency',
        position: 'Lead UX Researcher',
        experience: '7 years',
        studentsMentored: 28,
        sessions: 95,
        rating: 4.7,
        verified: true,
        verificationStatus: 'approved',
        createdAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString()
    });

    saveUsers(users);

    var avail = getAvailabilityMap();
    avail[priya.id] = { Mon: DEFAULT_SLOTS.slice(), Tue: DEFAULT_SLOTS.slice(), Wed: ['11:00', '15:00'], Thu: DEFAULT_SLOTS.slice(), Fri: ['10:00', '14:00'] };
    saveAvailabilityMap(avail);

    var past = new Date();
    past.setDate(past.getDate() - 5);
    var upcoming = new Date();
    upcoming.setDate(upcoming.getDate() + 1);

    var sessions = getSessions();
    if (!sessions.some(function (s) { return s.id === 'seed-history'; })) {
        sessions.push({
            id: 'seed-history',
            studentId: student.id,
            mentorId: priya.id,
            date: past.toISOString().slice(0, 10),
            time: '14:00',
            topic: 'Intro to UI/UX for engineers',
            status: 'completed',
            reviewed: true,
            createdAt: past.toISOString()
        });
        sessions.push({
            id: 'seed-upcoming',
            studentId: student.id,
            mentorId: priya.id,
            date: upcoming.toISOString().slice(0, 10),
            time: '11:00',
            topic: 'Portfolio critique',
            status: 'confirmed',
            reviewed: false,
            reminderSent: false,
            createdAt: new Date().toISOString()
        });
        saveSessions(sessions);
    }

    saveReviews([{
        id: 'seed-review',
        sessionId: 'seed-history',
        studentId: student.id,
        mentorId: priya.id,
        rating: 5,
        text: 'Clear, practical advice on switching from engineering to design.',
        createdAt: past.toISOString()
    }]);

    lsSet('mentorconnect_career_' + student.id, {
        currentField: 'software-engineering',
        targetField: 'ui-ux-design',
        skillProgress: { Figma: 20, 'User Research': 10, Wireframing: 15, Prototyping: 5, 'Visual Design': 10, Accessibility: 0, 'Design Systems': 0 },
        milestones: [
            { id: 'm1', title: 'Complete Figma fundamentals', done: true },
            { id: 'm2', title: 'Run 3 user interviews', done: false },
            { id: 'm3', title: 'Ship a case-study portfolio', done: false }
        ]
    });

    lsSet('mentorconnect_sub_' + student.id, {
        plan: 'free',
        trialEnds: Date.now() + 5 * 24 * 60 * 60 * 1000,
        sessionsUsed: 1,
        sessionLimit: 2,
        aiUses: 0
    });

    localStorage.setItem('mentorconnect_seeded_v11', '1');
}

function ensureDemoUsers() {
    var users = getUsers();
    // Make sure the Admin Portal account always exists
    if (!users.some(function (u) { return u.email === 'admin@mentorconnect.dev'; })) {
        users.push({
            id: 'demo-admin',
            firstName: 'Portal',
            lastName: 'Admin',
            email: 'admin@mentorconnect.dev',
            password: hashPassword('admin123'),
            role: 'admin',
            bio: 'MentorConnect platform administrator.',
            createdAt: new Date().toISOString()
        });
        saveUsers(users);
    }
    if (!users.some(function (u) { return u.email === 'maria.garcia@mentorconnect.dev'; })) {
        localStorage.removeItem('mentorconnect_seeded_v11');
        seedPlatformData();
    }
}

function navItemsForUser() {
    if (!currentUser) return [];
    if (currentUser.role === 'admin') {
        return [
            { key: 'home', label: 'Home', action: 'goHome()' },
            { key: 'users', label: 'Users', action: "showAdminSection('users')" },
            { key: 'sessions', label: 'Sessions', action: "showAdminSection('sessions')" },
            { key: 'content', label: 'Content', action: "showAdminSection('content')" }
        ];
    }
    if (currentUser.role === 'mentor') {
        return [
            { key: 'home', label: 'Home', action: 'goHome()' },
            { key: 'students', label: 'My Students', action: "showMentorSection('students')" },
            { key: 'sessions', label: 'Sessions', action: 'openSessionsScreen()' },
            { key: 'availability', label: 'Availability', screen: 'mentor-availability-screen' },
            { key: 'messages', label: 'Messages', screen: 'messages-screen' },
            { key: 'profile', label: 'Profile', screen: 'profile-screen' }
        ];
    }
    return [
        { key: 'home', label: 'Home', action: 'goHome()' },
        { key: 'discover', label: 'Discover', screen: 'discover-screen' },
        { key: 'communities', label: 'Communities', screen: 'community-home-screen' },
        { key: 'sessions', label: 'Sessions', action: 'openSessionsScreen()' },
        { key: 'career', label: 'Career', screen: 'career-profile-screen' },
        { key: 'messages', label: 'Messages', screen: 'messages-screen' },
        { key: 'saved', label: 'Saved', screen: 'saved-mentors-screen' },
        { key: 'plans', label: 'Plans', screen: 'plans-screen' },
        { key: 'profile', label: 'Profile', screen: 'profile-screen' }
    ];
}

function activeNavKey(screenId) {
    if (screenId === 'student-dashboard' || screenId === 'mentor-dashboard' || screenId === 'admin-dashboard') return 'home';
    if (screenId.indexOf('community') === 0 || screenId === 'create-post-screen' || screenId === 'question-detail-screen' || screenId === 'saved-posts-screen') return 'communities';
    if (screenId.indexOf('session') >= 0 || screenId.indexOf('booking') >= 0 || screenId === 'review-session-screen' || screenId === 'mentor-availability-screen') return screenId === 'mentor-availability-screen' ? 'availability' : 'sessions';
    if (screenId.indexOf('career') === 0) return 'career';
    if (screenId === 'messages-screen' || screenId === 'private-chat-screen' || screenId === 'shared-resources-screen') return 'messages';
    if (screenId === 'saved-mentors-screen') return 'saved';
    if (screenId.indexOf('plan') === 0 || screenId === 'usage-dashboard-screen' || screenId === 'upgrade-screen' || screenId === 'payment-screen' || screenId === 'billing-history-screen') return 'plans';
    if (screenId === 'profile-screen' || screenId === 'settings-screen') return 'profile';
    if (screenId.indexOf('discover') === 0 || screenId === 'search-results-screen' || screenId === 'filter-screen' || screenId === 'mentor-detail-screen' || screenId === 'popular-domains-screen' || screenId === 'recommended-mentors-screen' || screenId === 'match-details-screen') return 'discover';
    return '';
}

// Dropdown groups — nav items with similar functions are combined into one dropdown.
// Items not available for the current role are skipped automatically, and a group
// with fewer than 2 visible items falls back to plain top-level links.
var NAV_DROPDOWN_GROUPS = [
    { key: 'explore',   label: 'Explore',   items: ['discover', 'saved'] },
    { key: 'mentoring', label: 'Mentoring', labelStudent: 'Growth', items: ['students', 'sessions', 'availability', 'career'] },
    { key: 'connect',   label: 'Connect',   items: ['communities', 'messages'] },
    { key: 'account',   label: 'Account',   items: ['plans', 'profile'] },
    { key: 'manage',    label: 'Manage',    items: ['users', 'sessions', 'content'] }
];

function navItemHandler(item) {
    return item.action ? item.action : "navigateTo('" + item.screen + "')";
}

function renderNavHtml(activeKey) {
    var items = navItemsForUser();
    var byKey = {};
    items.forEach(function (item) { byKey[item.key] = item; });

    var grouped = {};
    var homeHtml = '';
    var groupsHtml = '';
    var restHtml = '';

    NAV_DROPDOWN_GROUPS.forEach(function (group) {
        var groupItems = group.items.filter(function (key) { return byKey[key]; });
        if (groupItems.length < 2) return; // nothing similar to combine — leave items top-level
        groupItems.forEach(function (key) { grouped[key] = true; });
        var isActive = groupItems.indexOf(activeKey) !== -1;
        var groupLabel = group.label;
        if (group.labelStudent && (!currentUser || currentUser.role !== 'mentor')) {
            groupLabel = group.labelStudent;
        }
        groupsHtml += '<div class="nav-dropdown' + (isActive ? ' has-active' : '') + '">' +
            '<a href="#" class="nav-link nav-dropdown-toggle' + (isActive ? ' active' : '') + '" onclick="event.preventDefault();toggleNavDropdown(this)">' +
                groupLabel +
                '<svg class="nav-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>' +
            '</a>' +
            '<div class="nav-dropdown-menu">' +
                groupItems.map(function (key) {
                    var item = byKey[key];
                    return '<a href="#" class="nav-dropdown-item' + (key === activeKey ? ' active' : '') + '" onclick="event.preventDefault();closeAllNavDropdowns();' + navItemHandler(item) + '">' + item.label + '</a>';
                }).join('') +
            '</div>' +
        '</div>';
    });

    items.forEach(function (item) {
        if (grouped[item.key]) return;
        var cls = 'nav-link' + (item.key === activeKey ? ' active' : '');
        var link = '<a href="#" class="' + cls + '" onclick="event.preventDefault();' + navItemHandler(item) + '">' + item.label + '</a>';
        if (item.key === 'home') {
            homeHtml = link; // Home is always the FIRST button in the nav
        } else {
            restHtml += link;
        }
    });

    return homeHtml + groupsHtml + restHtml;
}

function toggleNavDropdown(toggleEl) {
    var dropdown = toggleEl.closest('.nav-dropdown');
    if (!dropdown) return;
    var wasOpen = dropdown.classList.contains('open');
    closeAllNavDropdowns();
    if (!wasOpen) dropdown.classList.add('open');
}

function closeAllNavDropdowns() {
    document.querySelectorAll('.nav-dropdown.open').forEach(function (dd) {
        dd.classList.remove('open');
    });
}

// Close any open nav dropdown when clicking outside of it
document.addEventListener('click', function (e) {
    if (!e.target.closest('.nav-dropdown')) closeAllNavDropdowns();
});

function applyHomeFirstBanner() {
    if (!currentUser) return;
    var active = document.querySelector('.screen.active');
    var screenId = active ? active.id : '';
    var authScreens = ['splash-screen', 'welcome-screen', 'login-screen', 'signup-screen', 'forgot-screen', 'role-screen', 'profile-setup-screen', 'admin-login-screen'];
    if (authScreens.indexOf(screenId) !== -1) return;
    var key = activeNavKey(screenId);
    var html = renderNavHtml(key);
    document.querySelectorAll('.dashboard-nav .nav-links').forEach(function (el) {
        el.innerHTML = html;
    });
    ensureMobileNavControls();
    ensureNavBackButton(screenId);
}

function ensureMobileNavControls() {
    document.querySelectorAll('.dashboard-nav').forEach(function (nav) {
        var links = nav.querySelector('.nav-links');
        if (!links || nav.querySelector('.mobile-nav-toggle')) return;

        var toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'mobile-nav-toggle';
        toggle.setAttribute('aria-label', 'Open navigation menu');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.innerHTML = '<span></span><span></span><span></span>';
        toggle.addEventListener('click', function () {
            var isOpen = nav.classList.toggle('mobile-nav-open');
            toggle.setAttribute('aria-expanded', String(isOpen));
            toggle.setAttribute('aria-label', isOpen ? 'Close navigation menu' : 'Open navigation menu');
        });
        nav.insertBefore(toggle, links);
    });
}

// Inject a Back button into the nav bar of every inner screen
// (home dashboards are skipped since they are the top-level pages)
function ensureNavBackButton(screenId) {
    var homeScreens = ['student-dashboard', 'mentor-dashboard', 'admin-dashboard'];
    document.querySelectorAll('.screen.active .dashboard-nav').forEach(function (nav) {
        var existing = nav.querySelector('.nav-back-btn');
        if (homeScreens.indexOf(screenId) !== -1) {
            if (existing) existing.remove();
            return;
        }
        if (existing) return;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-outline btn-sm nav-back-btn';
        btn.title = 'Go back';
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg> Back';
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            goBack();
        });
        nav.insertBefore(btn, nav.firstChild);
    });
}

function toggleAiFabVisibility() {
    updateNotificationIndicators();
    var fab = document.getElementById('ai-fab');
    var panel = document.getElementById('ai-panel');
    if (!fab) return;
    var activeScreen = document.querySelector('.screen.active');
    var show = !!currentUser && currentUser.role === 'student' && activeScreen && activeScreen.id === 'student-dashboard';
    fab.style.display = show ? 'flex' : 'none';
    if (!show && panel) panel.classList.remove('open');
}

function userById(id) {
    return getUsers().find(function (u) { return u.id === id; });
}

function formatSessionWhen(session) {
    return session.date + ' at ' + session.time;
}

function openSessionsScreen() {
    sessionsTab = currentUser && currentUser.role === 'mentor' ? 'requests' : 'upcoming';
    navigateTo('sessions-screen');
}

function renderSessionsScreen() {
    if (!currentUser) return;
    var chip = document.getElementById('session-usage-chip');
    if (chip && currentUser.role === 'student') {
        var sub = getSub();
        chip.textContent = isPremium()
            ? 'Premium · unlimited sessions'
            : 'Free plan · ' + completedSessionsUsed() + ' / ' + sub.sessionLimit + ' free sessions completed';
    } else if (chip) {
        chip.textContent = 'Accept bookings, reschedule, and complete sessions';
    }

    var tabs = document.getElementById('sessions-tabs');
    var studentTabs = [
        { id: 'upcoming', label: 'Upcoming' },
        { id: 'history', label: 'History' }
    ];
    var mentorTabs = [
        { id: 'requests', label: 'Requests' },
        { id: 'upcoming', label: 'Upcoming' },
        { id: 'history', label: 'History' }
    ];
    var list = currentUser.role === 'mentor' ? mentorTabs : studentTabs;
    tabs.innerHTML = list.map(function (t) {
        return '<button class="tab-btn' + (sessionsTab === t.id ? ' active' : '') + '" onclick="sessionsTab=\'' + t.id + '\';renderSessionsScreen()">' + t.label + '</button>';
    }).join('');

    var all = getSessions().filter(function (s) {
        return currentUser.role === 'mentor' ? s.mentorId === currentUser.id : s.studentId === currentUser.id;
    });
    var filtered;
    if (sessionsTab === 'requests') filtered = all.filter(function (s) { return s.status === 'pending'; });
    else if (sessionsTab === 'upcoming') filtered = all.filter(function (s) { return s.status === 'pending' || s.status === 'confirmed' || s.status === 'reschedule'; });
    else filtered = all.filter(function (s) { return s.status === 'completed' || s.status === 'cancelled' || s.status === 'rejected'; });

    var box = document.getElementById('sessions-list');
    if (!filtered.length) {
        box.innerHTML = '<p class="empty-state">No sessions in this list yet</p>';
        return;
    }
    box.innerHTML = filtered.map(sessionCardHtml).join('');
}

function sessionCardHtml(session) {
    var other = currentUser.role === 'mentor' ? userById(session.studentId) : userById(session.mentorId);
    var name = other ? other.firstName + ' ' + other.lastName : 'Unknown';
    var actions = '';
    if (currentUser.role === 'mentor' && session.status === 'pending') {
        actions = '<button class="btn btn-primary btn-sm" onclick="acceptBooking(\'' + session.id + '\')">Accept</button>' +
            '<button class="btn btn-outline btn-sm" onclick="rejectBooking(\'' + session.id + '\')">Reject</button>';
    }
    if (session.status === 'confirmed') {
        actions += '<button class="btn btn-outline btn-sm" onclick="rescheduleSession(\'' + session.id + '\')">Reschedule</button>' +
            '<button class="btn btn-outline btn-sm" onclick="cancelSession(\'' + session.id + '\')">Cancel</button>';
        if (currentUser.role === 'mentor') {
            actions += '<button class="btn btn-primary btn-sm" onclick="completeSession(\'' + session.id + '\')">Mark completed</button>';
        }
    }
    if (currentUser.role === 'student' && session.status === 'completed' && !session.reviewed) {
        actions += '<button class="btn btn-primary btn-sm" onclick="openReview(\'' + session.id + '\')">Write review</button>';
    }
    return '<div class="session-card">' +
        '<div><h4>' + (session.topic || 'Mentorship session') + '</h4>' +
        '<p>' + name + ' · ' + formatSessionWhen(session) + ' · ' + (session.callType === 'audio' ? 'Audio call' : 'Video call') + '</p>' +
        '<span class="status-pill ' + session.status + '">' + session.status + '</span></div>' +
        '<div class="session-actions">' + actions + '</div></div>';
}

function startBooking() {
    if (!currentUser || currentUser.role !== 'student') {
        showToast('Sign in as a student to book a session', 'error');
        return;
    }
    if (!currentViewingMentor) return;
    if (!canBookSession()) {
        showToast('Your free trial period is completed. Upgrade to continue learning.', 'error');
        navigateTo('plans-screen');
        return;
    }
    // Connect-first flow: a student must send a connect request and the mentor
    // must accept it before date/time booking is possible.
    var conn = getConnectionStatus(currentUser.id, currentViewingMentor.id);
    if (!conn || conn.status !== 'connected') {
        showToast('Send a connect request first — once the mentor accepts, you can pick a date and time.', 'error');
        return;
    }
    bookingDraft = { mentorId: currentViewingMentor.id };
    selectedBookingSlot = null;
    navigateTo('booking-screen');
}

function completedSessionsUsed() {
    if (!currentUser) return 0;
    return getSessions().filter(function (s) {
        return s.studentId === currentUser.id && s.status === 'completed';
    }).length;
}

function canBookSession() {
    var sub = getSub();
    if (isPremium()) return true;
    // Free trial: capped by completed sessions and by the trial window.
    if (completedSessionsUsed() >= (sub.sessionLimit || 2)) return false;
    if (Date.now() > (sub.trialEnds || 0)) return false;
    return true;
}

function renderBookingScreen() {
    if (!bookingDraft) return;
    var mentor = userById(bookingDraft.mentorId);
    document.getElementById('booking-mentor-name').textContent = mentor
        ? 'Book with ' + mentor.firstName + ' ' + mentor.lastName
        : 'Select a date and time';
    var dateInput = document.getElementById('booking-date');
    if (!dateInput.value) {
        var d = new Date();
        d.setDate(d.getDate() + 2);
        dateInput.value = d.toISOString().slice(0, 10);
    }
    renderBookingSlots();
}

function weekdayFromDate(iso) {
    var day = new Date(iso + 'T12:00:00').getDay();
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day];
}

function renderBookingSlots() {
    var date = document.getElementById('booking-date').value;
    var box = document.getElementById('booking-slots');
    if (!bookingDraft || !date) return;
    var day = weekdayFromDate(date);
    var avail = getAvailabilityMap()[bookingDraft.mentorId] || {};
    var slots = avail[day] || [];
    if (day === 'Sun' || day === 'Sat' || !slots.length) {
        box.innerHTML = '<p class="empty-state">No slots on this day. Try a weekday.</p>';
        return;
    }
    var taken = getSessions().filter(function (s) {
        return s.mentorId === bookingDraft.mentorId && s.date === date && (s.status === 'pending' || s.status === 'confirmed');
    }).map(function (s) { return s.time; });
    box.innerHTML = slots.map(function (slot) {
        var busy = taken.indexOf(slot) !== -1;
        var sel = selectedBookingSlot === slot;
        return '<button type="button" class="slot-btn' + (sel ? ' selected' : '') + '" ' + (busy ? 'disabled' : '') +
            ' onclick="selectedBookingSlot=\'' + slot + '\';renderBookingSlots()">' + slot + (busy ? ' booked' : '') + '</button>';
    }).join('');
}

function confirmBookingDraft() {
    var date = document.getElementById('booking-date').value;
    var callType = document.getElementById('booking-call-type').value;
    var topic = document.getElementById('booking-topic').value.trim();
    if (!selectedBookingSlot || !date) {
        showToast('Select a date and time slot', 'error');
        return;
    }
    bookingDraft.date = date;
    bookingDraft.time = selectedBookingSlot;
    bookingDraft.callType = callType === 'audio' ? 'audio' : 'video';
    bookingDraft.topic = topic || 'Mentorship session';
    navigateTo('booking-confirm-screen');
}

function renderBookingConfirm() {
    if (!bookingDraft) return;
    var mentor = userById(bookingDraft.mentorId);
    document.getElementById('booking-confirm-body').innerHTML =
        '<p><strong>Mentor:</strong> ' + (mentor ? mentor.firstName + ' ' + mentor.lastName : '') + '</p>' +
        '<p><strong>Date:</strong> ' + bookingDraft.date + '</p>' +
        '<p><strong>Time:</strong> ' + bookingDraft.time + '</p>' +
        '<p><strong>Call type:</strong> ' + (bookingDraft.callType === 'audio' ? 'Audio call' : 'Video call') + '</p>' +
        '<p><strong>Topic:</strong> ' + bookingDraft.topic + '</p>' +
        '<p>The mentor will accept or reject this request.</p>';
}

function submitBooking() {
    if (!bookingDraft || !currentUser) return;
    if (!canBookSession()) {
        showToast('Your free trial period is completed. Upgrade to continue learning.', 'error');
        navigateTo('plans-screen');
        return;
    }
    // Defense-in-depth: booking still requires an accepted connection.
    var conn = getConnectionStatus(currentUser.id, bookingDraft.mentorId);
    if (!conn || conn.status !== 'connected') {
        showToast('Connect request not accepted yet — the mentor must accept before booking.', 'error');
        return;
    }
    var sessions = getSessions();
    // Guard against creating a duplicate booking for the same slot
    // (double-submits, re-using the booking flow for an already-booked slot).
    var duplicateSlot = sessions.some(function (s) {
        return s.mentorId === bookingDraft.mentorId &&
            s.date === bookingDraft.date &&
            s.time === bookingDraft.time &&
            ['pending', 'confirmed', 'reschedule'].indexOf(s.status) !== -1;
    });
    if (duplicateSlot) {
        showToast('You already have a booking for this slot', 'error');
        openSessionsScreen();
        return;
    }
    sessions.push({
        id: generateId(),
        studentId: currentUser.id,
        mentorId: bookingDraft.mentorId,
        date: bookingDraft.date,
        time: bookingDraft.time,
        callType: bookingDraft.callType || 'video',
        topic: bookingDraft.topic,
        status: 'pending',
        reviewed: false,
        createdAt: new Date().toISOString()
    });
    saveSessions(sessions);
    ucPushNotification([bookingDraft.mentorId], 'session-request', 'New session request',
        (currentUser ? currentUser.firstName + ' ' + currentUser.lastName : 'A student') + ' requested ' +
        (bookingDraft.topic || 'a mentorship session') + ' on ' + bookingDraft.date + ' at ' + bookingDraft.time + '.');
    showToast('Booking sent. Waiting for mentor confirmation.', 'success');
    openSessionsScreen();
}

function acceptBooking(id) {
    updateSession(id, { status: 'confirmed' });
    var session = getSessions().find(function (s) { return s.id === id; });
    if (session) {
        bumpUserSessions(session.studentId);
        bumpUserSessions(session.mentorId);
    }
    showToast('Session accepted', 'success');
    renderSessionsScreen();
    if (typeof renderMentorStudentRequests === 'function') renderMentorStudentRequests();
}

function bumpUserSessions(userId) {
    var users = getUsers();
    var i = users.findIndex(function (u) { return u.id === userId; });
    if (i === -1) return;
    users[i].sessions = (users[i].sessions || 0) + 1;
    saveUsers(users);
    if (currentUser && currentUser.id === userId) {
        currentUser = users[i];
        saveCurrentUser(currentUser);
    }
}

function rejectBooking(id) {
    updateSession(id, { status: 'rejected' });
    showToast('Booking rejected', 'info');
    renderSessionsScreen();
    if (typeof renderMentorStudentRequests === 'function') renderMentorStudentRequests();
}

function cancelSession(id) {
    updateSession(id, { status: 'cancelled' });
    showToast('Session cancelled', 'info');
    renderSessionsScreen();
}

function rescheduleSession(id) {
    var sessions = getSessions();
    var s = sessions.find(function (x) { return x.id === id; });
    if (!s) return;
    var next = prompt('New time (HH:MM), same date ' + s.date, s.time);
    if (!next) return;
    s.time = next;
    s.status = 'confirmed';
    saveSessions(sessions);
    ucPushNotification([s.studentId, s.mentorId], 'session-confirmed', 'Session rescheduled',
        (s.topic || 'Mentorship session') + ' on ' + s.date + ' was rescheduled to ' + s.time + '.');
    showToast('Session rescheduled', 'success');
    renderSessionsScreen();
}

function completeSession(id) {
    updateSession(id, { status: 'completed', completedAt: new Date().toISOString() });
    showToast('Session marked complete. Student can now leave a review.', 'success');
    renderSessionsScreen();
}

function updateSession(id, patch) {
    var sessions = getSessions();
    var i = sessions.findIndex(function (s) { return s.id === id; });
    if (i === -1) return;
    Object.assign(sessions[i], patch);
    saveSessions(sessions);
    ucSessionStatusHook(sessions[i], patch.status);
}

function openReview(id) {
    reviewSessionId = id;
    navigateTo('review-session-screen');
}

function renderReviewScreen() {
    var session = getSessions().find(function (s) { return s.id === reviewSessionId; });
    if (!session) return;
    var mentor = userById(session.mentorId);
    document.getElementById('review-mentor-label').textContent = 'How was your session with ' + (mentor ? mentor.firstName : 'your mentor') + '?';
    var stars = document.getElementById('review-stars');
    stars.dataset.rating = stars.dataset.rating || '5';
    stars.innerHTML = [1, 2, 3, 4, 5].map(function (n) {
        return '<button type="button" class="star' + (n <= Number(stars.dataset.rating) ? ' on' : '') + '" onclick="setReviewStars(' + n + ')">★</button>';
    }).join('');
}

function setReviewStars(n) {
    document.getElementById('review-stars').dataset.rating = String(n);
    renderReviewScreen();
}

function submitReview() {
    var session = getSessions().find(function (s) { return s.id === reviewSessionId; });
    if (!session) return;
    var rating = Number(document.getElementById('review-stars').dataset.rating || 5);
    var text = document.getElementById('review-text').value.trim();
    var reviews = getReviews();
    reviews.push({
        id: generateId(),
        sessionId: session.id,
        studentId: currentUser.id,
        mentorId: session.mentorId,
        rating: rating,
        text: text,
        createdAt: new Date().toISOString()
    });
    saveReviews(reviews);
    ucPushNotification([session.mentorId], 'review', 'New review received',
        (currentUser ? currentUser.firstName : 'A student') + ' left a ' + rating + '-star review for your session on ' + session.date + '.');
    updateSession(session.id, { reviewed: true });
    var users = getUsers();
    var mi = users.findIndex(function (u) { return u.id === session.mentorId; });
    if (mi !== -1) {
        var mentorReviews = reviews.filter(function (r) { return r.mentorId === session.mentorId; });
        var avg = mentorReviews.reduce(function (a, r) { return a + r.rating; }, 0) / mentorReviews.length;
        users[mi].rating = Math.round(avg * 10) / 10;
        saveUsers(users);
    }
    showToast('Thanks for your review', 'success');
    sessionsTab = 'history';
    openSessionsScreen();
}

function renderAvailability() {
    if (!currentUser) return;
    var map = getAvailabilityMap();
    if (!map[currentUser.id]) {
        map[currentUser.id] = { Mon: DEFAULT_SLOTS.slice(), Tue: DEFAULT_SLOTS.slice(), Wed: DEFAULT_SLOTS.slice(), Thu: DEFAULT_SLOTS.slice(), Fri: DEFAULT_SLOTS.slice() };
        saveAvailabilityMap(map);
    }
    // Work on a draft: changes apply only when the mentor clicks "Save Changes".
    availabilityDraft = JSON.parse(JSON.stringify(map[currentUser.id]));
    renderAvailabilityDraft();
}

function renderAvailabilityDraft() {
    if (!currentUser || !availabilityDraft) return;
    var html = WEEKDAYS.map(function (day) {
        var on = (availabilityDraft[day] || []).map(function (slot) {
            return '<label class="slot-check"><input type="checkbox" checked onchange="toggleAvailSlotDraft(\'' + day + '\',\'' + slot + '\')"> ' + slot + '</label>';
        }).join('');
        var off = DEFAULT_SLOTS.filter(function (s) { return (availabilityDraft[day] || []).indexOf(s) === -1; }).map(function (slot) {
            return '<label class="slot-check"><input type="checkbox" onchange="toggleAvailSlotDraft(\'' + day + '\',\'' + slot + '\')"> ' + slot + '</label>';
        }).join('');
        return '<div class="avail-day"><h4>' + day + '</h4><div class="slot-grid">' + on + off + '</div></div>';
    }).join('');
    document.getElementById('availability-editor').innerHTML = html;
}

function toggleAvailSlotDraft(day, slot) {
    if (!currentUser || !availabilityDraft) return;
    var list = availabilityDraft[day] || [];
    var idx = list.indexOf(slot);
    if (idx === -1) list.push(slot);
    else list.splice(idx, 1);
    list.sort();
    availabilityDraft[day] = list;
}

function saveAvailabilityChanges() {
    if (!currentUser || !availabilityDraft) {
        showToast('Nothing to save yet', 'info');
        return;
    }
    var map = getAvailabilityMap();
    map[currentUser.id] = availabilityDraft;
    saveAvailabilityMap(map);
    showToast('Availability saved. Students can book your updated slots.', 'success');
}

function resetAvailabilityChanges() {
    if (!currentUser) return;
    var map = getAvailabilityMap();
    availabilityDraft = map[currentUser.id] ? JSON.parse(JSON.stringify(map[currentUser.id])) : null;
    renderAvailabilityDraft();
    showToast('Changes reverted to your last saved availability.', 'info');
}

function renderCareerProfile() {
    var p = getCareerProfile();
    var cur = CAREER_FIELDS[p.currentField];
    var tgt = CAREER_FIELDS[p.targetField];
    var c = document.getElementById('career-current-summary');
    var t = document.getElementById('career-target-summary');
    if (c) c.textContent = cur ? cur.name : 'Select your current career';
    if (t) t.textContent = tgt ? tgt.name : 'Choose where you want to go';
}

function renderFieldPicker(kind) {
    var p = getCareerProfile();
    var selected = kind === 'current' ? p.currentField : p.targetField;
    var html = Object.keys(CAREER_FIELDS).map(function (id) {
        var f = CAREER_FIELDS[id];
        return '<button class="field-card' + (selected === id ? ' selected' : '') + '" onclick="selectCareerField(\'' + kind + '\',\'' + id + '\')"><h3>' + f.name + '</h3><p>' + f.skills.slice(0, 4).join(' · ') + '</p></button>';
    }).join('');
    document.getElementById(kind === 'current' ? 'current-field-list' : 'target-field-list').innerHTML = html;
}

function selectCareerField(kind, id) {
    var p = getCareerProfile();
    if (kind === 'current') p.currentField = id;
    else p.targetField = id;
    saveCareerProfile(p);
    showToast((kind === 'current' ? 'Current' : 'Target') + ' field saved', 'success');
    if (kind === 'current') navigateTo('career-target-screen');
    else openCareerAnalysis();
}

function openCareerAnalysis() {
    var p = getCareerProfile();
    if (!p.currentField || !p.targetField) {
        showToast('Select current and target fields first', 'info');
        navigateTo('career-current-screen');
        return;
    }
    navigateTo('career-analysis-screen');
}

function analyzeTransition() {
    var p = getCareerProfile();
    var from = CAREER_FIELDS[p.currentField];
    var to = CAREER_FIELDS[p.targetField];
    if (!from || !to) return { transferable: [], missing: [] };
    var transferable = to.skills.filter(function (s) { return from.skills.indexOf(s) !== -1; });
    var missing = to.skills.filter(function (s) { return from.skills.indexOf(s) === -1; });
    return { from: from, to: to, transferable: transferable, missing: missing };
}

function renderCareerAnalysis() {
    var result = analyzeTransition();
    if (!result.from) return;
    document.getElementById('analysis-subtitle').textContent = result.from.name + ' → ' + result.to.name;
    document.getElementById('transferable-skills').innerHTML = result.transferable.map(function (s) { return '<span class="skill-tag">' + s + '</span>'; }).join('') || '<p class="empty-state">Building a fresh skill set</p>';
    document.getElementById('missing-skills').innerHTML = result.missing.map(function (s) { return '<span class="skill-tag">' + s + '</span>'; }).join('');
    var mentors = getUsers().filter(function (u) {
        return u.role === 'mentor' && (u.skills || []).some(function (s) { return result.missing.indexOf(s) !== -1 || (u.skills || []).indexOf('Figma') !== -1; });
    });
    var rec = document.getElementById('career-recommended-mentors');
    rec.innerHTML = mentors.slice(0, 4).map(function (m) {
        var badge = m.verified ? ' <span class="verified-badge">Verified</span>' : '';
        return '<div class="mentor-card" onclick="viewMentorDetail(\'' + m.id + '\')"><div class="mentor-card-info"><h4>' + m.firstName + ' ' + m.lastName + badge + '</h4><p>' + (m.position || 'Mentor') + '</p></div></div>';
    }).join('') || '<p class="empty-state">No matching mentors yet</p>';
    var comm = typeof DEFAULT_COMMUNITIES !== 'undefined' ? DEFAULT_COMMUNITIES.filter(function (c) {
        return result.to.name.indexOf('UI') !== -1 ? c.id === 'uiux' || c.id === 'pm' : true;
    }) : [];
    document.getElementById('career-recommended-communities').innerHTML = comm.slice(0, 3).map(function (c) {
        return '<div class="community-mini">' + c.icon + ' ' + c.name + '</div>';
    }).join('');
}

function renderRoadmap() {
    var result = analyzeTransition();
    if (!result.to) {
        document.getElementById('roadmap-steps').innerHTML = '<p class="empty-state">Complete your career profile first</p>';
        return;
    }
    var steps = [
        { title: 'Map your transferable strengths', detail: 'You already bring ' + (result.transferable.join(', ') || 'core problem-solving') + '.' },
        { title: 'Close skill gaps', detail: 'Focus next on: ' + result.missing.join(', ') + '.' },
        { title: 'Build proof of work', detail: 'Ship 2–3 case studies that show research, wireframes, and UI.' },
        { title: 'Learn with a mentor', detail: 'Book sessions with a ' + result.to.name + ' mentor for critiques.' },
        { title: 'Join the community', detail: 'Share work in the ' + result.to.name + ' community and collect feedback.' }
    ];
    document.getElementById('roadmap-steps').innerHTML = steps.map(function (s, i) {
        return '<div class="roadmap-step"><div class="step-num">' + (i + 1) + '</div><div><h4>' + s.title + '</h4><p>' + s.detail + '</p></div></div>';
    }).join('');
}

function renderSkillsProgress() {
    var p = getCareerProfile();
    var result = analyzeTransition();
    var skills = result.missing.length ? result.missing : (result.to ? result.to.skills : []);
    document.getElementById('skills-progress-list').innerHTML = skills.map(function (skill) {
        var val = p.skillProgress[skill] || 0;
        return '<div class="progress-row"><span>' + skill + '</span><input type="range" min="0" max="100" value="' + val + '" onchange="updateSkillProgress(\'' + skill + '\', this.value)"><em>' + val + '%</em></div>';
    }).join('') || '<p class="empty-state">Set a target career first</p>';
}

function updateSkillProgress(skill, value) {
    var p = getCareerProfile();
    p.skillProgress[skill] = Number(value);
    saveCareerProfile(p);
    renderSkillsProgress();
}

function renderMilestones() {
    var p = getCareerProfile();
    if (!p.milestones.length) {
        p.milestones = [
            { id: generateId(), title: 'Choose a target career', done: !!p.targetField },
            { id: generateId(), title: 'Complete first skill sprint', done: false },
            { id: generateId(), title: 'Book a mentor session in your target field', done: false }
        ];
        saveCareerProfile(p);
    }
    document.getElementById('milestones-list').innerHTML = p.milestones.map(function (m) {
        return '<label class="milestone"><input type="checkbox" ' + (m.done ? 'checked' : '') + ' onchange="toggleMilestone(\'' + m.id + '\')"> ' + m.title + '</label>';
    }).join('');
}

function toggleMilestone(id) {
    var p = getCareerProfile();
    p.milestones = p.milestones.map(function (m) {
        if (m.id === id) m.done = !m.done;
        return m;
    });
    saveCareerProfile(p);
    renderMilestones();
}

/* ========================================
   MENTOR AI — conversational career coach
   Gemini-powered when the API server is
   running, with a built-in offline coach
   as automatic fallback. Chat realism:
   memory, typing indicator, typewriter
   reveal, quick replies, action chips.
   ======================================== */

var aiQueue = [];
var aiBusy = false;
var aiPauseTimer = null;
var aiTypeTimer = null;

function aiChatKey() { return 'mentorconnect_ai_chat_' + (currentUser ? currentUser.id : 'guest'); }
function aiNewChat() { return { messages: [], lastIntent: '', pending: '', lastTopicAt: 0 }; }
function aiGetChat() { return lsGet(aiChatKey(), null) || aiNewChat(); }
function aiSaveChat(chat) { lsSet(aiChatKey(), chat); }

function toggleAiPanel() {
    if (!currentUser) {
        showToast('Sign in to use the AI career coach', 'info');
        return;
    }
    var panel = document.getElementById('ai-panel');
    if (!panel) return;
    var opening = !panel.classList.contains('open');
    panel.classList.toggle('open');
    if (!opening) return;
    var chat = aiGetChat();
    renderAiHistory(chat);
    var away = Date.now() - (chat.lastTopicAt || 0);
    if (!chat.messages.length) aiEnqueue(aiGreeting(chat, false));
    else if (away > 30 * 60 * 1000) aiEnqueue(aiGreeting(chat, true));
    var input = document.getElementById('ai-input');
    if (input) input.focus();
    aiCheckGeminiStatus();
}

function aiCheckGeminiStatus() {
    if (!window.fetch) { aiSetPowerLabel(false); return; }
    fetch('/api/ai/status').then(function (res) { return res.json(); }).then(function (data) {
        aiSetPowerLabel(!!(data && data.configured));
    }).catch(function () { aiSetPowerLabel(false); });
}

function aiSetPowerLabel(gemini) {
    var el = document.getElementById('ai-power-label');
    if (el) el.textContent = gemini ? 'Online · Gemini' : 'Online · offline coach';
}

function clearAiChat() {
    var chat = aiNewChat();
    aiSaveChat(chat);
    aiQueue = [];
    aiBusy = false;
    renderAiHistory(chat);
    aiEnqueue(aiGreeting(chat, false));
}

function askAiPreset(text) {
    document.getElementById('ai-input').value = text;
    submitAiQuestion({ preventDefault: function () {} });
}

function submitAiQuestion(event) {
    event.preventDefault();
    var input = document.getElementById('ai-input');
    var q = (input.value || '').trim();
    if (!q) return;
    input.value = '';
    var chat = aiGetChat();
    chat.messages.push({ role: 'user', text: q, ts: Date.now() });
    aiSaveChat(chat);
    appendAiMessage('user', q, { ts: Date.now() });
    var sub = getSub();
    sub.aiUses = (sub.aiUses || 0) + 1;
    saveSub(sub);
    aiRespond(q, chat);
}

function renderAiHistory(chat) {
    aiQueue = [];
    aiBusy = false;
    if (aiPauseTimer) { clearTimeout(aiPauseTimer); aiPauseTimer = null; }
    if (aiTypeTimer) { clearTimeout(aiTypeTimer); aiTypeTimer = null; }
    var box = document.getElementById('ai-messages');
    if (!box) return;
    box.innerHTML = '';
    chat.messages.forEach(function (m) {
        appendAiMessage(m.role, m.text, { ts: m.ts, instant: true });
    });
    aiSetSuggestedVisibility(chat);
    box.scrollTop = box.scrollHeight;
}

function aiSetSuggestedVisibility(chat) {
    var el = document.getElementById('ai-suggested');
    if (el) el.style.display = chat.messages.length ? 'none' : 'flex';
}

function aiGreeting(chat, returning) {
    var name = currentUser ? currentUser.firstName : 'there';
    var p = aiCoachProfile();
    var text;
    if (returning && chat.lastIntent) {
        text = 'Welcome back, ' + name + '! Last time we were on ' + aiIntentLabel(chat.lastIntent) + '. Want to pick that up, or is something new on your mind?';
    } else if (returning) {
        text = 'Good to see you again, ' + name + '. Roadmaps, skills, resumes, mentors — where were we?';
    } else {
        var intro = p.from && p.to
            ? 'I can see you\'re moving from ' + p.from.name + ' toward ' + p.to.name + ' — solid choice.'
            : 'I help you pick a direction and plan the road there.';
        text = 'Hey ' + name + ' 👋 I\'m Mentor AI, your career coach. ' + intro + ' Ask me anything, or tap a suggestion below.';
    }
    return {
        text: text,
        actions: p.total ? [{ label: 'My milestones', act: 'nav:career-milestones-screen' }] : [{ label: 'Set my career fields', act: 'nav:career-profile-screen' }],
        quick: ['Build me a career roadmap', 'Which skills should I learn next?', 'Recommend mentors', 'I feel stuck'],
        intent: 'greeting',
        pending: ''
    };
}

function aiEnqueue(turn) {
    aiQueue.push(turn);
    aiProcessQueue();
}

function aiProcessQueue() {
    if (aiBusy || !aiQueue.length) return;
    aiBusy = true;
    var turn = aiQueue.shift();
    var panel = document.getElementById('ai-panel');
    var visible = panel && panel.classList.contains('open');
    var pause = visible ? 380 + Math.round(Math.random() * 480) : 0;
    var typing = visible ? Math.min(2400, 620 + turn.text.length * 13) + Math.round(Math.random() * 320) : 0;
    aiPauseTimer = setTimeout(function () {
        showAiTyping(true);
        aiTypeTimer = setTimeout(function () {
            showAiTyping(false);
            appendAiMessage('assistant', turn.text, turn);
            aiBusy = false;
            aiProcessQueue();
        }, typing);
    }, pause);
}

function showAiTyping(on) {
    var box = document.getElementById('ai-messages');
    if (!box) return;
    var existing = document.getElementById('ai-typing-row');
    if (existing) existing.remove();
    if (!on) return;
    var row = document.createElement('div');
    row.className = 'ai-msg-row assistant';
    row.id = 'ai-typing-row';
    var bubble = document.createElement('div');
    bubble.className = 'ai-typing';
    bubble.setAttribute('aria-label', 'Mentor AI is typing');
    for (var i = 0; i < 3; i++) {
        var dot = document.createElement('span');
        dot.className = 'ai-dot';
        bubble.appendChild(dot);
    }
    row.appendChild(bubble);
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
}

function appendAiMessage(role, text, opts) {
    var box = document.getElementById('ai-messages');
    if (!box) return null;
    opts = opts || {};
    var row = document.createElement('div');
    row.className = 'ai-msg-row ' + role;
    var bubble = document.createElement('div');
    bubble.className = 'ai-msg ' + role;
    var body = document.createElement('div');
    body.className = 'ai-msg-text';
    bubble.appendChild(body);
    if (opts.ts) {
        var meta = document.createElement('span');
        meta.className = 'ai-msg-time';
        meta.textContent = aiFormatTime(opts.ts);
        bubble.appendChild(meta);
    }
    row.appendChild(bubble);
    if (role === 'assistant' && opts.actions && opts.actions.length) {
        var actions = document.createElement('div');
        actions.className = 'ai-msg-actions';
        opts.actions.forEach(function (a) { aiAddChip(actions, a.label, 'action', a.act); });
        row.appendChild(actions);
    }
    if (role === 'assistant' && opts.quick && opts.quick.length) {
        var quick = document.createElement('div');
        quick.className = 'ai-quick';
        opts.quick.forEach(function (t) { aiAddChip(quick, t, 'ask', t); });
        row.appendChild(quick);
    }
    box.appendChild(row);
    if (role === 'assistant' && !opts.instant) {
        aiTypewriter(body, text, box);
    } else {
        body.textContent = text;
        box.scrollTop = box.scrollHeight;
    }
    return row;
}

function aiTypewriter(el, text, box) {
    var i = 0;
    var chunk = text.length > 400 ? 4 : 2;
    var speed = text.length > 400 ? 10 : 14;
    var timer = setInterval(function () {
        i += chunk;
        if (i >= text.length) {
            clearInterval(timer);
            el.textContent = text;
            box.scrollTop = box.scrollHeight;
            return;
        }
        el.textContent = text.slice(0, i);
        if (box.scrollHeight - box.scrollTop - box.clientHeight < 140) box.scrollTop = box.scrollHeight;
    }, speed);
}

function aiFormatTime(ts) {
    try {
        return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
}

function aiAddChip(parent, label, type, value) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'ai-chip' + (type === 'action' ? ' action' : '');
    b.textContent = label;
    b.onclick = function () {
        if (type !== 'ask') b.disabled = true;
        aiRunAction(type, value);
    };
    parent.appendChild(b);
}

function aiRunAction(type, value) {
    if (type === 'ask') {
        var input = document.getElementById('ai-input');
        if (input) input.value = value;
        submitAiQuestion({ preventDefault: function () {} });
        return;
    }
    var panel = document.getElementById('ai-panel');
    if (panel) panel.classList.remove('open');
    if (type === 'nav') {
        navigateTo(value);
        return;
    }
    if (type === 'search') {
        if (typeof searchByDomain === 'function') searchByDomain(value);
        return;
    }
    if (type === 'call') {
        var parts = String(value).split('|');
        var fn = window[parts[0]];
        if (typeof fn === 'function') fn(parts[1]);
    }
}

function aiRespond(question, chat) {
    // Gemini first; the offline coach composes the fallback (and supplies
    // action chips / quick replies either way).
    var fallback = aiComposeReply(question, chat);
    aiAskGemini(question, chat, function (err, text) {
        var turn;
        if (!err && text) {
            turn = {
                text: text,
                actions: fallback.actions,
                quick: fallback.quick,
                intent: fallback.intent,
                pending: fallback.pending
            };
        } else {
            turn = fallback;
        }
        chat.lastIntent = turn.intent || chat.lastIntent;
        chat.pending = turn.pending || '';
        chat.lastTopicAt = Date.now();
        chat.messages.push({ role: 'assistant', text: turn.text, ts: Date.now() });
        if (chat.messages.length > 60) chat.messages = chat.messages.slice(-60);
        aiSaveChat(chat);
        aiSetSuggestedVisibility(chat);
        aiEnqueue(turn);
    });
}

function aiAskGemini(question, chat, callback) {
    if (!window.fetch) { callback(new Error('no-fetch')); return; }
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 25000) : null;
    fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: question,
            history: chat.messages.slice(-10).map(function (m) {
                return { role: m.role === 'user' ? 'user' : 'assistant', text: m.text };
            }),
            profile: aiProfileContext()
        }),
        signal: controller ? controller.signal : undefined
    }).then(function (res) { return res.json(); }).then(function (data) {
        if (timer) clearTimeout(timer);
        if (data && data.ok && data.reply) callback(null, data.reply);
        else callback(new Error((data && data.error) || 'gemini-failed'));
    }).catch(function (err) {
        if (timer) clearTimeout(timer);
        callback(err);
    });
}

function aiProfileContext() {
    var p = aiCoachProfile();
    return {
        name: currentUser ? (currentUser.firstName + ' ' + currentUser.lastName) : '',
        currentField: p.from ? p.from.name : '',
        targetField: p.to ? p.to.name : '',
        transferableSkills: p.result.transferable,
        missingSkills: p.result.missing,
        skillProgress: p.fields.skillProgress || {},
        milestones: { done: p.done, total: p.total },
        plan: p.sub.plan,
        upcomingSessions: p.upcomingList,
        mentors: p.mentors.slice(0, 6).map(function (m) {
            return m.firstName + ' ' + m.lastName + (m.position ? ' — ' + m.position : '') + (m.skills && m.skills.length ? ' [' + m.skills.slice(0, 4).join(', ') + ']' : '');
        })
    };
}

function aiTokens(q) {
    return q.toLowerCase().replace(/[^a-z0-9'/\s-]/g, ' ').split(/\s+/).filter(Boolean);
}

function aiDetectIntent(question) {
    var q = question.toLowerCase().trim();
    if (q.length <= 26 && /^(yes|yep|yeah|sure|ok|okay|pls|please|go on|continue|more|tell me more|elaborate|explain|and then|what else|next|sounds good|alright|cool)\b/.test(q)) return 'followup';
    var tokens = aiTokens(q);
    var best = '', bestScore = 0;
    AI_INTENTS.forEach(function (intent) {
        var score = 0;
        intent.kw.forEach(function (k) {
            if (k.indexOf(' ') !== -1 || k.indexOf('/') !== -1) {
                if (q.indexOf(k) !== -1) score += 3;
                return;
            }
            for (var i = 0; i < tokens.length; i++) {
                if (tokens[i] === k || (tokens[i].indexOf(k) === 0 && tokens[i].length <= k.length + 3)) { score += 1; break; }
            }
        });
        if (score > bestScore) { bestScore = score; best = intent.id; }
    });
    return bestScore > 0 ? best : 'fallback';
}

function aiComposeReply(question, chat) {
    var p = aiCoachProfile();
    var intent = aiDetectIntent(question);
    if (intent === 'followup') {
        var deeper = aiFollowUp(chat, p);
        deeper.intent = chat.lastIntent || 'followup';
        return deeper;
    }
    if (chat.pending === 'blocker' && (intent === 'fallback' || intent === 'motivation' || intent === 'time' || intent === 'skills')) {
        var answer = aiAnswerBlocker(question, p);
        answer.intent = 'blocker';
        return answer;
    }
    var builder = AI_BUILDERS[intent] || AI_BUILDERS.fallback;
    var turn = builder(p, chat, false);
    turn.intent = intent;
    return turn;
}

function aiFollowUp(chat, p) {
    var id = chat.lastIntent;
    if (id && AI_BUILDERS[id]) {
        var turn = AI_BUILDERS[id](p, chat, true);
        turn.text = 'Going deeper: ' + turn.text;
        return turn;
    }
    return aiBuild(['Sure —'], ['What should we dig into? I can coach you through roadmaps, skills, resumes, portfolios, interviews, mentors, sessions, and plans.'], [], null, ['Build me a career roadmap', 'Which skills should I learn next?', 'Recommend mentors']);
}

function aiAnswerBlocker(question, p) {
    var t = question.toLowerCase();
    var line;
    if (/\btime\b|\bbusy\b|schedule|\bwork\b|\bjob\b|hours/.test(t)) {
        line = 'Time is the usual suspect. Try 30-minute blocks attached to something you already do daily, and drop perfection on the output — consistency will pull you forward.';
    } else if (/skill|learn|understand|how do i|where do i start/.test(t)) {
        line = 'Skill overload is real. Pick ONE from ' + (p.result.missing.slice(0, 2).join(' and ') || 'your gap list') + ' and deliberately ignore the rest for two weeks. Depth first, breadth later.';
    } else if (/scared|afraid|doubt|confiden|imposter|fail|anxious|nervous/.test(t)) {
        line = 'That doubt usually shows up right before growth. Log small wins here — milestones, skills, sessions — and let the evidence argue against the fear.';
    } else if (/money|cost|expensive|afford|budget|price/.test(t)) {
        line = 'Budget-wise: the free plan covers your first sessions, communities are free coaching, and you should only upgrade when you\'re booking weekly.';
    } else {
        line = 'Thanks for naming it — a blocker you can say out loud is already half-solved. Let\'s turn it into one small step for this week.';
    }
    return aiBuild([], [line], ['Want me to fold that into a weekly plan?'], null, ['Build me a career roadmap', 'Which skills first?', 'Recommend mentors']);
}

function aiIntentLabel(id) {
    var labels = {
        skills: 'which skills to learn next', roadmap: 'your step-by-step roadmap', mentors: 'finding the right mentor',
        resume: 'resume framing', portfolio: 'building your portfolio', interview: 'interview prep',
        motivation: 'staying motivated', sessions: 'booking sessions', pricing: 'plans and pricing',
        community: 'joining communities', time: 'finding time to learn', salary: 'negotiating offers',
        network: 'growing your network', fields: 'your career transition', progress: 'your progress',
        howareyou: 'checking in', greeting: 'getting started', aboutyou: 'what I can do', thanks: 'your goals'
    };
    return labels[id] || 'your career plans';
}

function aiPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function aiBuild(acks, bodies, closers, actions, quick, pending) {
    var ack = acks && acks.length ? aiPick(acks) + ' ' : '';
    var closer = closers && closers.length ? ' ' + aiPick(closers) : '';
    return { text: ack + aiPick(bodies) + closer, actions: actions || [], quick: quick || [], pending: pending || '' };
}

function aiCoachProfile() {
    var p = getCareerProfile();
    var from = CAREER_FIELDS[p.currentField];
    var to = CAREER_FIELDS[p.targetField];
    var result = analyzeTransition();
    var sub = getSub();
    var done = (p.milestones || []).filter(function (m) { return m.done; }).length;
    var vals = Object.keys(p.skillProgress || {}).map(function (k) { return Number(p.skillProgress[k]) || 0; });
    var avg = vals.length ? Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length) : 0;
    var toSkills = to ? to.skills : [];
    var ups = getSessions().filter(function (s) {
        return currentUser && s.studentId === currentUser.id && (s.status === 'pending' || s.status === 'confirmed');
    });
    var domainMap = { 'Software Engineering': 'Web Development', 'UI/UX Design': 'UI/UX Design', 'Data Science': 'Data Science', 'Product Management': 'Product Management' };
    return {
        fields: p,
        from: from,
        to: to,
        result: result,
        sub: sub,
        done: done,
        total: (p.milestones || []).length,
        avg: avg,
        mentors: getUsers().filter(function (u) {
            return u.role === 'mentor' && u.id !== (currentUser && currentUser.id) && (!toSkills.length || (u.skills || []).some(function (s) { return toSkills.indexOf(s) !== -1; }));
        }),
        upcoming: ups.length,
        upcomingList: ups.map(function (s) { return (s.topic || 'Mentorship session') + ' on ' + s.date + ' at ' + s.time + ' (' + s.status + ')'; }),
        domain: to ? (domainMap[to.name] || to.name) : ''
    };
}

var AI_INTENTS = [
    { id: 'skills', kw: ['skill', 'learn', 'learning', 'study', 'practice', 'master', 'course', 'certification', 'which skills', 'what should i learn', 'start with'] },
    { id: 'roadmap', kw: ['roadmap', 'step by step', 'steps', 'transition', 'switch', 'career change', 'change career', 'become a', 'path', 'plan for', 'move to', 'get into', 'goal'] },
    { id: 'mentors', kw: ['mentor', 'coach', 'recommend', 'who can help', 'guide me', 'expert', 'tutor', 'advisor', 'connect request'] },
    { id: 'sessions', kw: ['session', 'book', 'booking', 'appointment', 'availability', 'meeting', 'meet with', 'reschedule', 'cancel'] },
    { id: 'interview', kw: ['interview', 'behavioral', 'whiteboard', 'screening', 'mock'] },
    { id: 'portfolio', kw: ['portfolio', 'case study', 'project', 'proof of work', 'showcase'] },
    { id: 'resume', kw: ['resume', 'cv', 'cover letter', 'linkedin', 'my resume', 'update my resume', 'resume for'] },
    { id: 'network', kw: ['network', 'referral', 'reach out', 'cold message', 'meet people', 'events'] },
    { id: 'salary', kw: ['salary', 'compensation', 'negotiate', 'offer', 'pay', 'earn', 'rate'] },
    { id: 'motivation', kw: ['motivat', 'stuck', 'burnout', 'burned out', 'tired', 'lost', 'imposter', 'doubt', 'confiden', 'overwhelm', 'give up', 'procrastinat', 'discouraged', 'anxious', 'nervous', 'scared', 'afraid', 'lazy'] },
    { id: 'time', kw: ['time management', 'busy', 'balance', 'juggle', 'productive', 'focus', 'routine', 'habit', 'no time', 'daily plan'] },
    { id: 'community', kw: ['community', 'communities', 'group', 'forum', 'peer', 'meetup'] },
    { id: 'pricing', kw: ['price', 'pricing', 'cost', 'plan', 'premium', 'free', 'trial', 'upgrade', 'subscription', 'billing', 'expensive', 'refund', 'payment'] },
    { id: 'progress', kw: ['progress', 'milestone', 'how am i doing', 'track my', 'my status', 'review my'] },
    { id: 'fields', kw: ['ui/ux', 'ui ux', 'designer', 'design', 'software engineer', 'developer', 'data science', 'data scientist', 'product manager', 'product management', 'field', 'fields'] },
    { id: 'greeting', kw: ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'nice to meet', 'whats up', "what's up", 'yo'] },
    { id: 'howareyou', kw: ['how are you', 'hows it going', "how's it going", 'how you doing', 'how do you do', 'how is your day', 'you ok'] },
    { id: 'thanks', kw: ['thanks', 'thank you', 'thx', 'appreciate', 'helpful', 'that helped', 'makes sense', 'awesome', 'perfect'] },
    { id: 'aboutyou', kw: ['who are you', 'what are you', 'your name', 'are you human', 'are you real', 'are you ai', 'are you a bot', 'what can you do', 'about you', 'what do you do', 'gemini', 'powered by'] }
];

var AI_BUILDERS = {
    greeting: function (p) {
        var who = currentUser ? ', ' + currentUser.firstName : ' there';
        var intro = p.from && p.to
            ? 'I\'ve got your profile in view — moving from ' + p.from.name + ' toward ' + p.to.name + '.'
            : 'I can help you pick a direction and plan the road there.';
        return aiBuild(
            ['Hey' + who + ' 👋', 'Hi' + who + '!', 'Hello' + who + '!'],
            [intro + ' Roadmaps, skills, resumes, mentors — what are we working on today?', intro + ' Ask me anything, or tap a suggestion.'],
            [],
            null,
            ['Build me a career roadmap', 'Which skills should I learn next?', 'Recommend mentors', 'I feel stuck']
        );
    },
    howareyou: function (p) {
        var line = 'Never too busy for you';
        if (p.total) {
            line += ' — by the way, you\'re at ' + p.done + '/' + p.total + ' milestones' + (p.avg ? ' and averaging ' + p.avg + '% on skills' : '') + '.';
        } else {
            line += '.';
        }
        return aiBuild(
            ['I\'m doing great, thanks for asking!', 'Pretty good on my end!'],
            [line + ' More importantly — how are things going for you?'],
            [],
            null,
            ['I feel stuck', 'Build me a career roadmap', 'Which skills should I learn next?']
        );
    },
    thanks: function () {
        return aiBuild(
            ['Anytime!', 'Happy to help.', 'You got it.'],
            ['That\'s what I\'m here for — momentum is one small step at a time.'],
            ['What\'s next on your list?'],
            null,
            ['What should I do next?', 'Which skills should I learn next?', 'Recommend mentors']
        );
    },
    aboutyou: function () {
        return aiBuild(
            [],
            ['I\'m Mentor AI — the career coach built into MentorConnect. I know your profile, your skill gaps, and the mentors on the platform, and I turn that into roadmaps, resume feedback, and session plans. I can also coach you through motivation dips and timing. When the server has my Gemini brain connected, I can answer just about anything.'],
            ['What should we tackle first?'],
            null,
            ['Build me a career roadmap', 'Which skills should I learn next?', 'Recommend mentors']
        );
    },
    roadmap: function (p, chat, more) {
        var to = p.to ? p.to.name : 'your target field';
        var missing = p.result.missing.length ? p.result.missing.slice(0, 3).join(', ') : 'the core skills of ' + to;
        var body = more
            ? 'Run weekly loops: pick one skill, build one tiny artifact, show it to one person (community or mentor), fix one thing. After 4 loops, book a mentor critique and compare week 1 against week 4 — the delta keeps you honest.'
            : 'Here\'s the path I\'d run for ' + to + ': close the biggest gaps first (' + missing + '), then ship 2 small portfolio pieces, then get 2 mentor critiques to pressure-test everything. Short loops beat giant plans.';
        return aiBuild(
            ['Good question.', 'Let\'s map it out.', 'On it.'],
            [body],
            ['Want me to start you on step one?'],
            [{ label: 'Open roadmap', act: 'nav:career-roadmap-screen' }, { label: 'View skill gap', act: 'nav:career-analysis-screen' }],
            ['Which skills first?', 'How do I build a portfolio?', 'Recommend mentors']
        );
    },
    skills: function (p, chat, more) {
        var missing = p.result.missing.length ? p.result.missing : (p.to ? p.to.skills.slice(0, 4) : []);
        var first = missing[0] || 'the fundamentals';
        var body = more
            ? 'For ' + first + ', split practice 20% tutorials / 80% doing: learn one concept, immediately apply it to a real screen or dataset. Track it in Skills Progress so we can watch the curve move.'
            : 'Your priority list: ' + (missing.join(', ') || 'the fundamentals of your target field') + '. Start with ' + first + ' — it unlocks the others. 30 focused minutes a day beats a heroic weekend.';
        return aiBuild(
            ['Great question.', 'Let\'s prioritize.'],
            [body],
            ['Want a 2-week sprint plan for ' + first + '?'],
            [{ label: 'Track skills', act: 'nav:career-skills-progress-screen' }, { label: 'View skill gap', act: 'nav:career-analysis-screen' }],
            ['How long until I\'m job-ready?', 'Find a mentor to review my work', 'Build me a career roadmap']
        );
    },
    resume: function (p, chat, more) {
        var body = more
            ? 'Summary line template for a switcher: "' + (p.to ? p.to.name : 'Target role') + ' practitioner with ' + (p.from ? p.from.name : 'a technical') + ' roots — I bring [strength 1] and [strength 2] to [outcome you want]." Then 3 bullets per role, each ending in a number.'
            : 'Switcher resume rules: open with a summary that names the target role; translate ' + (p.from ? p.from.name : 'your old work') + ' into outcomes; add a Selected Projects section with 2–3 relevant pieces; mirror the exact skill keywords from the job post. One page stays king.';
        return aiBuild(
            ['Good one.', 'Let\'s make it sharp.'],
            [body],
            ['Want a mentor to tear it apart (kindly)?'],
            p.domain ? [{ label: 'Get a resume review', act: 'search:' + p.domain }] : null,
            ['Rewrite my summary line', 'Should I include old jobs?', 'Recommend mentors']
        );
    },
    portfolio: function (p, chat, more) {
        var body = more
            ? 'Case study skeleton: the problem in one sentence → your research (3 quotes or 3 data points) → 3 key decisions and why → the result, even a small one. Editing is the skill: if a slide doesn\'t change the reader\'s mind, cut it.'
            : 'Build 2 tight case studies, not 6 shallow projects: the problem, your research, 3 key decisions, and the result. For ' + (p.to ? p.to.name : 'your field') + ', the classic combo is one redesign of a familiar product plus one small original piece. Depth is what mentors and recruiters look for.';
        return aiBuild(
            [],
            [body],
            ['Want a case study template?'],
            p.domain ? [{ label: 'Get a portfolio review', act: 'search:' + p.domain }] : null,
            ['How do I structure a case study?', 'What should my first project be?', 'Recommend mentors']
        );
    },
    interview: function (p, chat, more) {
        var to = p.to ? p.to.name : 'your target role';
        var body = more
            ? 'For "why the switch?", use the connect-the-dots arc: what you did (' + (p.from ? p.from.name : 'your background') + '), the moment you realized you wanted ' + to + ', and the proof you\'ve built since. One story, 60 seconds, no apologizing.'
            : 'The switcher loop: one clean story for why you\'re moving to ' + to + ', two projects you can go deep on, and 5 STAR stories covering conflict, failure, and leadership. Then book a mock interview with a mentor — the highest-leverage hour you can buy.';
        return aiBuild(
            ['Let\'s get you ready.'],
            [body],
            ['Want to drill "why the switch?" together?'],
            p.domain ? [{ label: 'Find mentors', act: 'search:' + p.domain }] : null,
            ['Run a mock interview with me', 'How do I answer salary expectations?', 'Recommend mentors']
        );
    },
    network: function (p, chat, more) {
        var body = more
            ? 'First-message formula: 1 line about what you\'re building, 1 specific question, 1 reason they\'re the right person. Keep it under 80 words — busy people reply to short, specific notes.'
            : 'Warm networks beat cold applications. Start inside the platform: join your target community, comment on people\'s work, then reach out to 2–3 mentors with one specific question each. Specific beats polite, every time.';
        var actions = [{ label: 'Open communities', act: 'nav:community-home-screen' }];
        if (p.domain) actions.push({ label: 'Find mentors', act: 'search:' + p.domain });
        return aiBuild(['Smart move.'], [body], [], actions, ['How do I write a good first message?', 'Recommend mentors']);
    },
    salary: function (p, chat, more) {
        var body = more
            ? 'Script when they ask first: "Based on the market band for this role and what I bring from ' + (p.from ? p.from.name : 'my background') + ', I\'m targeting X — but I\'m flexible on structure." Then stop talking. Silence is leverage.'
            : 'When switching fields, anchor on the value you already carry from ' + (p.from ? p.from.name : 'your background') + '. Research 10 postings for the band, practice one line for comp talk, and don\'t name a number before they do. Mentors in your target field know current ranges.';
        return aiBuild([], [body], [], null, ['How do I answer salary expectations?', 'What if the offer is below the band?', 'Recommend mentors']);
    },
    motivation: function (p) {
        return aiBuild(
            ['Thanks for telling me.', 'I hear you.'],
            ['That feeling is completely normal — almost every switcher hits this wall mid-journey. Shrink the frame: one skill, 30 minutes, today. Momentum comes back from tiny wins, and a mentor can carry some of the weight with you.'],
            ['What\'s the hardest part right now?'],
            [{ label: 'My milestones', act: 'nav:career-milestones-screen' }],
            ['I don\'t have time', 'Build me a career roadmap', 'Recommend mentors'],
            'blocker'
        );
    },
    time: function (p, chat, more) {
        var first = p.result.missing[0] || 'your first skill';
        var body = more
            ? 'Template: anchor a 30-minute block to an existing habit (coffee, lunch, commute), keep one "capture" note for ideas, and review progress Sunday for 10 minutes. Protect the block like a session with a mentor — because it is one, with yourself.'
            : 'You don\'t need more hours — you need smaller units. 30 minutes a day on ' + first + ', attached to an existing habit, beats a 5-hour Sunday block you keep rescheduling.';
        return aiBuild(['Real talk:'], [body], ['Want me to structure a 30-minute daily plan?'], null, ['Build me a career roadmap', 'Which skills should I learn first?']);
    },
    community: function (p, chat, more) {
        var body = more
            ? 'Once you\'re in: post work at 60% done (feedback beats polish), answer one question a week (teaching compounds), and DM people whose comments resonate. That\'s how referrals happen.'
            : 'Communities are where switching actually happens — feedback, referrals, and people one step ahead of you. Post your work early and often; the interest groups here are a good start.';
        return aiBuild([], [body], [], [{ label: 'Open communities', act: 'nav:community-home-screen' }], ['How do I network without cringe?', 'Recommend mentors']);
    },
    mentors: function (p, chat, more) {
        var to = p.to ? p.to.name : 'your target field';
        var from = p.from ? p.from.name : 'your background';
        var names = p.mentors.slice(0, 2).map(function (m) { return m.firstName + ' ' + m.lastName + (m.position ? ' (' + m.position + ')' : ''); }).join(' and ');
        var body = more
            ? 'How to pick: read their bio for people who made the same switch, check reviews for teaching style, then connect with ONE clear ask — "one review of my portfolio this week." Specific requests get fast yeses.'
            : 'For ' + to + ', start with mentors who already coach people from ' + from + (names ? ' — I\'d shortlist ' + names : '') + '. Send a connect request with one specific ask, then book a session once they accept.';
        var actions = p.domain
            ? [{ label: 'Find ' + p.domain + ' mentors', act: 'search:' + p.domain }, { label: 'My sessions', act: 'call:openSessionsScreen' }]
            : [{ label: 'Open Discover', act: 'nav:discover-screen' }];
        return aiBuild(['Good call.'], [body], ['Want tips for your first session?'], actions, ['What should my first session cover?', 'How do I write a connect request?', 'My sessions']);
    },
    sessions: function (p, chat, more) {
        var body = p.upcoming
            ? 'You have ' + p.upcoming + ' session(s) coming up. Highest-leverage hour: bring one artifact (resume, portfolio, roadmap) plus 3 specific questions — share it in chat beforehand so the mentor can skim.'
            : 'No sessions booked yet. Connect with a mentor in your target field first — requests that contain one specific ask get accepted fastest.';
        if (more) body += ' And after each session, ask the mentor for one piece of homework — it turns advice into progress.';
        var actions = [{ label: 'My sessions', act: 'call:openSessionsScreen' }];
        if (p.domain) actions.push({ label: 'Find mentors', act: 'search:' + p.domain });
        return aiBuild([], [body], [], actions, ['What should my first session cover?', 'Recommend mentors']);
    },
    pricing: function (p, chat, more) {
        var body = more
            ? 'Rule of thumb: stay on Free while you\'re exploring, upgrade the week you start booking weekly sessions — the roadmap tools and unlimited AI coaching pay for themselves by the second session.'
            : 'Free covers ' + (p.sub.sessionLimit || 3) + ' completed sessions plus the basics. Premium (Rs 2,500/mo) unlocks unlimited sessions, the full AI coach (me), and the complete roadmap. Pro (Rs 5,000/yr) keeps everything unlimited for a flat yearly price. If you\'re actively switching, Premium usually pays for itself in the first week.';
        return aiBuild([], [body], ['Want me to compare them against your timeline?'], [{ label: 'See plans', act: 'nav:plans-screen' }], ['What do I get in Premium?', 'How many free sessions do I have?']);
    },
    fields: function (p, chat, more) {
        var body = p.from && p.to
            ? (more
                ? 'That pairing is stronger than it looks: ' + (p.result.transferable.join(', ') || 'problem solving and communication') + ' carry over directly, and the gaps (' + (p.result.missing.join(', ') || 'none') + ') are all learnable in weeks, not years.'
                : 'Your setup: ' + p.from.name + ' → ' + p.to.name + '. Carrying over: ' + (p.result.transferable.join(', ') || 'problem solving and communication') + '. Gaps: ' + (p.result.missing.join(', ') || 'none — you\'re closer than you think') + '.')
            : 'Tell me where you are and where you want to go — set your current and target field and I\'ll build the gap analysis.';
        return aiBuild([], [body], [], [{ label: 'View skill gap', act: 'nav:career-analysis-screen' }, { label: 'Set my fields', act: 'nav:career-profile-screen' }], ['Build me a career roadmap', 'Which skills should I learn next?']);
    },
    progress: function (p) {
        var nextMilestone = null;
        for (var i = 0; i < p.fields.milestones.length; i++) {
            if (!p.fields.milestones[i].done) { nextMilestone = p.fields.milestones[i]; break; }
        }
        var body = p.total
            ? 'Milestones: ' + p.done + '/' + p.total + ' done' + (p.avg ? ', skills averaging ' + p.avg + '%' : '') + '.' + (nextMilestone ? ' Next up: "' + nextMilestone.title + '".' : ' All done — time to raise the bar!')
            : 'No milestones yet — set your career fields and I\'ll generate your first set.';
        return aiBuild([], [body], [], [{ label: 'My milestones', act: 'nav:career-milestones-screen' }, { label: 'Track skills', act: 'nav:career-skills-progress-screen' }], ['Build me a career roadmap', 'Which skills should I learn next?']);
    },
    fallback: function (p) {
        var ctx = p.from && p.to
            ? 'I\'ve got your profile in view — ' + p.from.name + ' aiming for ' + p.to.name + (p.result.missing.length ? ', with ' + p.result.missing.length + ' skills left to close' : '') + '. '
            : '';
        return aiBuild(
            [],
            ['Good question. ' + ctx + 'I can coach you through roadmaps, skills, resumes, portfolios, interviews, mentors, sessions, and the motivation dips between. Try me — I usually have something useful.'],
            ['And what\'s the one thing blocking you right now?'],
            null,
            ['Build me a career roadmap', 'Which skills should I learn next?', 'Recommend mentors', 'I feel stuck'],
            'blocker'
        );
    }
};

function generateAiReply(question) {
    // Compatibility wrapper: synchronous offline reply.
    return aiComposeReply(question, aiGetChat()).text;
}

function renderPlans() {
    var sub = getSub();
    var trial = document.getElementById('trial-banner');
    var days = Math.max(0, Math.ceil((sub.trialEnds - Date.now()) / (24 * 60 * 60 * 1000)));
    trial.textContent = isPremium()
        ? 'You are on the ' + sub.plan + ' plan. Premium features are unlocked.'
        : 'Free plan · ' + completedSessionsUsed() + '/' + sub.sessionLimit + ' free sessions completed · ' + days + ' day(s) left in trial';
}

function renderUsage() {
    var sub = getSub();
    document.getElementById('usage-cards').innerHTML =
        statCard(isPremium() ? 'Unlimited' : (completedSessionsUsed() + '/' + sub.sessionLimit), 'Free sessions completed') +
        statCard(sub.plan, 'Current plan') +
        statCard(String(sub.aiUses || 0), 'AI coach questions');
}

function statCard(value, label) {
    return '<div class="stat-card"><div class="stat-info"><h3>' + value + '</h3><p>' + label + '</p></div></div>';
}

function startUpgrade(plan) {
    upgradePlanChoice = plan;
    navigateTo('upgrade-screen');
}

function renderUpgrade() {
    document.getElementById('upgrade-summary').innerHTML =
        '<p>You are upgrading to <strong>' + upgradePlanChoice + '</strong>.</p>' +
        '<p>This unlocks unlimited mentorship sessions, the AI career coach, and full career roadmap tools.</p>';
}

function completeMockPayment() {
    var sub = getSub();
    sub.plan = upgradePlanChoice;
    sub.sessionLimit = 999;
    saveSub(sub);
    var bills = getBilling();
    bills.unshift({
        id: generateId(),
        userId: currentUser.id,
        plan: upgradePlanChoice,
        amount: upgradePlanChoice === 'pro' ? 5000 : 2500,
        status: 'paid',
        createdAt: new Date().toISOString()
    });
    saveBilling(bills);
    showToast('Payment successful. Premium features unlocked.', 'success');
    navigateTo('plans-screen');
}

function renderBilling() {
    var mine = getBilling().filter(function (b) { return b.userId === currentUser.id; });
    document.getElementById('billing-list').innerHTML = mine.length ? mine.map(function (b) {
        return '<div class="session-card"><div><h4>' + b.plan + ' plan</h4><p>Rs ' + Number(b.amount || 0).toLocaleString() + ' · ' + b.status + ' · ' + b.createdAt.slice(0, 10) + '</p></div></div>';
    }).join('') : '<p class="empty-state">No invoices yet</p>';
}

function maybeRemindSessions() {
    if (!currentUser) return;
    var soon = getSessions().filter(function (s) {
        if (s.status !== 'confirmed') return false;
        if (s.studentId !== currentUser.id && s.mentorId !== currentUser.id) return false;
        var when = new Date(s.date + 'T' + s.time + ':00');
        var diff = when - new Date();
        return diff > 0 && diff < 36 * 60 * 60 * 1000;
    });
    if (soon.length) {
        showToast('Reminder: you have a session on ' + soon[0].date + ' at ' + soon[0].time, 'info');
    }
}

function selectPlan(plan) {
    if (plan === 'free') {
        showToast('You are on the free plan', 'info');
    }
}

var originalNavigateToPlatform = navigateTo;
navigateTo = function (screenId) {
    originalNavigateToPlatform(screenId);
    applyHomeFirstBanner();
    toggleAiFabVisibility();
    if (screenId === 'sessions-screen') renderSessionsScreen();
    if (screenId === 'mentor-availability-screen') renderAvailability();
    if (screenId === 'booking-screen') renderBookingScreen();
    if (screenId === 'booking-confirm-screen') renderBookingConfirm();
    if (screenId === 'review-session-screen') renderReviewScreen();
    if (screenId === 'career-profile-screen') renderCareerProfile();
    if (screenId === 'career-current-screen') renderFieldPicker('current');
    if (screenId === 'career-target-screen') renderFieldPicker('target');
    if (screenId === 'career-analysis-screen') renderCareerAnalysis();
    if (screenId === 'career-roadmap-screen') renderRoadmap();
    if (screenId === 'career-skills-progress-screen') renderSkillsProgress();
    if (screenId === 'career-milestones-screen') renderMilestones();
    if (screenId === 'plans-screen') renderPlans();
    if (screenId === 'usage-dashboard-screen') renderUsage();
    if (screenId === 'upgrade-screen') renderUpgrade();
    if (screenId === 'billing-history-screen') renderBilling();
    if (screenId === 'admin-dashboard') renderAdminDashboard();
};

document.addEventListener('DOMContentLoaded', function () {
    seedPlatformData();
    applyHomeFirstBanner();
    ensureMobileNavControls();
    toggleAiFabVisibility();
    setTimeout(maybeRemindSessions, 1200);
});

/* ========================================
   NAVIGATION HISTORY — the Back button walks
   back through visited screens one by one and
   ends at Home once the trail is exhausted.
   ======================================== */
var NAV_HOME_SCREENS = ['student-dashboard', 'mentor-dashboard', 'admin-dashboard'];
var navigateToWithHistory = navigateTo;
navigateTo = function (screenId, opts) {
    var isBackNav = !!(opts && opts.fromBack);
    if (!isBackNav && screenId) {
        var activeEl = document.querySelector('.screen.active');
        var currentId = activeEl ? activeEl.id : null;
        if (NAV_HOME_SCREENS.indexOf(screenId) !== -1) {
            // Home is the root of every trail — start fresh
            navigationHistory = [];
        } else if (currentId && currentId !== screenId) {
            navigationHistory.push(currentId);
            if (navigationHistory.length > 50) navigationHistory.shift();
        }
    }
    navigateToWithHistory(screenId);
};

/* ========================================
   ADMIN PORTAL
   ======================================== */
var adminTab = 'overview';

function adminEsc(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showAdminDashboard() {
    adminTab = 'overview';
    navigateTo('admin-dashboard');
}

// Click the "Portal Admin" profile → dropdown with Logout inside.
function toggleAdminProfileMenu(event) {
    if (event) event.stopPropagation();
    var menu = document.getElementById('admin-profile-menu');
    if (!menu) return;
    menu.classList.toggle('hidden');
    var nameEl = document.getElementById('apm-name');
    if (nameEl && currentUser) nameEl.textContent = currentUser.firstName + ' ' + currentUser.lastName;
}

function adminCloseProfileMenu() {
    var menu = document.getElementById('admin-profile-menu');
    if (menu) menu.classList.add('hidden');
}

document.addEventListener('click', function (event) {
    var menu = document.getElementById('admin-profile-menu');
    if (!menu || menu.classList.contains('hidden')) return;
    if (event.target.closest && event.target.closest('.admin-profile-wrap')) return;
    adminCloseProfileMenu();
});

document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') adminCloseProfileMenu();
});

function showAdminSection(tab) {
    adminTab = tab;
    navigateTo('admin-dashboard');
}

function renderAdminDashboard() {
    if (!currentUser || currentUser.role !== 'admin') return;
    var nameEl = document.getElementById('admin-nav-name');
    if (nameEl) nameEl.textContent = currentUser.firstName + ' ' + currentUser.lastName;

    ensureAdminRegistrationPolling();
    updateAdminNewUserBell();
    adminSyncRegistrations();

    var tabsEl = document.getElementById('admin-tabs');
    if (tabsEl) {
        var tabs = [
            { id: 'overview', label: 'Overview' },
            { id: 'users', label: 'Users' },
            { id: 'content', label: 'Content' },
            { id: 'sessions', label: 'Sessions' }
        ];
        tabsEl.innerHTML = tabs.map(function (t) {
            return '<button class="tab-btn' + (adminTab === t.id ? ' active' : '') + '" onclick="showAdminSection(\'' + t.id + '\')">' + t.label + '</button>';
        }).join('');
    }

    var box = document.getElementById('admin-content');
    if (!box) return;
    if (adminTab === 'users') box.innerHTML = adminUsersHtml();
    else if (adminTab === 'content') box.innerHTML = adminContentHtml();
    else if (adminTab === 'sessions') box.innerHTML = adminSessionsHtml();
    else box.innerHTML = adminOverviewHtml();
}

// ---- NEW MEMBER NOTIFICATIONS (admin bell) ----
// Sign-ups are pushed to /api/registrations by the browser (app.js) and pulled
// back here, so the admin bell lights up for new members even when they created
// their account from a different device (e.g. a visitor via the ngrok URL).
var adminRegPollTimer = null;

function adminPendingNewUsers() {
    return getUsers().filter(function (u) { return u.isNewRegistration && u.role !== 'admin'; });
}

function updateAdminNewUserBell() {
    var badge = document.getElementById('admin-new-users-badge');
    if (!badge) return;
    var count = adminPendingNewUsers().length;
    badge.textContent = count > 0 ? (count > 9 ? '9+' : String(count)) : '';
    badge.classList.toggle('has-unread', count > 0);
}

function adminSyncRegistrations() {
    try {
        if (typeof fetch !== 'function' || window.location.protocol === 'file:') return;
        fetch('/api/registrations').then(function (res) { return res.ok ? res.json() : null; }).then(function (data) {
            if (!data || !Array.isArray(data.registrations)) return;
            var users = getUsers();
            var changed = false;
            var newRegs = [];
            data.registrations.forEach(function (reg) {
                if (reg.seen) return;
                if (users.some(function (u) { return u.email === reg.email; })) return;
                users.push({
                    id: reg.id || 'reg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
                    firstName: reg.firstName || 'New',
                    lastName: reg.lastName || 'Member',
                    email: reg.email,
                    password: reg.passwordHash || hashPassword('changeme123'),
                    role: reg.role || 'student',
                    photo: null, bio: '', skills: [], interests: [],
                    profileCompleted: false,
                    mentorVerificationStatus: 'not_submitted',
                    emailVerified: false,
                    createdAt: reg.createdAt || new Date().toISOString(),
                    isNewRegistration: true
                });
                newRegs.push(reg);
                changed = true;
            });
            if (changed) {
                saveUsers(users);
                // Feed the universal bell so new members show up like every other notification.
                if (typeof ucPushNotification === 'function') {
                    newRegs.forEach(function (reg) {
                        ucPushNotification(['admin'], 'signup', 'New member joined',
                            (reg.firstName || 'New') + ' ' + (reg.lastName || 'Member') + ' created an account (' + reg.email + ').');
                    });
                }
                updateAdminNewUserBell();
                if (adminTab === 'users') renderAdminDashboard();
            }
        }).catch(function () { /* API not running — local sign-ups still notify */ });
    } catch (error) { /* ignore */ }
}

function ensureAdminRegistrationPolling() {
    if (adminRegPollTimer) return;
    adminRegPollTimer = setInterval(function () {
        if (!currentUser || currentUser.role !== 'admin') return;
        adminSyncRegistrations();
        updateAdminNewUserBell();
    }, 30000);
}

function toggleAdminNewUsersPanel() {
    var panel = document.getElementById('admin-new-users-panel');
    if (panel) { adminCloseNewUsersPanel(); return; }
    var pending = adminPendingNewUsers();
    panel = document.createElement('div');
    panel.id = 'admin-new-users-panel';
    panel.className = 'admin-new-users-panel';
    var items = pending.map(function (u) {
        var when = u.createdAt ? new Date(u.createdAt).toLocaleString() : '';
        return '<div class="admin-new-users-item">' +
            '<div class="anu-avatar">' + adminEsc((u.firstName || 'U').charAt(0).toUpperCase()) + '</div>' +
            '<div class="anu-info"><h4>' + adminEsc(u.firstName + ' ' + u.lastName) + '</h4>' +
            '<p>' + adminEsc(u.email) + '</p>' +
            '<span>' + adminEsc(u.role || 'student') + (when ? ' · joined ' + when : '') + '</span></div>' +
            '</div>';
    }).join('');
    panel.innerHTML = '<div class="anu-header"><h4>New members</h4>' +
        (pending.length ? '<button class="btn btn-outline btn-sm" onclick="adminMarkNewUsersSeen()">Mark all as read</button>' : '') +
        '</div>' +
        (pending.length ? items : '<p class="empty-state" style="padding:16px 0;">No new member notifications yet.<br>New sign-ups appear here automatically.</p>') +
        (pending.length ? '<button class="btn btn-primary btn-sm anu-view" onclick="adminGoToNewUsers()">Open Users section</button>' : '');
    document.body.appendChild(panel);
    var badge = document.getElementById('admin-new-users-badge');
    if (badge) {
        var rect = badge.getBoundingClientRect();
        panel.style.top = (rect.bottom + 8) + 'px';
        panel.style.right = Math.max(10, window.innerWidth - rect.right) + 'px';
    }
    setTimeout(function () {
        document.addEventListener('click', adminCloseNewUsersPanelOnOutside);
    }, 0);
}

function adminCloseNewUsersPanelOnOutside(event) {
    var panel = document.getElementById('admin-new-users-panel');
    if (!panel) { document.removeEventListener('click', adminCloseNewUsersPanelOnOutside); return; }
    if (panel.contains(event.target)) return;
    if (event.target.closest && event.target.closest('.notification-button')) return; // bell handles its own toggle
    adminCloseNewUsersPanel();
}

function adminCloseNewUsersPanel() {
    var panel = document.getElementById('admin-new-users-panel');
    if (panel) panel.remove();
    document.removeEventListener('click', adminCloseNewUsersPanelOnOutside);
}

function adminMarkNewUsersSeen() {
    var pending = adminPendingNewUsers();
    if (!pending.length) return;
    var ids = pending.map(function (u) { return u.id; });
    var users = getUsers();
    users.forEach(function (u) { if (ids.indexOf(u.id) !== -1) u.isNewRegistration = false; });
    saveUsers(users);
    try {
        if (typeof fetch === 'function' && window.location.protocol !== 'file:') {
            fetch('/api/registrations/seen', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: ids })
            }).catch(function () { /* ignore */ });
        }
    } catch (error) { /* ignore */ }
    adminCloseNewUsersPanel();
    updateAdminNewUserBell();
    if (adminTab === 'users') renderAdminDashboard();
    showToast('New member notifications marked as read.', 'success');
}

function adminGoToNewUsers() {
    adminCloseNewUsersPanel();
    showAdminSection('users');
}

function adminStatCard(icon, value, label, bg, color) {
    return '<div class="stat-card">' +
        '<div class="stat-icon" style="background:' + bg + ';color:' + color + ';">' + icon + '</div>' +
        '<div class="stat-info"><h3>' + value + '</h3><p>' + label + '</p></div></div>';
}

function adminOverviewHtml() {
    var users = getUsers();
    var students = users.filter(function (u) { return u.role === 'student'; }).length;
    var mentors = users.filter(function (u) { return u.role === 'mentor'; }).length;
    var admins = users.filter(function (u) { return u.role === 'admin'; }).length;
    var sessions = getSessions();
    var posts = getPosts();
    var communities = getCommunities();
    var completed = sessions.filter(function (s) { return s.status === 'completed'; }).length;
    var pending = sessions.filter(function (s) { return s.status === 'pending'; }).length;

    var userIcon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    var gradIcon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>';
    var calIcon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
    var chatIcon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>';

    var html = '<div class="stats-grid">' +
        adminStatCard(userIcon, users.length, 'Total Users', 'rgba(74, 144, 217, 0.15)', '#4A90D9') +
        adminStatCard(gradIcon, students + ' / ' + mentors, 'Students / Mentors', 'rgba(52, 211, 153, 0.15)', '#10B981') +
        adminStatCard(calIcon, sessions.length, 'Sessions Booked', 'rgba(251, 191, 36, 0.18)', '#F59E0B') +
        adminStatCard(chatIcon, posts.length, 'Community Posts', 'rgba(244, 114, 182, 0.15)', '#EC4899') +
        '</div>';

    html += '<div class="card" style="margin-top:20px;"><div class="card-header"><h3>Platform Snapshot</h3></div><div class="card-body">' +
        '<div class="detail-row"><span class="detail-label">Administrators</span><span class="detail-value">' + admins + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">Communities</span><span class="detail-value">' + communities.length + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">Completed sessions</span><span class="detail-value">' + completed + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">Pending session requests</span><span class="detail-value">' + pending + '</span></div>' +
        '</div></div>';
    return html;
}

function adminRoleBadge(role) {
    var map = { student: ['rgba(74, 144, 217, 0.15)', '#4A90D9'], mentor: ['rgba(52, 211, 153, 0.15)', '#10B981'], admin: ['rgba(96, 165, 250, 0.18)', '#60A5FA'] };
    var c = map[role] || ['#F3F4F6', '#6B7280'];
    return '<span class="plan-chip" style="background:' + c[0] + ';color:' + c[1] + ';margin:0 0 0 8px;">' + adminEsc(role) + '</span>';
}

function adminUsersHtml() {
    var users = getUsers();
    var html = '<div class="card"><div class="card-header">' +
        '<h3>User Management</h3>' +
        '<button class="btn btn-primary btn-sm" onclick="adminShowAddUserForm()">+ Add User</button>' +
        '</div><div class="card-body">' +
        '<div class="user-management-controls">' +
        '<input type="text" id="admin-user-search" class="search-input" placeholder="Search users by name or email..." oninput="adminFilterUsers()">' +
        '<select id="admin-user-role-filter" class="filter-select" onchange="adminFilterUsers()">' +
        '<option value="">All Roles</option>' +
        '<option value="student">Students</option>' +
        '<option value="mentor">Mentors</option>' +
        '<option value="admin">Admins</option>' +
        '</select>' +
        '</div>' +
        '<div id="admin-users-list" class="users-list">';
    
    if (!users.length) {
        html += '<p class="empty-state">No users found</p>';
    } else {
        html += users.map(function (u) {
            return adminUserCard(u);
        }).join('');
    }
    html += '</div></div></div>';
    
    html += adminUserModalHtml();
    return html;
}

function adminUserCard(u) {
    var isSelf = currentUser && u.id === currentUser.id;
    var joined = u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—';
    var mentorStatus = getMentorVerificationStatus(u);
    var avatar = u.photo ? '<img src="' + u.photo + '" alt="Avatar">' :
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    
    var actions = '<div class="session-actions">' +
        '<button class="btn btn-outline btn-sm" onclick="adminEditUser(\'' + u.id + '\')">Edit</button>';

    if (u.role === 'mentor') {
        if (mentorStatus === 'pending') {
            actions += '<button class="btn btn-primary btn-sm" onclick="adminVerifyMentor(\'' + u.id + '\')">Verify Mentor</button>';
        } else {
            var mentorStatusLabel = mentorStatus === 'approved' ? 'Verified' : 'Awaiting Request';
            actions += '<button class="btn btn-outline btn-sm" disabled>' + mentorStatusLabel + '</button>';
        }
    }
    
    if (u.role !== 'admin' && !isSelf) {
        actions += '<button class="btn btn-outline btn-sm" style="color:#EF4444;border-color:#FECACA;" onclick="adminDeleteUser(\'' + u.id + '\')">Delete</button>';
    } else {
        actions += '<button class="btn btn-outline btn-sm" disabled>Protected</button>';
    }
    actions += '</div>';
    
    return '<div class="user-card" data-user-id="' + u.id + '" data-role="' + u.role + '">' +
        '<div class="user-card-avatar">' + avatar + '</div>' +
        '<div class="user-card-info">' +
        '<h4>' + adminEsc(u.firstName + ' ' + u.lastName) + adminRoleBadge(u.role) + (u.isNewRegistration ? '<span class="new-user-pill">NEW</span>' : '') + '</h4>' +
        '<p class="user-card-email">' + adminEsc(u.email) + '</p>' +
        '<p class="user-card-meta">Joined ' + joined + (u.bio ? ' · ' + adminEsc(u.bio.substring(0, 50)) : '') + (u.role === 'mentor' ? ' · ' + mentorStatus : '') + '</p>' +
        '</div>' + actions + '</div>';
}

function adminVerifyMentor(userId) {
    if (!currentUser || currentUser.role !== 'admin') return;
    var users = getUsers();
    var mentor = users.find(function (u) { return u.id === userId && u.role === 'mentor'; });
    if (!mentor) return;
    if (getMentorVerificationStatus(mentor) !== 'pending') {
        showToast('This mentor has not submitted a verification request.', 'error');
        return;
    }
    mentor.mentorVerificationStatus = 'approved';
    mentor.mentorVerifiedAt = new Date().toISOString();
    saveUsers(users);
    showToast(mentor.firstName + ' ' + mentor.lastName + ' is now verified.', 'success');
    renderAdminDashboard();
}

function adminUserModalHtml() {
    return '<div id="admin-user-modal" class="modal-overlay">' +
        '<div class="modal-content">' +
        '<div class="modal-header">' +
        '<h3 id="admin-user-modal-title">Add New User</h3>' +
        '<button class="modal-close" onclick="adminCloseUserModal()">&times;</button>' +
        '</div>' +
        '<form id="admin-user-form" onsubmit="adminSaveUser(event)">' +
        '<input type="hidden" id="admin-user-id">' +
        '<div class="form-row">' +
        '<div class="form-group">' +
        '<label>First Name</label>' +
        '<input type="text" id="admin-user-firstname" required>' +
        '</div>' +
        '<div class="form-group">' +
        '<label>Last Name</label>' +
        '<input type="text" id="admin-user-lastname" required>' +
        '</div>' +
        '</div>' +
        '<div class="form-group">' +
        '<label>Email</label>' +
        '<input type="email" id="admin-user-email" required>' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group">' +
        '<label>Role</label>' +
        '<select id="admin-user-role" required>' +
        '<option value="student">Student</option>' +
        '<option value="mentor">Mentor</option>' +
        '<option value="admin">Admin</option>' +
        '</select>' +
        '</div>' +
        '<div class="form-group">' +
        '<label>Password</label>' +
        '<input type="password" id="admin-user-password" required>' +
        '</div>' +
        '</div>' +
        '<div class="form-group">' +
        '<label>Bio</label>' +
        '<textarea id="admin-user-bio" rows="2"></textarea>' +
        '</div>' +
        '<div class="form-actions">' +
        '<button type="button" class="btn btn-outline" onclick="adminCloseUserModal()">Cancel</button>' +
        '<button type="submit" class="btn btn-primary">Save User</button>' +
        '</div>' +
        '</form>' +
        '</div></div>';
}

function adminFilterUsers() {
    var searchTerm = document.getElementById('admin-user-search').value.toLowerCase();
    var roleFilter = document.getElementById('admin-user-role-filter').value;
    var userCards = document.querySelectorAll('.user-card');
    
    userCards.forEach(function(card) {
        var name = card.querySelector('h4').textContent.toLowerCase();
        var email = card.querySelector('.user-card-email').textContent.toLowerCase();
        var role = card.getAttribute('data-role');
        
        var matchesSearch = name.includes(searchTerm) || email.includes(searchTerm);
        var matchesRole = !roleFilter || role === roleFilter;
        
        card.style.display = (matchesSearch && matchesRole) ? 'flex' : 'none';
    });
}

function adminShowAddUserForm() {
    document.getElementById('admin-user-modal-title').textContent = 'Add New User';
    document.getElementById('admin-user-id').value = '';
    document.getElementById('admin-user-form').reset();
    document.getElementById('admin-user-password').required = true;
    document.getElementById('admin-user-modal').classList.add('active');
}

function adminEditUser(userId) {
    var users = getUsers();
    var user = users.find(function(u) { return u.id === userId; });
    if (!user) return;

    // Admin has now viewed this user — clear the NEW badge so it stops showing.
    if (user.isNewRegistration) {
        user.isNewRegistration = false;
        saveUsers(users);
        updateAdminNewUserBell();
        var listEl = document.getElementById('admin-users-list');
        if (listEl) listEl.innerHTML = users.map(function (u) { return adminUserCard(u); }).join('');
    }

    document.getElementById('admin-user-modal-title').textContent = 'Edit User';
    document.getElementById('admin-user-id').value = user.id;
    document.getElementById('admin-user-firstname').value = user.firstName || '';
    document.getElementById('admin-user-lastname').value = user.lastName || '';
    document.getElementById('admin-user-email').value = user.email || '';
    document.getElementById('admin-user-role').value = user.role || 'student';
    document.getElementById('admin-user-password').value = user.password || '';
    document.getElementById('admin-user-password').required = false;
    document.getElementById('admin-user-bio').value = user.bio || '';
    document.getElementById('admin-user-modal').classList.add('active');
}

function adminCloseUserModal() {
    document.getElementById('admin-user-modal').classList.remove('active');
}

function adminSaveUser(event) {
    event.preventDefault();
    var users = getUsers();
    var userId = document.getElementById('admin-user-id').value;
    var firstName = document.getElementById('admin-user-firstname').value.trim();
    var lastName = document.getElementById('admin-user-lastname').value.trim();
    var email = document.getElementById('admin-user-email').value.trim();
    var role = document.getElementById('admin-user-role').value;
    var password = document.getElementById('admin-user-password').value;
    var bio = document.getElementById('admin-user-bio').value.trim();
    
    var existingUser = users.find(function(u) { return u.email === email && u.id !== userId; });
    if (existingUser) {
        showToast('Email already exists', 'error');
        return;
    }
    
    if (userId) {
        var user = users.find(function(u) { return u.id === userId; });
        if (user) {
            user.firstName = firstName;
            user.lastName = lastName;
            user.email = email;
            user.role = role;
            user.bio = bio;
            if (password) user.password = password;
            showToast('User updated successfully', 'success');
        }
    } else {
        var newUser = {
            id: generateId(),
            firstName: firstName,
            lastName: lastName,
            email: email,
            password: password,
            role: role,
            bio: bio,
            createdAt: new Date().toISOString()
        };
        users.push(newUser);
        showToast('User added successfully', 'success');
    }
    
    saveUsers(users);
    adminCloseUserModal();
    renderAdminDashboard();
}

function adminDeleteUser(userId) {
    if (!currentUser || currentUser.role !== 'admin') return;
    var users = getUsers();
    var target = users.find(function (u) { return u.id === userId; });
    if (!target) return;
    if (target.role === 'admin' || target.id === currentUser.id) {
        showToast('Admin accounts cannot be removed', 'error');
        return;
    }
    if (!confirm('Delete ' + target.firstName + ' ' + target.lastName + '? This cannot be undone.')) return;
    saveUsers(users.filter(function (u) { return u.id !== userId; }));
    saveSessions(getSessions().filter(function (s) { return s.studentId !== userId && s.mentorId !== userId; }));
    // Also remove the deleted user from every community member list
    var members = getCommunityMembers();
    Object.keys(members).forEach(function (cid) {
        var idx = members[cid].indexOf(userId);
        if (idx > -1) members[cid].splice(idx, 1);
    });
    saveCommunityMembers(members);
    showToast('User "' + target.firstName + ' ' + target.lastName + '" deleted', 'success');
    renderAdminDashboard();
}

function adminContentHtml() {
    var communities = getCommunities();
    var members = getCommunityMembers();
    var posts = getPosts();

    var html = '<div class="card"><div class="card-header"><h3>Communities (' + communities.length + ')</h3></div><div class="card-body">';
    if (!communities.length) {
        html += '<p class="empty-state">No communities</p>';
    } else {
        html += communities.map(function (c) {
            return '<div class="session-card"><div>' +
                '<h4 style="font-weight:600;">' + adminEsc(c.icon || '') + ' ' + adminEsc(c.name) + '</h4>' +
                '<p style="color:var(--text-secondary);font-size:0.85rem;">' + ((members[c.id] || []).length) + ' members</p>' +
                '</div><div class="session-actions">' +
                '<button class="btn btn-outline btn-sm" onclick="adminOpenCommunityMembers(\'' + c.id + '\')">👥 View/Edit Members</button>' +
                '</div></div>';
        }).join('');
    }
    html += '</div></div>';

    html += '<div class="card" style="margin-top:20px;"><div class="card-header"><h3>Posts (' + posts.length + ')</h3></div><div class="card-body">';
    if (!posts.length) {
        html += '<p class="empty-state">No posts yet</p>';
    } else {
        html += posts.map(function (p) {
            var author = userById(p.authorId);
            return '<div class="session-card"><div>' +
                '<h4 style="font-weight:600;">' + adminEsc(p.title || 'Untitled post') + '</h4>' +
                '<p style="color:var(--text-secondary);font-size:0.85rem;">by ' + (author ? adminEsc(author.firstName + ' ' + author.lastName) : 'Unknown user') + (p.communityId ? ' · community: ' + adminEsc(p.communityId) : '') + '</p>' +
                '</div><div class="session-actions">' +
                '<button class="btn btn-outline btn-sm" style="color:#EF4444;border-color:#FECACA;" onclick="adminDeletePost(\'' + p.id + '\')">Delete</button>' +
                '</div></div>';
        }).join('');
    }
    html += '</div></div>';
    html += adminCommunityMembersModalHtml();
    return html;
}

function adminDeletePost(postId) {
    if (!currentUser || currentUser.role !== 'admin') return;
    var posts = getPosts();
    if (!posts.some(function (p) { return p.id === postId; })) return;
    if (!confirm('Delete this post? This cannot be undone.')) return;
    savePosts(posts.filter(function (p) { return p.id !== postId; }));
    showToast('Post deleted', 'success');
    renderAdminDashboard();
}

// ========================================
// ADMIN — COMMUNITY MEMBERS (VIEW / EDIT / DELETE)
// ========================================
var adminMembersCommunityId = null;

function adminCommunityMembersModalHtml() {
    return '<div id="admin-community-members-modal" class="modal-overlay">' +
        '<div class="modal-content">' +
        '<div class="modal-header">' +
        '<h3 id="admin-cmm-title">Community Members</h3>' +
        '<button class="modal-close" onclick="adminCloseCommunityMembersModal()">&times;</button>' +
        '</div>' +
        '<div class="modal-body">' +
        '<div class="form-group">' +
        '<label for="admin-cmm-user-select">Add member</label>' +
        '<div class="input-add-wrapper">' +
        '<select id="admin-cmm-user-select"><option value="">Loading users…</option></select>' +
        '<button class="btn btn-primary btn-sm" onclick="adminAddCommunityMember()">Add</button>' +
        '</div>' +
        '</div>' +
        '<div id="admin-community-members-list" class="students-list">' +
        '<span class="empty-state">Loading members…</span>' +
        '</div>' +
        '</div>' +
        '</div></div>';
}

function adminOpenCommunityMembers(communityId) {
    if (!currentUser || currentUser.role !== 'admin') return;
    adminMembersCommunityId = communityId;
    var communities = getCommunities();
    var community = communities.find(function (c) { return c.id === communityId; });
    var title = community ? adminEsc((community.icon || '') + ' ' + community.name) : 'Community';
    document.getElementById('admin-cmm-title').textContent = title + ' — Members';
    adminRefreshCmmSelect();
    adminRenderCommunityMembersList();
    document.getElementById('admin-community-members-modal').classList.add('active');
}

function adminCloseCommunityMembersModal() {
    var modal = document.getElementById('admin-community-members-modal');
    if (modal) modal.classList.remove('active');
    if (adminMembersCommunityId) {
        adminMembersCommunityId = null;
        renderAdminDashboard(); // refresh member counts on the community cards
    }
}

// Populate the "Add member" dropdown with registered users who are not members yet.
function adminRefreshCmmSelect() {
    if (!adminMembersCommunityId) return;
    var members = getCommunityMembers();
    var memberIds = members[adminMembersCommunityId] || [];
    var candidates = getUsers().filter(function (u) { return memberIds.indexOf(u.id) === -1; });
    var select = document.getElementById('admin-cmm-user-select');
    if (!select) return;
    select.innerHTML = '<option value="">Select a user…</option>' + candidates.map(function (u) {
        return '<option value="' + u.id + '">' + adminEsc(u.firstName + ' ' + u.lastName) + ' (' + adminEsc(u.role || 'student') + ')</option>';
    }).join('');
}

function adminRenderCommunityMembersList() {
    if (!adminMembersCommunityId) return;
    var members = getCommunityMembers();
    var memberIds = members[adminMembersCommunityId] || [];
    var users = getUsers();
    var container = document.getElementById('admin-community-members-list');
    if (!container) return;

    if (!memberIds.length) {
        container.innerHTML = '<span class="empty-state">No members yet</span>';
        return;
    }

    container.innerHTML = memberIds.map(function (id) {
        var u = users.find(function (x) { return x.id === id; });
        if (!u) return '';
        var name = u.firstName + ' ' + u.lastName;
        var role = u.role ? u.role.charAt(0).toUpperCase() + u.role.slice(1) : 'Member';
        var avatar = u.photo ? '<img src="' + u.photo + '" alt="' + adminEsc(name) + '">' :
            '<span>' + adminEsc(u.firstName ? u.firstName.charAt(0) : '?') + '</span>';
        return '<div class="student-list-item">' +
            '<div class="student-list-avatar">' + avatar + '</div>' +
            '<div class="student-list-info"><h3>' + adminEsc(name) + '</h3>' +
            '<p>' + adminEsc(role) + (u.position ? ' · ' + adminEsc(u.position) : '') + '</p></div>' +
            '<div class="member-actions">' +
            '<button class="btn btn-outline btn-sm" style="color:#EF4444;border-color:#FECACA;" onclick="adminDeleteCommunityMember(\'' + id + '\')">Delete</button>' +
            '</div></div>';
    }).join('');
}

function adminAddCommunityMember() {
    if (!currentUser || currentUser.role !== 'admin' || !adminMembersCommunityId) return;
    var select = document.getElementById('admin-cmm-user-select');
    var userId = select ? select.value : '';
    if (!userId) return;
    var members = getCommunityMembers();
    if (!members[adminMembersCommunityId]) members[adminMembersCommunityId] = [];
    if (members[adminMembersCommunityId].indexOf(userId) !== -1) {
        showToast('This user is already a member', 'error');
        return;
    }
    var added = getUsers().find(function (u) { return u.id === userId; });
    members[adminMembersCommunityId].push(userId);
    saveCommunityMembers(members);
    showToast((added ? added.firstName + ' ' + added.lastName : 'User') + ' added to the community', 'success');
    adminRefreshCmmSelect();
    adminRenderCommunityMembersList();
}

function adminDeleteCommunityMember(userId) {
    if (!currentUser || currentUser.role !== 'admin' || !adminMembersCommunityId) return;
    var members = getCommunityMembers();
    if (!members[adminMembersCommunityId]) return;
    var idx = members[adminMembersCommunityId].indexOf(userId);
    if (idx === -1) return;
    var removed = getUsers().find(function (u) { return u.id === userId; });
    var name = removed ? removed.firstName + ' ' + removed.lastName : 'This member';
    if (!confirm('Remove ' + name + ' from the community?')) return;
    members[adminMembersCommunityId].splice(idx, 1);
    saveCommunityMembers(members);
    showToast(name + ' removed from the community', 'info');
    adminRefreshCmmSelect();
    adminRenderCommunityMembersList();
}

function adminSessionsHtml() {
    var sessions = getSessions();
    var html = '<div class="card"><div class="card-header"><h3>All Sessions (' + sessions.length + ')</h3></div><div class="card-body">';
    if (!sessions.length) {
        html += '<p class="empty-state">No sessions booked yet</p>';
    } else {
        html += sessions.map(function (s) {
            var student = userById(s.studentId);
            var mentor = userById(s.mentorId);
            return '<div class="session-card"><div>' +
                '<h4 style="font-weight:600;">' + adminEsc(s.topic || 'Session') + '</h4>' +
                '<p style="color:var(--text-secondary);font-size:0.85rem;">' +
                (student ? adminEsc(student.firstName + ' ' + student.lastName) : 'Unknown student') + ' with ' +
                (mentor ? adminEsc(mentor.firstName + ' ' + mentor.lastName) : 'Unknown mentor') +
                ' · ' + adminEsc(s.date) + ' at ' + adminEsc(s.time) + '</p>' +
                '</div><span class="plan-chip">' + adminEsc(s.status || 'unknown') + '</span></div>';
        }).join('');
    }
    html += '</div></div>';
    return html;
}
