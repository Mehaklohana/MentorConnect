// ======================================================================
// notifications.js — Universal bell notifications (all screens, all roles)
// Events: signup, verification, session request/confirmed/declined/
// cancelled/completed, reschedule, review
// ======================================================================

var UC_NOTES_KEY = 'mentorconnect_ucnotes';
var UC_NOTES_TAB_KEY = 'mentorconnect_ucnotes_tab';
var ucNotesFilter = 'all'; // 'all' | 'unread' — panel lists every notification

function ucGetNotes() {
    try {
        var raw = localStorage.getItem(UC_NOTES_KEY);
        var list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
}

function ucSaveNotes(list) {
    try {
        list = list.slice(0, 300);
        localStorage.setItem(UC_NOTES_KEY, JSON.stringify(list));
        localStorage.setItem(UC_NOTES_TAB_KEY, String(Date.now()));
    } catch (e) { /* storage full or unavailable */ }
}

function ucAdminIds() {
    var ids = [];
    try {
        var users = typeof getUsers === 'function' ? getUsers() : [];
        users.forEach(function (u) { if (u && u.role === 'admin') ids.push(u.id); });
    } catch (e) { /* getUsers unavailable */ }
    if (!ids.length) ids.push('admin');
    return ids;
}

// recipients: array of user ids, or 'admin' / [ 'admin' ]
function ucResolveRecipients(recipients) {
    if (!Array.isArray(recipients)) recipients = [recipients];
    var out = [];
    recipients.forEach(function (r) {
        if (r === 'admin') out = out.concat(ucAdminIds());
        else out.push(r);
    });
    return out.filter(function (id, i) { return out.indexOf(id) === i && !!id; });
}

// Push one notification to multiple recipients. readBy tracks per-user reads.
function ucPushNotification(recipients, type, title, body) {
    var targets = ucResolveRecipients(recipients);
    if (!targets.length) return;
    var notes = ucGetNotes();
    var from = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.firstName + ' ' + currentUser.lastName : 'System';
    targets.forEach(function (id) {
        notes.push({
            id: 'ucn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            to: id,
            type: type || 'info',
            title: title || 'Notification',
            body: body || '',
            from: from.trim(),
            createdAt: new Date().toISOString(),
            readBy: []
        });
    });
    ucSaveNotes(notes);
    ucRefreshBell();
}

// Hook fired by updateSession() when status changes → notify both parties.
function ucSessionStatusHook(session, status) {
    if (!session || !status) return;
    var who = session.studentId && session.mentorId ? [session.studentId, session.mentorId] : [];
    var when = (session.date || '') + (session.time ? ' at ' + session.time : '');
    var topic = session.topic || 'Mentorship session';
    var map = {
        confirmed: ['session-confirmed', 'Session confirmed', topic + ' on ' + when + ' was confirmed by the mentor.'],
        declined: ['session-declined', 'Session declined', topic + ' on ' + when + ' was declined.'],
        cancelled: ['session-cancelled', 'Session cancelled', topic + ' on ' + when + ' was cancelled.'],
        completed: ['session-completed', 'Session completed', topic + ' on ' + when + ' was marked completed. Leave a review!']
    };
    var entry = map[status];
    if (!entry) return;
    ucPushNotification(who, entry[0], entry[1], entry[2]);
}

function ucCurrentUser() {
    return (typeof currentUser !== 'undefined') ? currentUser : null;
}

function ucMyNotes() {
    var me = ucCurrentUser();
    if (!me) return [];
    return ucGetNotes().filter(function (n) { return n.to === me.id || n.to === me.email; })
        .sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });
}

function ucUnreadCount() {
    var me = ucCurrentUser();
    if (!me) return 0;
    return ucMyNotes().filter(function (n) { return (n.readBy || []).indexOf(me.id) === -1; }).length;
}

function ucMarkAllRead() {
    var me = ucCurrentUser();
    if (!me) return;
    var notes = ucGetNotes();
    notes.forEach(function (n) {
        if (n.to === me.id && (n.readBy || []).indexOf(me.id) === -1) {
            n.readBy = (n.readBy || []).concat([me.id]);
        }
    });
    ucSaveNotes(notes);
    ucRefreshBell();
}

function ucClearMyNotes() {
    var me = ucCurrentUser();
    if (!me) return;
    ucSaveNotes(ucGetNotes().filter(function (n) { return n.to !== me.id; }));
    ucRefreshBell();
}

function ucTimeAgo(iso) {
    var secs = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (secs < 60) return 'just now';
    var mins = Math.floor(secs / 60);
    if (mins < 60) return mins + 'm ago';
    var hours = Math.floor(mins / 60);
    if (hours < 24) return hours + 'h ago';
    return Math.floor(hours / 24) + 'd ago';
}

// ======================================================================
// Floating bell — injected into document.body so it shows on EVERY screen
// ======================================================================

function ucEnsureBell() {
    if (document.getElementById('uc-bell-panel')) return;
    // Shared notifications panel — anchored to the header bell button (student/mentor)
    var panel = document.createElement('div');
    panel.id = 'uc-bell-panel';
    panel.className = 'hidden';
    panel.innerHTML =
        '<div class="ucn-head"><h4>Notifications</h4>' +
        '<div><button id="ucn-read-all">Mark all read</button>' +
        '<button id="ucn-clear">Clear</button></div></div>' +
        '<div class="ucn-tabs" id="ucn-tabs">' +
        '<button class="ucn-tab active" data-filter="all">All</button>' +
        '<button class="ucn-tab" data-filter="unread">Unread</button>' +
        '</div>' +
        '<div id="ucn-list"></div>';
    document.body.appendChild(panel);
    ucApplyBellStyle();
    ucBindBellEvents();
    ucRefreshBell();
    document.addEventListener('click', function (e) {
        var panel = document.getElementById('uc-bell-panel');
        if (!panel || panel.classList.contains('hidden')) return;
        if (panel.contains(e.target)) return;
        if (e.target.closest && e.target.closest('.notification-button')) return;
        panel.classList.add('hidden');
    });
}

function ucApplyBellStyle() {
    var style = document.createElement('style');
    style.textContent =
        '#uc-bell-panel{position:fixed;z-index:9998;width:340px;max-height:460px;background:#fff;' +
        'border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 8px 30px rgba(15,23,42,.18);overflow:hidden;display:flex;flex-direction:column;}' +
        '#uc-bell-panel.hidden{display:none;}' +
        '.ucn-head{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid #e2e8f0;background:#f8fafc;}' +
        '.ucn-head h4{margin:0;font-size:15px;color:#0f172a;}' +
        '.ucn-head button{border:none;background:none;color:#2563eb;font-size:12px;cursor:pointer;margin-left:10px;padding:0;}' +
        '.ucn-head button:hover{text-decoration:underline;}' +
        '#ucn-list{overflow-y:auto;}' +
        '.ucn-item{display:flex;gap:10px;padding:12px 14px;border-bottom:1px solid #f1f5f9;}' +
        '.ucn-item.unread{background:#eff6ff;}' +
        '.ucn-item:last-child{border-bottom:none;}' +
        '.ucn-chip{font-size:10px;font-weight:700;padding:3px 8px;border-radius:9px;white-space:nowrap;height:fit-content;}' +
        '.ucn-blue{background:#dbeafe;color:#1d4ed8;}.ucn-teal{background:#ccfbf1;color:#0f766e;}' +
        '.ucn-orange{background:#ffedd5;color:#c2410c;}.ucn-green{background:#dcfce7;color:#15803d;}' +
        '.ucn-red{background:#fee2e2;color:#b91c1c;}.ucn-gray{background:#f1f5f9;color:#475569;}' +
        '.ucn-title{font-size:13px;font-weight:600;color:#0f172a;margin:0 0 2px;}' +
        '.ucn-body{font-size:12px;color:#475569;margin:0 0 3px;}' +
        '.ucn-meta{font-size:11px;color:#94a3b8;margin:0;}' +
        '.ucn-empty{padding:30px 20px;text-align:center;color:#94a3b8;font-size:13px;}' +
        '.ucn-tabs{display:flex;gap:6px;padding:8px 14px;border-bottom:1px solid #f1f5f9;}' +
        '.ucn-tab{flex:1;border:1px solid #e2e8f0;background:#fff;border-radius:999px;padding:4px 10px;font-size:12px;cursor:pointer;color:#475569;}' +
        '.ucn-tab.active{background:#2563eb;color:#fff;border-color:#2563eb;}' +
        '.ucn-read{opacity:.72;}' +
        '.ucn-dot{width:8px;height:8px;border-radius:50%;background:#2563eb;flex-shrink:0;margin-top:5px;}' ;
    document.head.appendChild(style);
}

function ucBindBellEvents() {
    // Header bell buttons (student + mentor + admin) open the shared notifications panel.
    document.querySelectorAll('.notification-button').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var panel = document.getElementById('uc-bell-panel');
            if (!panel.classList.contains('hidden')) { panel.classList.add('hidden'); return; }
            ucNotesFilter = 'all'; // opening the bell always shows the full history
            document.querySelectorAll('#ucn-tabs .ucn-tab').forEach(function (t) {
                t.classList.toggle('active', t.getAttribute('data-filter') === 'all');
            });
            var rect = btn.getBoundingClientRect();
            panel.style.top = (rect.bottom + 8) + 'px';
            panel.style.right = Math.max(10, window.innerWidth - rect.right) + 'px';
            panel.classList.remove('hidden');
            ucRefreshBell();
        });
    });
    document.getElementById('ucn-read-all').addEventListener('click', ucMarkAllRead);
    document.getElementById('ucn-clear').addEventListener('click', ucClearMyNotes);
    document.getElementById('ucn-tabs').addEventListener('click', function (e) {
        var tab = e.target.closest('.ucn-tab');
        if (!tab) return;
        ucNotesFilter = tab.getAttribute('data-filter') === 'unread' ? 'unread' : 'all';
        document.querySelectorAll('#ucn-tabs .ucn-tab').forEach(function (t) {
            t.classList.toggle('active', t.getAttribute('data-filter') === ucNotesFilter);
        });
        ucRefreshBell();
    });
    // Outside click close is handled by the listener bound in ucEnsureBell().
    // cross-tab sync: another tab wrote notifications → refresh badge/list
    window.addEventListener('storage', function (e) {
        if (e.key === UC_NOTES_TAB_KEY || e.key === UC_NOTES_KEY) ucRefreshBell();
    });
}

function ucEscape(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;').replace(/'/g, '&#39;');
}

function ucRefreshBell() {
    var me = ucCurrentUser();
    var unread = me ? ucUnreadCount() : 0;
    // Drive the header bell badges (student + mentor + admin navs).
    document.querySelectorAll('.notification-badge').forEach(function (badge) {
        badge.textContent = unread > 0 ? (unread > 9 ? '9+' : String(unread)) : '';
        badge.classList.toggle('has-unread', unread > 0);
    });
    var panel = document.getElementById('uc-bell-panel');
    if (!panel || panel.classList.contains('hidden')) return;

    var list = document.getElementById('ucn-list');
    var notes = ucMyNotes(); // EVERY notification for this user — read + unread
    var total = notes.length;
    if (ucNotesFilter === 'unread') {
        notes = notes.filter(function (n) { return (n.readBy || []).indexOf(me.id) === -1; });
    }
    var unreadShown = notes.filter(function (n) { return (n.readBy || []).indexOf(me.id) === -1; }).length;
    var allTab = document.querySelector('#ucn-tabs .ucn-tab[data-filter="all"]');
    var unreadTab = document.querySelector('#ucn-tabs .ucn-tab[data-filter="unread"]');
    if (allTab) allTab.textContent = 'All (' + total + ')';
    if (unreadTab) unreadTab.textContent = 'Unread (' + unreadShown + ')';
    if (!notes.length) {
        list.innerHTML = '<div class="ucn-empty">' + (ucNotesFilter === 'unread'
            ? 'No unread notifications.<br>Switch to "All" to see the full history.'
            : 'No notifications yet.<br>You will see session updates here.') + '</div>';
        return;
    }
    list.innerHTML = notes.map(function (n) {
        var meta = UC_TYPE_META[n.type] || UC_TYPE_META.info;
        var unread = (n.readBy || []).indexOf(me.id) === -1;
        return '<div class="ucn-item' + (unread ? ' unread' : ' read') + '">' +
            (unread ? '<span class="ucn-dot"></span>' : '') +
            '<span class="ucn-chip ' + meta[0] + '">' + ucEscape(meta[1]) + '</span>' +
            '<div><p class="ucn-title">' + ucEscape(n.title) + '</p>' +
            '<p class="ucn-body">' + ucEscape(n.body) + '</p>' +
            '<p class="ucn-meta">' + ucEscape(n.from) + ' · ' + ucTimeAgo(n.createdAt) + '</p></div>' +
            '</div>';
    }).join('');
}

// Keep the bell on every screen and its badge live at all times.
setInterval(ucRefreshBell, 1500);
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ucEnsureBell);
} else {
    ucEnsureBell();
}

var UC_TYPE_META = {
    'signup': ['ucn-blue', 'New member'],
    'verification': ['ucn-teal', 'Verification'],
    'session-request': ['ucn-orange', 'Request'],
    'session-confirmed': ['ucn-green', 'Confirmed'],
    'session-declined': ['ucn-red', 'Declined'],
    'session-cancelled': ['ucn-red', 'Cancelled'],
    'session-completed': ['ucn-green', 'Completed'],
    'review': ['ucn-blue', 'Review'],
    'message': ['ucn-blue', 'Message'],
    'info': ['ucn-gray', 'Info']
};
