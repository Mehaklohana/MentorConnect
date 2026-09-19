/* ========================================
   MENTORCONNECT - APPLICATION LOGIC
   ======================================== */

// APP STATE
let currentUser = null;
let selectedRole = null;
let previousScreen = 'welcome-screen';
let navigationHistory = []; // Trail of visited screens — Back walks through it one by one, ending at Home
let tempUserData = {};

const RECENT_LOGIN_EMAILS_KEY = 'mentorconnect_recent_login_emails';

function getRecentLoginEmails() {
    try {
        const emails = JSON.parse(localStorage.getItem(RECENT_LOGIN_EMAILS_KEY) || '[]');
        return Array.isArray(emails) ? emails : [];
    } catch (error) {
        return [];
    }
}

function rememberLoginEmail(email) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;
    const emails = getRecentLoginEmails().filter(savedEmail => savedEmail !== normalizedEmail);
    emails.unshift(normalizedEmail);
    localStorage.setItem(RECENT_LOGIN_EMAILS_KEY, JSON.stringify(emails.slice(0, 5)));
}

function renderRecentLoginEmails() {
    const emails = getRecentLoginEmails();
    ['recent-login-emails', 'recent-signup-emails'].forEach(listId => {
        const list = document.getElementById(listId);
        if (list) {
            list.innerHTML = emails.map(email => `<option value="${email}"></option>`).join('');
        }
    });
}

// INITIALIZE APP
document.addEventListener('DOMContentLoaded', function() {
    renderRecentLoginEmails();
    // Check for existing session using new authentication system
    const sessionUser = validateSession();
    if (sessionUser) {
        currentUser = sessionUser;
        if (currentUser.role === 'student') {
            showSplashThen(showStudentDashboard);
        } else if (currentUser.role === 'mentor') {
            showSplashThen(isMentorApproved(currentUser) ? showMentorDashboard : showMentorVerificationScreen);
        } else if (currentUser.role === 'admin') {
            showSplashThen(showAdminDashboard);
        } else {
            showSplashThenWelcome();
        }
    } else {
        // Fallback to legacy session check
        const savedUser = localStorage.getItem('mentorconnect_currentUser');
        if (savedUser) {
            currentUser = sanitizeUser(JSON.parse(savedUser));
            const users = getUsers();
            const userExists = users.find(u => u.id === currentUser.id);
            if (userExists) {
                currentUser = userExists;
                // Create new session
                createSession(currentUser, true);
                if (currentUser.role === 'student') {
                    showSplashThen(showStudentDashboard);
                } else if (currentUser.role === 'mentor') {
                    showSplashThen(isMentorApproved(currentUser) ? showMentorDashboard : showMentorVerificationScreen);
                } else if (currentUser.role === 'admin') {
                    showSplashThen(showAdminDashboard);
                } else {
                    showSplashThenWelcome();
                }
            } else {
                clearSession();
                showSplashThenWelcome();
            }
        } else {
            showSplashThenWelcome();
        }
    }
});

// SPLASH SCREEN
function showSplashThen(callback) {
    const splash = document.getElementById('splash-screen');
    splash.classList.add('active');
    setTimeout(() => {
        splash.classList.remove('active');
        callback();
    }, 2800);
}

function showSplashThenWelcome() {
    showSplashThen(() => navigateTo('welcome-screen'));
}

// NAVIGATION
function navigateTo(screenId) {
    // Save previous screen for back navigation
    const currentActive = document.querySelector('.screen.active');
    if (currentActive) {
        previousScreen = currentActive.id;
    }

    // Hide all screens
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });

    // Show target screen
    const target = document.getElementById(screenId);
    if (target) {
        target.classList.add('active');
        window.scrollTo(0, 0);
    }
}

function goBack() {
    // Walk back through the visited screens one by one.
    // When the trail is exhausted (or only auth screens remain), go Home.
    var authScreens = ['splash-screen', 'welcome-screen', 'login-screen', 'signup-screen', 'forgot-screen', 'verify-email-screen', 'reset-password-screen', 'role-screen', 'profile-setup-screen', 'admin-login-screen'];
    var activeEl = document.querySelector('.screen.active');
    var currentId = activeEl ? activeEl.id : null;
    var target = null;
    while (navigationHistory.length > 0) {
        var candidate = navigationHistory.pop();
        if (candidate !== currentId && authScreens.indexOf(candidate) === -1) {
            target = candidate;
            break;
        }
    }
    if (target) {
        navigateTo(target, { fromBack: true });
    } else {
        goHome();
    }
}

// GO HOME - Navigate to the appropriate dashboard based on user role
function goHome() {
    if (currentUser && currentUser.role === 'student') {
        showStudentDashboard();
    } else if (currentUser && currentUser.role === 'mentor') {
        showMentorDashboard();
    } else if (currentUser && currentUser.role === 'admin') {
        showAdminDashboard();
    } else {
        navigateTo('welcome-screen');
    }
}

// TOAST NOTIFICATIONS
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    toastMessage.textContent = message;
    toast.className = 'toast ' + type + ' show';
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function showNotifications() {
    showToast('No new notifications', 'info');
}

// LOCAL STORAGE HELPERS
function getUsers() {
    const users = localStorage.getItem('mentorconnect_users');
    return users ? JSON.parse(users) : [];
}

function saveUsers(users) {
    localStorage.setItem('mentorconnect_users', JSON.stringify(users));
}

function saveCurrentUser(user) {
    currentUser = sanitizeUser(user);
    localStorage.setItem('mentorconnect_currentUser', JSON.stringify(currentUser));
}

function getMentorVerificationStatus(user) {
    if (!user || user.role !== 'mentor') return 'approved';
    return user.mentorVerificationStatus || 'approved';
}

function isMentorApproved(user) {
    return getMentorVerificationStatus(user) === 'approved';
}

// TOGGLE PASSWORD VISIBILITY
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const isVisible = input.type === 'password';
    input.type = isVisible ? 'text' : 'password';

    const toggle = input.closest('.input-wrapper')?.querySelector('.toggle-password');
    if (!toggle) return;
    toggle.setAttribute('aria-label', isVisible ? 'Hide password' : 'Show password');
    toggle.setAttribute('aria-pressed', String(isVisible));
    toggle.innerHTML = isVisible
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 102.8 2.8"/><path d="M9.9 4.2A10.8 10.8 0 0112 4c7 0 11 8 11 8a20 20 0 01-3.1 4.2M6.2 6.2C3.5 8.1 1 12 1 12s4 8 11 8a10.8 10.8 0 004.1-.8"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
}

function sanitizeUser(user) {
    if (!user) return null;
    const safeUser = { ...user };
    delete safeUser.password;
    delete safeUser.passwordHash;
    return safeUser;
}

function createOneTimeCode() {
    if (window.crypto && crypto.getRandomValues) {
        const values = new Uint32Array(1);
        crypto.getRandomValues(values);
        return String(values[0] % 1000000).padStart(6, '0');
    }
    return String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
}

function saveAuthCode(key, userId, code) {
    localStorage.setItem(key + userId, JSON.stringify({
        codeHash: hashPassword(code),
        expiresAt: Date.now() + 15 * 60 * 1000
    }));
}

function getAuthCode(key, userId) {
    try {
        const record = JSON.parse(localStorage.getItem(key + userId) || 'null');
        if (!record || Date.now() > record.expiresAt) {
            localStorage.removeItem(key + userId);
            return null;
        }
        return record;
    } catch (error) {
        localStorage.removeItem(key + userId);
        return null;
    }
}

function showDevelopmentCode(elementId, label, code) {
    const element = document.getElementById(elementId);
    if (!element) return;
    element.textContent = `Development mode: ${label} ${code} (expires in 15 minutes)`;
    element.hidden = false;
}

// PASSWORD STRENGTH INDICATOR
function updatePasswordStrength() {
    const password = document.getElementById('signup-password').value;
    const strengthDiv = document.getElementById('password-strength');
    const strengthFill = document.getElementById('strength-fill');
    const strengthText = document.getElementById('strength-text');
    
    if (password.length === 0) {
        strengthDiv.style.display = 'none';
        return;
    }
    
    strengthDiv.style.display = 'block';
    const result = checkPasswordStrength(password);
    
    const percentage = (result.strength / 5) * 100;
    strengthFill.style.width = percentage + '%';
    strengthFill.style.backgroundColor = result.color;
    strengthText.textContent = result.level;
    strengthText.style.color = result.color;
}

// PASSWORD MATCH CHECKER
function checkPasswordMatch() {
    const password = document.getElementById('signup-password').value;
    const confirm = document.getElementById('signup-confirm').value;
    const matchSpan = document.getElementById('password-match');
    
    if (confirm.length === 0) {
        matchSpan.textContent = '';
        return;
    }
    
    if (password === confirm) {
        matchSpan.textContent = '✓ Passwords match';
        matchSpan.className = 'password-match match';
    } else {
        matchSpan.textContent = '✗ Passwords do not match';
        matchSpan.className = 'password-match mismatch';
    }
}

// ========================================
// AUTHENTICATION
// ========================================

// SIGNUP
function handleSignup(event) {
    event.preventDefault();

    const firstName = document.getElementById('signup-firstname').value.trim();
    const lastName = document.getElementById('signup-lastname').value.trim();
    const email = document.getElementById('signup-email').value.trim().toLowerCase();
    const password = document.getElementById('signup-password').value;
    const confirmPassword = document.getElementById('signup-confirm').value;

    rememberLoginEmail(email);
    renderRecentLoginEmails();

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showToast('Please enter a valid email address', 'error');
        return;
    }

    // Name validation
    if (firstName.length < 2 || lastName.length < 2) {
        showToast('First and last name must be at least 2 characters', 'error');
        return;
    }

    // Validation
    if (password !== confirmPassword) {
        showToast('Passwords do not match', 'error');
        return;
    }

    if (password.length < 8) {
        showToast('Password must be at least 8 characters', 'error');
        return;
    }

    // Check password strength
    const strength = checkPasswordStrength(password);
    if (strength.strength < 4) {
        showToast('Password is too weak. ' + strength.feedback.join(', ') + '.', 'error');
        return;
    }

    // Check if email already exists
    const users = getUsers();
    if (users.find(u => u.email === email)) {
        showToast('An account with this email already exists', 'error');
        return;
    }

    // Create user with hashed password
    const newUser = {
        id: generateId(),
        firstName,
        lastName,
        email,
        password: hashPassword(password),
        role: null,
        photo: null,
        bio: '',
        skills: [],
        interests: [],
        linkedin: '',
        github: '',
        university: '',
        major: '',
        year: '',
        company: '',
        position: '',
        experience: '',
        profileCompleted: false,
        mentorVerificationStatus: 'not_submitted',
        connectedMentors: 0,
        sessions: 0,
        studentsMentored: 0,
        rating: 0,
        emailVerified: false,
        createdAt: new Date().toISOString()
    };

    newUser.isNewRegistration = true; // surfaces on the admin bell + Users tab
    users.push(newUser);
    saveUsers(users);

    // Best-effort feed so the admin portal is notified about new members even
    // when they sign up from another device (e.g. a visitor via the ngrok URL).
    notifyServerOfRegistration(newUser);
    if (typeof ucPushNotification === 'function') {
        ucPushNotification(['admin'], 'signup', 'New member joined',
            firstName + ' ' + lastName + ' created an account (' + email + ').');
    }

    // Set current user and store temp data
    currentUser = sanitizeUser(newUser);
    tempUserData = { userId: newUser.id };
    
    const verificationCode = createOneTimeCode();
    saveAuthCode('mentorconnect_email_verification_', newUser.id, verificationCode);
    tempUserData = { userId: newUser.id };
    showDevelopmentCode('verification-demo-code', 'verification code:', verificationCode);
    showToast('Account created. Verify your email to continue.', 'success');
    navigateTo('verify-email-screen');
}

// FIRE-AND-FORGET SERVER REGISTRATION FEED
// Posts each new account to /api/registrations so the admin portal can pick it
// up from any device. Fails silently when the API server is not running
// (e.g. opening index.html directly) — localStorage-only notifications still work.
function notifyServerOfRegistration(user) {
    try {
        if (typeof fetch !== 'function' || window.location.protocol === 'file:') return;
        fetch('/api/registrations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                role: user.role || 'student',
                passwordHash: user.password,
                createdAt: user.createdAt || new Date().toISOString()
            })
        }).catch(function () { /* server not running — ignore */ });
    } catch (error) { /* ignore */ }
}

// LOGIN
function handleLogin(event) {
    event.preventDefault();

    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;

    rememberLoginEmail(email);
    renderRecentLoginEmails();
    
    // Check if account is locked
    const lockStatus = isAccountLocked(email);
    if (lockStatus.locked) {
        showToast(`Account locked. Try again in ${lockStatus.minutesLeft} minutes.`, 'error');
        return;
    }

    const users = getUsers();
    
    const user = users.find(u => u.email === email && verifyPassword(password, u.password));

    if (!user) {
        const attempts = recordFailedAttempt(email);
        const remainingAttempts = 5 - attempts.count;
        
        if (remainingAttempts > 0) {
            showToast(`Invalid email or password. ${remainingAttempts} attempts remaining.`, 'error');
        } else {
            showToast('Account locked for 15 minutes due to too many failed attempts.', 'error');
        }
        return;
    }

    if (user.emailVerified === false) {
        tempUserData = { userId: user.id };
        const verificationCode = createOneTimeCode();
        saveAuthCode('mentorconnect_email_verification_', user.id, verificationCode);
        showDevelopmentCode('verification-demo-code', 'verification code:', verificationCode);
        showToast('Please verify your email before signing in.', 'error');
        navigateTo('verify-email-screen');
        return;
    }

    // Reset failed attempts on successful login
    resetFailedAttempts(email);
    
    // Create session
    const rememberMe = document.getElementById('login-remember')?.checked || false;
    createSession(user, rememberMe);
    
    currentUser = sanitizeUser(user);
    saveCurrentUser(currentUser);

    if (user.role === 'mentor' && !isMentorApproved(user)) {
        selectedRole = 'mentor';
        if (!user.profileCompleted) {
            setupProfileSetupScreen();
            navigateTo('profile-setup-screen');
        } else {
            showMentorVerificationScreen();
        }
        return;
    }

    showToast('Welcome back, ' + user.firstName + '!', 'success');

    // Navigate based on role
    if (user.role === 'admin') {
        showAdminDashboard();
    } else if (!user.role) {
        navigateTo('role-screen');
    } else if (user.role === 'student') {
        showStudentDashboard();
    } else {
        showMentorDashboard();
    }
}

// ADMIN LOGIN
function handleAdminLogin(event) {
    event.preventDefault();

    const email = document.getElementById('admin-email').value.trim().toLowerCase();
    const password = document.getElementById('admin-password').value;
    
    // Check if account is locked
    const lockStatus = isAccountLocked(email);
    if (lockStatus.locked) {
        showToast(`Account locked. Try again in ${lockStatus.minutesLeft} minutes.`, 'error');
        return;
    }

    const users = getUsers();
    
    const user = users.find(u => u.email === email && u.role === 'admin' && verifyPassword(password, u.password));

    if (!user) {
        const attempts = recordFailedAttempt(email);
        const remainingAttempts = 5 - attempts.count;
        
        if (remainingAttempts > 0) {
            showToast(`Invalid admin credentials. ${remainingAttempts} attempts remaining.`, 'error');
        } else {
            showToast('Account locked for 15 minutes due to too many failed attempts.', 'error');
        }
        return;
    }

    // Reset failed attempts
    resetFailedAttempts(email);
    
    // Create session
    const rememberMe = document.getElementById('admin-remember')?.checked || false;
    createSession(user, rememberMe);

    currentUser = sanitizeUser(user);
    saveCurrentUser(currentUser);
    showToast('Welcome, ' + user.firstName + '! Admin portal unlocked.', 'success');
    showAdminDashboard();
}

// FORGOT PASSWORD
function handleForgotPassword(event) {
    event.preventDefault();

    const email = document.getElementById('forgot-email').value.trim().toLowerCase();
    const users = getUsers();
    const user = users.find(u => u.email === email);

    if (user) {
        const resetCode = createOneTimeCode();
        saveAuthCode('mentorconnect_password_reset_', user.id, resetCode);
        tempUserData = { userId: user.id };
        showDevelopmentCode('forgot-demo-code', 'reset code:', resetCode);
        showDevelopmentCode('reset-demo-code', 'reset code:', resetCode);
        showToast('If an account exists, a reset code has been sent.', 'success');
        setTimeout(() => navigateTo('reset-password-screen'), 700);
    } else {
        showToast('If an account exists with this email, a reset link has been sent.', 'info');
    }
}

function handleEmailVerification(event) {
    event.preventDefault();
    const userId = tempUserData.userId;
    const code = document.getElementById('verification-code').value.trim();
    const record = getAuthCode('mentorconnect_email_verification_', userId);
    if (!record || record.codeHash !== hashPassword(code)) {
        showToast('That verification code is invalid or expired.', 'error');
        return;
    }
    const users = getUsers();
    const userIndex = users.findIndex(user => user.id === userId);
    if (userIndex === -1) {
        showToast('We could not find that account.', 'error');
        return;
    }
    users[userIndex].emailVerified = true;
    saveUsers(users);
    localStorage.removeItem('mentorconnect_email_verification_' + userId);
    currentUser = sanitizeUser(users[userIndex]);
    tempUserData = { userId };
    showToast('Email verified. Choose your role to continue.', 'success');
    navigateTo('role-screen');
}

function resendVerificationCode(event) {
    event.preventDefault();
    if (!tempUserData.userId) {
        showToast('Start signup again to request a verification code.', 'error');
        return;
    }
    const code = createOneTimeCode();
    saveAuthCode('mentorconnect_email_verification_', tempUserData.userId, code);
    showDevelopmentCode('verification-demo-code', 'verification code:', code);
    showToast('A new verification code has been sent.', 'success');
}

function updateResetPasswordStrength() {
    const password = document.getElementById('reset-password').value;
    const strength = checkPasswordStrength(password);
    const container = document.getElementById('reset-password-strength');
    container.hidden = password.length === 0;
    document.getElementById('reset-strength-fill').style.width = `${(strength.strength / 5) * 100}%`;
    document.getElementById('reset-strength-fill').style.backgroundColor = strength.color;
    document.getElementById('reset-strength-text').textContent = strength.level;
    document.getElementById('reset-strength-text').style.color = strength.color;
}

function handlePasswordReset(event) {
    event.preventDefault();
    const userId = tempUserData.userId;
    const code = document.getElementById('reset-code').value.trim();
    const password = document.getElementById('reset-password').value;
    const confirmation = document.getElementById('reset-confirm-password').value;
    const record = getAuthCode('mentorconnect_password_reset_', userId);
    const strength = checkPasswordStrength(password);
    if (!record || record.codeHash !== hashPassword(code)) {
        showToast('That reset code is invalid or expired.', 'error');
        return;
    }
    if (strength.strength < 4) {
        showToast('Choose a stronger password: ' + strength.feedback.join(', ') + '.', 'error');
        return;
    }
    if (password !== confirmation) {
        showToast('Passwords do not match.', 'error');
        return;
    }
    const users = getUsers();
    const userIndex = users.findIndex(user => user.id === userId);
    if (userIndex === -1) {
        showToast('We could not find that account.', 'error');
        return;
    }
    users[userIndex].password = hashPassword(password);
    saveUsers(users);
    localStorage.removeItem('mentorconnect_password_reset_' + userId);
    clearSession();
    tempUserData = {};
    document.getElementById('reset-password-form').reset();
    showToast('Password reset successfully. Sign in with your new password.', 'success');
    navigateTo('login-screen');
}

// LOGOUT
function handleLogout() {
    if (confirm("Are you sure you want to log out?")) {
        currentUser = null;
        navigationHistory = [];
        clearSession();
        localStorage.removeItem('mentorconnect_sessionExpiry');
        showToast('Logged out successfully', 'success');
        navigateTo('login-screen');
    }
}

// SESSION MANAGEMENT
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

function createSession(user, rememberMe = false) {
    const session = {
        userId: user.id,
        createdAt: Date.now(),
        expiresAt: rememberMe ? null : Date.now() + SESSION_DURATION,
        rememberMe: rememberMe
    };
    
    if (rememberMe) {
        localStorage.setItem('mentorconnect_session', JSON.stringify(session));
    } else {
        sessionStorage.setItem('mentorconnect_session', JSON.stringify(session));
    }
}

function validateSession() {
    let sessionData = sessionStorage.getItem('mentorconnect_session') || 
                      localStorage.getItem('mentorconnect_session');
    
    if (!sessionData) return null;
    
    try {
        const session = JSON.parse(sessionData);
        
        // Check if session is expired (only for non-remember-me sessions)
        if (session.expiresAt && Date.now() > session.expiresAt) {
            clearSession();
            return null;
        }
        
        // Verify user still exists
        const users = getUsers();
        const user = users.find(u => u.id === session.userId);
        if (!user) {
            clearSession();
            return null;
        }
        
        return sanitizeUser(user);
    } catch (e) {
        clearSession();
        return null;
    }
}

function clearSession() {
    sessionStorage.removeItem('mentorconnect_session');
    localStorage.removeItem('mentorconnect_session');
    localStorage.removeItem('mentorconnect_currentUser');
}

// PASSWORD HASHING (Simple hash for demo - in production use bcrypt on server)
function hashPassword(password) {
    let hash = 0;
    const salt = 'mentorconnect_salt_2024';
    const saltedPassword = salt + password + salt;
    
    for (let i = 0; i < saltedPassword.length; i++) {
        const char = saltedPassword.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return 'hashed_' + Math.abs(hash).toString(36);
}

function verifyPassword(password, hashedPassword) {
    return hashPassword(password) === hashedPassword;
}

// PASSWORD STRENGTH CHECKER
function checkPasswordStrength(password) {
    let strength = 0;
    const feedback = [];
    
    if (password.length >= 8) strength += 1;
    else feedback.push('At least 8 characters');
    
    if (password.length >= 12) strength += 1;
    
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength += 1;
    else feedback.push('Mix upper and lower case');
    
    if (/\d/.test(password)) strength += 1;
    else feedback.push('Include a number');
    
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) strength += 1;
    else feedback.push('Include a special character');
    
    let level, color;
    if (strength <= 2) { level = 'Weak'; color = '#C0565B'; }
    else if (strength <= 3) { level = 'Fair'; color = '#B7791F'; }
    else if (strength <= 4) { level = 'Good'; color = '#2878B5'; }
    else { level = 'Strong'; color = '#168F82'; }
    
    return { strength, level, color, feedback };
}

// FAILED LOGIN ATTEMPTS TRACKING
function getFailedAttempts(email) {
    const attempts = JSON.parse(localStorage.getItem('mentorconnect_failed_attempts') || '{}');
    return attempts[email] || { count: 0, lastAttempt: null, lockedUntil: null };
}

function recordFailedAttempt(email) {
    const attempts = JSON.parse(localStorage.getItem('mentorconnect_failed_attempts') || '{}');
    const current = attempts[email] || { count: 0, lastAttempt: null, lockedUntil: null };
    
    current.count += 1;
    current.lastAttempt = Date.now();
    
    // Lock account after 5 failed attempts for 15 minutes
    if (current.count >= 5) {
        current.lockedUntil = Date.now() + (15 * 60 * 1000);
    }
    
    attempts[email] = current;
    localStorage.setItem('mentorconnect_failed_attempts', JSON.stringify(attempts));
    return current;
}

function resetFailedAttempts(email) {
    const attempts = JSON.parse(localStorage.getItem('mentorconnect_failed_attempts') || '{}');
    delete attempts[email];
    localStorage.setItem('mentorconnect_failed_attempts', JSON.stringify(attempts));
}

function isAccountLocked(email) {
    const attempts = getFailedAttempts(email);
    if (attempts.lockedUntil && Date.now() < attempts.lockedUntil) {
        const minutesLeft = Math.ceil((attempts.lockedUntil - Date.now()) / (60 * 1000));
        return { locked: true, minutesLeft };
    }
    return { locked: false };
}

// ROLE SELECTION
function selectRole(role) {
    selectedRole = role;

    // Update UI
    document.querySelectorAll('.role-option').forEach(opt => {
        opt.classList.remove('selected');
    });

    const selectedOption = document.querySelector(`.role-option[onclick="selectRole('${role}')"]`);
    if (selectedOption) {
        selectedOption.classList.add('selected');
    }

    // Enable continue button
    document.getElementById('role-continue-btn').disabled = false;
}

function handleRoleContinue() {
    if (!selectedRole) return;

    // Update user role
    const users = getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser.id);
    if (userIndex !== -1) {
        users[userIndex].role = selectedRole;
        saveUsers(users);
        currentUser = users[userIndex];
        saveCurrentUser(currentUser);
    }

    // Show profile setup
    setupProfileSetupScreen();
    navigateTo('profile-setup-screen');
}

// PROFILE SETUP
function setupProfileSetupScreen() {
    const studentFields = document.getElementById('student-fields');
    const mentorFields = document.getElementById('mentor-fields');

    if (selectedRole === 'student') {
        studentFields.style.display = 'block';
        mentorFields.style.display = 'none';
    } else {
        studentFields.style.display = 'none';
        mentorFields.style.display = 'block';
    }
}

function handlePhotoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
        showToast('Image must be less than 2MB', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const preview = document.getElementById('photo-preview');
        preview.innerHTML = `<img src="${e.target.result}" alt="Profile Photo">`;
        tempUserData.photo = e.target.result;
    };
    reader.readAsDataURL(file);
}

function handleProfileSetup(event) {
    event.preventDefault();

    const bio = document.getElementById('setup-bio').value.trim();
    const linkedin = document.getElementById('setup-linkedin').value.trim();
    const github = document.getElementById('setup-github').value.trim();

    const users = getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser.id);

    if (userIndex === -1) {
        showToast('Error: User not found', 'error');
        return;
    }

    users[userIndex].bio = bio;
    users[userIndex].linkedin = linkedin;
    users[userIndex].github = github;

    if (tempUserData.photo) {
        users[userIndex].photo = tempUserData.photo;
    }

    if (selectedRole === 'student') {
        users[userIndex].university = document.getElementById('setup-university').value.trim();
        users[userIndex].major = document.getElementById('setup-major').value.trim();
        users[userIndex].year = document.getElementById('setup-year').value;
    } else {
        users[userIndex].company = document.getElementById('setup-company').value.trim();
        users[userIndex].position = document.getElementById('setup-position').value.trim();
        users[userIndex].experience = document.getElementById('setup-experience').value;
        users[userIndex].profileCompleted = true;
        if (!users[userIndex].mentorVerificationStatus) {
            users[userIndex].mentorVerificationStatus = 'not_submitted';
        }
    }

    saveUsers(users);
    currentUser = users[userIndex];
    saveCurrentUser(currentUser);

    // Navigate to dashboard
    if (currentUser.role === 'student') {
        showToast('Profile completed successfully!', 'success');
        showStudentDashboard();
    } else {
        showToast('Profile saved. Request admin verification to continue.', 'success');
        showMentorVerificationScreen();
    }
    toggleAiFabVisibility();
}

function showMentorVerificationScreen() {
    navigateTo('mentor-verification-screen');
    renderMentorVerificationScreen();
}

function renderMentorVerificationScreen() {
    if (!currentUser) return;
    const users = getUsers();
    const user = users.find(item => item.id === currentUser.id) || currentUser;
    const status = getMentorVerificationStatus(user);
    const statusEl = document.getElementById('mentor-verification-status');
    const messageEl = document.getElementById('mentor-verification-message');
    const requestButton = document.getElementById('mentor-verification-request');
    if (!statusEl || !messageEl || !requestButton) return;

    statusEl.textContent = status === 'approved' ? 'Verified' : status === 'pending' ? 'Pending review' : 'Profile ready';
    statusEl.className = 'status-pill ' + status;
    messageEl.textContent = status === 'approved'
        ? 'Your mentor profile has been verified. You can now use your mentor account.'
        : status === 'pending'
            ? 'Your request is with the admin. You will be able to use your mentor account after approval.'
            : 'Your profile is complete. Send it to the admin for verification before using your mentor account.';
    requestButton.hidden = status !== 'not_submitted';
}

function submitMentorVerification() {
    if (!currentUser || currentUser.role !== 'mentor') return;
    const users = getUsers();
    const user = users.find(item => item.id === currentUser.id);
    if (!user || !user.profileCompleted) {
        showToast('Complete your mentor profile first.', 'error');
        navigateTo('profile-setup-screen');
        return;
    }
    user.mentorVerificationStatus = 'pending';
    user.mentorVerificationRequestedAt = new Date().toISOString();
    saveUsers(users);
    currentUser = sanitizeUser(user);
    saveCurrentUser(currentUser);
    showToast('Verification request sent to the admin.', 'success');
    if (typeof ucPushNotification === 'function') {
        ucPushNotification(['admin'], 'verification', 'Mentor verification request',
            user.firstName + ' ' + user.lastName + ' submitted mentor verification and is awaiting admin approval.');
        ucPushNotification([user.id], 'verification', 'Verification submitted',
            'Your mentor verification request was sent to the admin for approval.');
    }
    renderMentorVerificationScreen();
}

// ========================================
// DASHBOARDS
// ========================================

// STUDENT DASHBOARD
function showStudentDashboard() {
    navigateTo('student-dashboard');
    updateStudentDashboard();
}

function updateStudentDashboard() {
    if (!currentUser) return;

    // Update name
    document.getElementById('dash-firstname-student').textContent = currentUser.firstName;
    document.getElementById('nav-name-student').textContent = currentUser.firstName + ' ' + currentUser.lastName;

    // Update avatar
    const navAvatar = document.getElementById('nav-avatar-student');
    if (currentUser.photo) {
        navAvatar.innerHTML = `<img src="${currentUser.photo}" alt="Avatar">`;
    }

    // Update stats (derive from real session data - same logic as the mentor dashboard)
    const mySessions = getSessions().filter(s =>
        s.studentId === currentUser.id && !['cancelled', 'rejected'].includes(s.status)
    );
    const connectedMentorCount = new Set(mySessions.map(s => s.mentorId)).size;
    document.getElementById('stat-mentors').textContent = connectedMentorCount;
    document.getElementById('stat-sessions').textContent = mySessions.length;
    document.getElementById('stat-skills').textContent = currentUser.skills ? currentUser.skills.length : 0;

    // Update skills list
    const skillsList = document.getElementById('student-skills-list');
    if (currentUser.skills && currentUser.skills.length > 0) {
        skillsList.innerHTML = currentUser.skills.map(skill =>
            `<span class="skill-tag">${skill}<span class="remove-tag" onclick="removeSkill('${skill}')">&times;</span></span>`
        ).join('');
    } else {
        skillsList.innerHTML = '<span class="empty-state">No skills added yet</span>';
    }

    // Update interests list
    const interestsList = document.getElementById('student-interests-list');
    if (currentUser.interests && currentUser.interests.length > 0) {
        interestsList.innerHTML = currentUser.interests.map(interest =>
            `<span class="skill-tag">${interest}<span class="remove-tag" onclick="removeInterest('${interest}')">&times;</span></span>`
        ).join('');
    } else {
        interestsList.innerHTML = '<span class="empty-state">No interests added yet</span>';
    }

    // Show recommended mentors
    updateRecommendedMentors();
}

function updateRecommendedMentors() {
    const container = document.getElementById('recommended-mentors');
    const users = getUsers();
    const mentors = users.filter(u => u.role === 'mentor' && u.id !== currentUser.id);

    if (mentors.length === 0) {
        container.innerHTML = '<p class="empty-state">No mentors available yet</p>';
        return;
    }

    container.innerHTML = mentors.slice(0, 4).map(mentor => `
        <div class="mentor-card" onclick="viewMentorDetail('${mentor.id}')">
            <div class="mentor-card-header">
                <div class="mentor-card-avatar">
                    ${mentor.photo ? `<img src="${mentor.photo}" alt="${mentor.firstName}">` :
                    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                    </svg>`}
                </div>
                <div class="mentor-card-info">
                    <h4>${mentor.firstName} ${mentor.lastName}</h4>
                    <p>${mentor.position || 'Mentor'} ${mentor.company ? 'at ' + mentor.company : ''}</p>
                </div>
            </div>
            <div class="mentor-card-skills">
                ${(mentor.skills || []).slice(0, 3).map(s => `<span>${s}</span>`).join('')}
            </div>
        </div>
    `).join('');
}

function showStudentSection(section) {
    // Update nav links
    document.querySelectorAll('#student-dashboard .nav-link').forEach(link => {
        link.classList.remove('active');
    });
    event.target.classList.add('active');
}

// MENTOR DASHBOARD
function showMentorDashboard() {
    if (!currentUser || !isMentorApproved(currentUser)) {
        showMentorVerificationScreen();
        return;
    }
    navigateTo('mentor-dashboard');
    updateMentorDashboard();
}

function updateMentorDashboard() {
    if (!currentUser) return;

    // Update name
    document.getElementById('dash-firstname-mentor').textContent = currentUser.firstName;
    document.getElementById('nav-name-mentor').textContent = currentUser.firstName + ' ' + currentUser.lastName;

    // Update avatar
    const navAvatar = document.getElementById('nav-avatar-mentor');
    if (currentUser.photo) {
        navAvatar.innerHTML = `<img src="${currentUser.photo}" alt="Avatar">`;
    }

    const mentorSessions = getSessions().filter(session =>
        session.mentorId === currentUser.id && !['cancelled', 'rejected'].includes(session.status)
    );
    const studentCount = new Set(mentorSessions.map(session => session.studentId)).size;
    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthlySessions = mentorSessions.filter(session => {
        if (!['confirmed', 'completed'].includes(session.status)) return false;
        // Count by the booked date OR by when it was actually completed,
        // so a session completed moments ago counts this month too.
        return String(session.date || '').slice(0, 7) === currentMonth ||
            (session.status === 'completed' && String(session.completedAt || '').slice(0, 7) === currentMonth);
    }).length;
    const mentorReviews = getReviews().filter(review => review.mentorId === currentUser.id);
    const averageRating = mentorReviews.length
        ? mentorReviews.reduce((total, review) => total + Number(review.rating || 0), 0) / mentorReviews.length
        : 0;
    document.getElementById('stat-students').textContent = studentCount;
    document.getElementById('stat-sessions-mentor').textContent = monthlySessions;
    document.getElementById('stat-rating').textContent = averageRating.toFixed(1);

    // Update skills list
    const skillsList = document.getElementById('mentor-skills-list');
    if (currentUser.skills && currentUser.skills.length > 0) {
        skillsList.innerHTML = currentUser.skills.map(skill =>
            `<span class="skill-tag">${skill}<span class="remove-tag" onclick="removeSkill('${skill}')">&times;</span></span>`
        ).join('');
    } else {
        skillsList.innerHTML = '<span class="empty-state">No skills added yet</span>';
    }

    // Update interests list
    const interestsList = document.getElementById('mentor-interests-list');
    if (currentUser.interests && currentUser.interests.length > 0) {
        interestsList.innerHTML = currentUser.interests.map(interest =>
            `<span class="skill-tag">${interest}<span class="remove-tag" onclick="removeInterest('${interest}')">&times;</span></span>`
        ).join('');
    } else {
        interestsList.innerHTML = '<span class="empty-state">No interests added yet</span>';
    }

    // Recent student requests (connection requests + session bookings)
    renderMentorStudentRequests();
}

function showMentorSection(section) {
    if (section !== 'students' || !currentUser || currentUser.role !== 'mentor') return;
    document.querySelectorAll('#mentor-dashboard .dashboard-section').forEach(function (panel) {
        panel.classList.toggle('active', panel.id === 'mentor-students');
    });
    document.querySelectorAll('#mentor-dashboard .nav-link, #mentor-dashboard .nav-dropdown-item').forEach(function (link) {
        link.classList.toggle('active', link.textContent.trim() === 'My Students');
    });
    renderMentorStudents();
}

function renderMentorStudents() {
    var container = document.getElementById('mentor-students-list');
    if (!container || !currentUser) return;
    var sessions = getSessions().filter(function (session) {
        return session.mentorId === currentUser.id && ['pending', 'confirmed', 'completed'].indexOf(session.status) !== -1;
    });
    var studentIds = [];
    sessions.forEach(function (session) {
        if (studentIds.indexOf(session.studentId) === -1) studentIds.push(session.studentId);
    });
    var students = studentIds.map(function (id) { return userById(id); }).filter(Boolean);
    if (!students.length) {
        container.innerHTML = '<p class="empty-state">No students yet. Accepted student bookings will appear here.</p>';
        return;
    }
    container.innerHTML = students.map(function (student) {
        var studentSessions = sessions.filter(function (session) { return session.studentId === student.id; });
        var latest = studentSessions[studentSessions.length - 1];
        var avatar = student.photo ? '<img src="' + student.photo + '" alt="' + student.firstName + '">' :
            '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
        return '<div class="student-list-item">' +
            '<div class="student-list-avatar">' + avatar + '</div>' +
            '<div class="student-list-info"><h3>' + student.firstName + ' ' + student.lastName + '</h3>' +
            '<p>' + (student.university || student.major || student.email || 'Mentorship student') + '</p></div>' +
            '<div class="student-list-meta"><strong>' + studentSessions.length + ' session' + (studentSessions.length === 1 ? '' : 's') + '</strong>' +
            '<span class="status-pill ' + latest.status + '">' + latest.status + '</span></div>' +
            '</div>';
    }).join('');
}

// Mentor dashboard: pending student requests (connection requests + session bookings)
function renderMentorStudentRequests() {
    var container = document.getElementById('student-requests');
    var badge = document.getElementById('student-requests-count');
    if (!container || !currentUser || currentUser.role !== 'mentor') return;

    var users = getUsers();
    var pendingBookings = getSessions().filter(function (session) {
        return session.mentorId === currentUser.id && session.status === 'pending';
    });
    var pendingConnections = getConnections().filter(function (conn) {
        return conn.to === currentUser.id && conn.status === 'pending';
    });

    if (badge) {
        var total = pendingBookings.length + pendingConnections.length;
        badge.textContent = total;
        badge.style.display = total > 0 ? 'inline-block' : 'none';
    }

    if (!pendingBookings.length && !pendingConnections.length) {
        container.innerHTML = '<p class="empty-state">No student requests yet. New session bookings and connection requests will appear here.</p>';
        return;
    }

    var html = '';

    pendingBookings.forEach(function (session) {
        var student = users.find(function (u) { return u.id === session.studentId; });
        if (!student) return;
        var avatar = student.photo ? '<img src="' + student.photo + '" alt="' + student.firstName + '">' :
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
        var when = (typeof formatSessionWhen === 'function') ? formatSessionWhen(session) : ((session.date || '') + ' ' + (session.time || ''));
        html += '<div class="request-item">' +
            '<div class="request-avatar">' + avatar + '</div>' +
            '<div class="request-info"><h4>' + student.firstName + ' ' + student.lastName + '</h4>' +
            '<p>📅 Session request · ' + (session.topic || 'Mentorship session') + ' · ' + when + '</p></div>' +
            '<div class="request-actions">' +
            '<button class="btn btn-primary btn-sm" onclick="acceptBooking(\'' + session.id + '\')">Accept</button>' +
            '<button class="btn btn-outline btn-sm" onclick="rejectBooking(\'' + session.id + '\')">Reject</button>' +
            '</div></div>';
    });

    pendingConnections.forEach(function (req) {
        var student = users.find(function (u) { return u.id === req.from; });
        if (!student) return;
        var avatar = student.photo ? '<img src="' + student.photo + '" alt="' + student.firstName + '">' :
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
        html += '<div class="request-item">' +
            '<div class="request-avatar">' + avatar + '</div>' +
            '<div class="request-info"><h4>' + student.firstName + ' ' + student.lastName + '</h4>' +
            '<p>🤝 Connection request · ' + (student.major || student.university || 'Student') + '</p></div>' +
            '<div class="request-actions">' +
            '<button class="btn btn-primary btn-sm" onclick="acceptRequest(\'' + req.id + '\')">Accept</button>' +
            '<button class="btn btn-outline btn-sm" onclick="rejectRequest(\'' + req.id + '\')">Decline</button>' +
            '</div></div>';
    });

    container.innerHTML = html;
}

// ========================================
// SKILLS & INTERESTS MANAGEMENT
// ========================================

function openSkillsModal() {
    const modal = document.getElementById('skills-modal');
    const list = document.getElementById('modal-skills-list');
    const skills = currentUser.skills || [];

    if (skills.length > 0) {
        list.innerHTML = skills.map(skill =>
            `<span class="skill-tag">${skill}<span class="remove-tag" onclick="removeSkill('${skill}')">&times;</span></span>`
        ).join('');
    } else {
        list.innerHTML = '<span class="empty-state">No skills added yet</span>';
    }

    document.getElementById('new-skill-input').value = '';
    modal.classList.add('active');
}

function openInterestsModal() {
    const modal = document.getElementById('interests-modal');
    const list = document.getElementById('modal-interests-list');
    const interests = currentUser.interests || [];

    if (interests.length > 0) {
        list.innerHTML = interests.map(interest =>
            `<span class="skill-tag">${interest}<span class="remove-tag" onclick="removeInterest('${interest}')">&times;</span></span>`
        ).join('');
    } else {
        list.innerHTML = '<span class="empty-state">No interests added yet</span>';
    }

    document.getElementById('new-interest-input').value = '';
    modal.classList.add('active');
}

function addSkill() {
    const input = document.getElementById('new-skill-input');
    const skill = input.value.trim();

    if (!skill) return;

    const users = getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser.id);

    if (userIndex === -1) return;

    if (!users[userIndex].skills) {
        users[userIndex].skills = [];
    }

    if (users[userIndex].skills.includes(skill)) {
        showToast('Skill already added', 'error');
        return;
    }

    users[userIndex].skills.push(skill);
    saveUsers(users);
    currentUser = users[userIndex];
    saveCurrentUser(currentUser);

    input.value = '';
    openSkillsModal(); // Refresh modal
    updateDashboard();
    showToast('Skill added!', 'success');
}

function removeSkill(skill) {
    const users = getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser.id);

    if (userIndex === -1) return;

    users[userIndex].skills = users[userIndex].skills.filter(s => s !== skill);
    saveUsers(users);
    currentUser = users[userIndex];
    saveCurrentUser(currentUser);

    openSkillsModal(); // Refresh modal
    updateDashboard();
    showToast('Skill removed', 'info');
}

function addInterest() {
    const input = document.getElementById('new-interest-input');
    const interest = input.value.trim();

    if (!interest) return;

    const users = getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser.id);

    if (userIndex === -1) return;

    if (!users[userIndex].interests) {
        users[userIndex].interests = [];
    }

    if (users[userIndex].interests.includes(interest)) {
        showToast('Interest already added', 'error');
        return;
    }

    users[userIndex].interests.push(interest);
    saveUsers(users);
    currentUser = users[userIndex];
    saveCurrentUser(currentUser);

    input.value = '';
    openInterestsModal(); // Refresh modal
    updateDashboard();
    showToast('Interest added!', 'success');
}

function removeInterest(interest) {
    const users = getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser.id);

    if (userIndex === -1) return;

    users[userIndex].interests = users[userIndex].interests.filter(i => i !== interest);
    saveUsers(users);
    currentUser = users[userIndex];
    saveCurrentUser(currentUser);

    openInterestsModal(); // Refresh modal
    updateDashboard();
    showToast('Interest removed', 'info');
}

function updateDashboard() {
    if (currentUser.role === 'student') {
        updateStudentDashboard();
    } else {
        updateMentorDashboard();
    }
}

// ========================================
// PROFILE SCREEN
// ========================================

function loadProfileScreen() {
    if (!currentUser) return;

    // Update profile info
    document.getElementById('profile-name').textContent = currentUser.firstName + ' ' + currentUser.lastName;
    document.getElementById('profile-role').textContent = currentUser.role === 'student' ? 'Student' : 'Mentor';
    document.getElementById('profile-bio').textContent = currentUser.bio || 'No bio added yet';

    // Update avatar
    const avatar = document.getElementById('profile-avatar');
    if (currentUser.photo) {
        avatar.innerHTML = `<img src="${currentUser.photo}" alt="Profile">`;
    } else {
        avatar.innerHTML = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
        </svg>`;
    }

    // Show/hide role-specific fields
    if (currentUser.role === 'student') {
        document.getElementById('detail-university-row').style.display = 'flex';
        document.getElementById('detail-major-row').style.display = 'flex';
        document.getElementById('detail-year-row').style.display = 'flex';
        document.getElementById('detail-company-row').style.display = 'none';
        document.getElementById('detail-position-row').style.display = 'none';
        document.getElementById('detail-experience-row').style.display = 'none';

        document.getElementById('detail-university').textContent = currentUser.university || '-';
        document.getElementById('detail-major').textContent = currentUser.major || '-';
        document.getElementById('detail-year').textContent = currentUser.year || '-';
    } else {
        document.getElementById('detail-university-row').style.display = 'none';
        document.getElementById('detail-major-row').style.display = 'none';
        document.getElementById('detail-year-row').style.display = 'none';
        document.getElementById('detail-company-row').style.display = 'flex';
        document.getElementById('detail-position-row').style.display = 'flex';
        document.getElementById('detail-experience-row').style.display = 'flex';

        document.getElementById('detail-company').textContent = currentUser.company || '-';
        document.getElementById('detail-position').textContent = currentUser.position || '-';
        document.getElementById('detail-experience').textContent = currentUser.experience || '-';
    }

    // Update skills
    const skillsContainer = document.getElementById('profile-skills');
    if (currentUser.skills && currentUser.skills.length > 0) {
        skillsContainer.innerHTML = currentUser.skills.map(skill =>
            `<span class="skill-tag">${skill}</span>`
        ).join('');
    } else {
        skillsContainer.innerHTML = '<span class="empty-state">No skills added</span>';
    }

    // Update interests
    const interestsContainer = document.getElementById('profile-interests');
    if (currentUser.interests && currentUser.interests.length > 0) {
        interestsContainer.innerHTML = currentUser.interests.map(interest =>
            `<span class="skill-tag">${interest}</span>`
        ).join('');
    } else {
        interestsContainer.innerHTML = '<span class="empty-state">No interests added</span>';
    }

    // Update contact info
    document.getElementById('detail-email').textContent = currentUser.email;

    const linkedinEl = document.getElementById('detail-linkedin');
    if (currentUser.linkedin) {
        linkedinEl.textContent = 'View Profile';
        linkedinEl.href = currentUser.linkedin;
    } else {
        linkedinEl.textContent = '-';
        linkedinEl.href = '#';
    }

    const githubEl = document.getElementById('detail-github');
    if (currentUser.github) {
        githubEl.textContent = 'View Profile';
        githubEl.href = currentUser.github;
    } else {
        githubEl.textContent = '-';
        githubEl.href = '#';
    }
}

// Override navigateTo for profile screen
const originalNavigateTo = navigateTo;
navigateTo = function(screenId) {
    if (screenId === 'profile-screen') {
        previousScreen = document.querySelector('.screen.active')?.id || 'welcome-screen';
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('profile-screen').classList.add('active');
        window.scrollTo(0, 0);
        loadProfileScreen();
        return;
    }
    if (screenId === 'settings-screen') {
        previousScreen = document.querySelector('.screen.active')?.id || 'welcome-screen';
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('settings-screen').classList.add('active');
        window.scrollTo(0, 0);
        return;
    }
    originalNavigateTo(screenId);
};

// EDIT PROFILE
// EDIT PROFILE PHOTO (used by the Edit Profile card — student & mentor)
var editPhotoDraft;        // undefined = unchanged | dataURL = set | null = remove
var editPhotoRemoveFlag = false;

function handleEditPhotoUpload(event) {
    var file = event.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
        showToast('Image must be less than 2MB', 'error');
        event.target.value = '';
        return;
    }
    var reader = new FileReader();
    reader.onload = function (e) {
        editPhotoDraft = e.target.result;   // pending new photo (saved on Save Changes)
        editPhotoRemoveFlag = false;
        renderEditPhotoPreview();
    };
    reader.readAsDataURL(file);
}

function removeEditPhoto() {
    editPhotoDraft = null;                  // pending removal (saved on Save Changes)
    editPhotoRemoveFlag = true;
    renderEditPhotoPreview();
}

function renderEditPhotoPreview() {
    var preview = document.getElementById('edit-photo-preview');
    if (!preview) return;
    var currentPhoto = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.photo : null;
    var show = editPhotoDraft !== undefined ? editPhotoDraft : currentPhoto;
    if (show) {
        preview.innerHTML = '<img src="' + show + '" alt="Profile photo">';
    } else {
        preview.innerHTML = '<span class="edit-photo-placeholder">' +
            '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
            '</span>';
    }
    var addBtn = document.getElementById('edit-photo-add-btn');
    var removeBtn = document.getElementById('edit-photo-remove-btn');
    if (addBtn) addBtn.textContent = (show && !editPhotoRemoveFlag) ? '📷 Change Photo' : '📷 Add Photo';
    if (removeBtn) removeBtn.style.display = (show || editPhotoRemoveFlag) ? '' : 'none';
    var fileInput = document.getElementById('edit-profile-photo');
    if (fileInput) fileInput.value = '';
}

function toggleEditProfile() {
    if (!currentUser) return;

    // Reset the pending photo draft each time the card opens
    editPhotoDraft = undefined;
    editPhotoRemoveFlag = false;

    // Populate edit form
    document.getElementById('edit-firstname').value = currentUser.firstName;
    document.getElementById('edit-lastname').value = currentUser.lastName;
    document.getElementById('edit-bio').value = currentUser.bio || '';
    document.getElementById('edit-linkedin').value = currentUser.linkedin || '';
    document.getElementById('edit-github').value = currentUser.github || '';
    renderEditPhotoPreview();

    // Show/hide role-specific fields
    if (currentUser.role === 'student') {
        document.getElementById('edit-student-fields').style.display = 'block';
        document.getElementById('edit-mentor-fields').style.display = 'none';
        document.getElementById('edit-university').value = currentUser.university || '';
        document.getElementById('edit-major').value = currentUser.major || '';
        document.getElementById('edit-year').value = currentUser.year || '';
    } else {
        document.getElementById('edit-student-fields').style.display = 'none';
        document.getElementById('edit-mentor-fields').style.display = 'block';
        document.getElementById('edit-company').value = currentUser.company || '';
        document.getElementById('edit-position').value = currentUser.position || '';
        document.getElementById('edit-experience').value = currentUser.experience || '';
    }

    document.getElementById('edit-profile-modal').classList.add('active');
}

function handleEditProfile(event) {
    event.preventDefault();

    const users = getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser.id);

    if (userIndex === -1) return;

    users[userIndex].firstName = document.getElementById('edit-firstname').value.trim();
    users[userIndex].lastName = document.getElementById('edit-lastname').value.trim();
    users[userIndex].bio = document.getElementById('edit-bio').value.trim();
    users[userIndex].linkedin = document.getElementById('edit-linkedin').value.trim();
    users[userIndex].github = document.getElementById('edit-github').value.trim();

    // Persist the pending photo action (add/change/remove)
    if (editPhotoDraft === null) {
        users[userIndex].photo = null;      // photo removed
    } else if (typeof editPhotoDraft === 'string' && editPhotoDraft) {
        users[userIndex].photo = editPhotoDraft; // new photo added/changed
    }
    editPhotoDraft = undefined;
    editPhotoRemoveFlag = false;

    if (currentUser.role === 'student') {
        users[userIndex].university = document.getElementById('edit-university').value.trim();
        users[userIndex].major = document.getElementById('edit-major').value.trim();
        users[userIndex].year = document.getElementById('edit-year').value;
    } else {
        users[userIndex].company = document.getElementById('edit-company').value.trim();
        users[userIndex].position = document.getElementById('edit-position').value.trim();
        users[userIndex].experience = document.getElementById('edit-experience').value;
    }

    saveUsers(users);
    currentUser = users[userIndex];
    saveCurrentUser(currentUser);

    closeModal('edit-profile-modal');
    loadProfileScreen();
    updateDashboard();
    showToast('Profile updated successfully!', 'success');
}

// CHANGE PASSWORD
function openChangePasswordModal() {
    document.getElementById('current-password').value = '';
    document.getElementById('new-password').value = '';
    document.getElementById('confirm-new-password').value = '';
    document.getElementById('change-password-modal').classList.add('active');
}

function handleChangePassword(event) {
    event.preventDefault();

    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-new-password').value;

    const users = getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser.id);
    if (userIndex === -1 || !verifyPassword(currentPassword, users[userIndex].password)) {
        showToast('Current password is incorrect', 'error');
        return;
    }

    if (newPassword !== confirmPassword) {
        showToast('New passwords do not match', 'error');
        return;
    }

    const strength = checkPasswordStrength(newPassword);
    if (strength.strength < 4) {
        showToast('Choose a stronger password: ' + strength.feedback.join(', ') + '.', 'error');
        return;
    }

    users[userIndex].password = hashPassword(newPassword);
    saveUsers(users);
    currentUser = sanitizeUser(users[userIndex]);
    saveCurrentUser(currentUser);

    closeModal('change-password-modal');
    showToast('Password changed successfully!', 'success');
}

// ========================================
// MODAL MANAGEMENT
// ========================================

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Close modal on overlay click
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('active');
    }
});

// Close modal on Escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(modal => {
            modal.classList.remove('active');
        });
    }
});

// ========================================
// UTILITY FUNCTIONS
// ========================================

function generateId() {
    return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// ========================================
// PHASE 3 - SMART MATCHING & NETWORKING
// ========================================

let currentMatchMentor = null;

// Connection storage helpers
function getConnections() {
    var data = localStorage.getItem('mentorconnect_connections');
    return data ? JSON.parse(data) : [];
}

function saveConnections(connections) {
    localStorage.setItem('mentorconnect_connections', JSON.stringify(connections));
}

function getConnectionStatus(userId1, userId2) {
    var connections = getConnections();
    for (var i = 0; i < connections.length; i++) {
        var c = connections[i];
        if ((c.from === userId1 && c.to === userId2) || (c.from === userId2 && c.to === userId1)) {
            return c;
        }
    }
    return null;
}

function getMyConnections() {
    if (!currentUser) return [];
    var connections = getConnections();
    return connections.filter(function(c) {
        return (c.from === currentUser.id || c.to === currentUser.id) && c.status === 'connected';
    });
}

function getPendingRequests() {
    if (!currentUser) return [];
    var connections = getConnections();
    if (currentUser.role === 'mentor') {
        return connections.filter(function(c) { return c.to === currentUser.id && c.status === 'pending'; });
    }
    return connections.filter(function(c) { return c.from === currentUser.id && c.status === 'pending'; });
}

// Smart matching algorithm
function calculateMatchScore(student, mentor) {
    var skillsScore = 0, interestsScore = 0, experienceScore = 0, domainScore = 0;
    var reasons = [];

    // Skills overlap (40% weight)
    var studentSkills = (student.skills || []).map(function(s) { return s.toLowerCase(); });
    var mentorSkills = (mentor.skills || []).map(function(s) { return s.toLowerCase(); });
    var skillsOverlap = studentSkills.filter(function(s) { return mentorSkills.indexOf(s) > -1; });
    if (studentSkills.length > 0) {
        skillsScore = Math.round((skillsOverlap.length / studentSkills.length) * 100);
    }
    if (skillsOverlap.length > 0) {
        reasons.push({ icon: '🎯', text: 'Matches <strong>' + skillsOverlap.length + '</strong> of your skills: ' + skillsOverlap.slice(0, 3).join(', ') });
    }

    // Shared interests (25% weight)
    var studentInterests = (student.interests || []).map(function(i) { return i.toLowerCase(); });
    var mentorInterests = (mentor.interests || []).map(function(i) { return i.toLowerCase(); });
    var interestsOverlap = studentInterests.filter(function(i) { return mentorInterests.indexOf(i) > -1; });
    if (studentInterests.length > 0) {
        interestsScore = Math.round((interestsOverlap.length / studentInterests.length) * 100);
    }
    if (interestsOverlap.length > 0) {
        reasons.push({ icon: '💡', text: 'Shares <strong>' + interestsOverlap.length + '</strong> interests with you: ' + interestsOverlap.slice(0, 3).join(', ') });
    }

    // Experience level (20% weight)
    var expMap = { '1-3 years': 25, '3-5 years': 50, '5-10 years': 75, '10+ years': 100 };
    experienceScore = expMap[mentor.experience] || 50;
    if (mentor.experience) {
        reasons.push({ icon: '⭐', text: 'Has <strong>' + mentor.experience + '</strong> of experience as a mentor' });
    }

    // Domain fit (15% weight)
    var mentorDomains = mentorSkills.concat(mentorInterests);
    var studentDomains = studentSkills.concat(studentInterests);
    var domainOverlap = studentDomains.filter(function(d) { return mentorDomains.indexOf(d) > -1; });
    if (studentDomains.length > 0) {
        domainScore = Math.round((domainOverlap.length / studentDomains.length) * 100);
    }
    if (mentor.company) {
        reasons.push({ icon: '📚', text: 'Works at <strong>' + mentor.company + '</strong> as ' + (mentor.position || 'a professional') });
    }

    var totalScore = Math.round(skillsScore * 0.4 + interestsScore * 0.25 + experienceScore * 0.2 + domainScore * 0.15);

    return {
        total: totalScore,
        skills: skillsScore,
        interests: interestsScore,
        experience: experienceScore,
        domain: domainScore,
        reasons: reasons
    };
}

// Recommended mentors screen
function initRecommendedMentors() {
    if (!currentUser) return;
    var users = getUsers();
    var mentors = users.filter(function(u) { return u.role === 'mentor' && u.id !== currentUser.id; });

    // Calculate match scores
    var scoredMentors = mentors.map(function(mentor) {
        var match = calculateMatchScore(currentUser, mentor);
        return { mentor: mentor, score: match.total, breakdown: match };
    });

    // Sort by score
    scoredMentors.sort(function(a, b) { return b.score - a.score; });

    // Update nav
    var nameEl = document.getElementById('rm-nav-name');
    var avatarEl = document.getElementById('rm-nav-avatar');
    if (nameEl) nameEl.textContent = currentUser.firstName + ' ' + currentUser.lastName;
    if (avatarEl && currentUser.photo) avatarEl.innerHTML = '<img src="' + currentUser.photo + '" alt="Avatar">';

    // Render
    var container = document.getElementById('recommended-mentors-list');
    if (!container) return;

    if (scoredMentors.length === 0) {
        container.innerHTML = '<p class="empty-state">No mentors available yet</p>';
        return;
    }

    container.innerHTML = scoredMentors.map(function(item) {
        var badgeClass = item.score >= 70 ? 'match-badge-high' : item.score >= 40 ? 'match-badge-medium' : 'match-badge-low';
        var badgeText = item.score >= 70 ? '🔥 Great Match' : item.score >= 40 ? '👍 Good Match' : '💡 Explore';
        var avatar = item.mentor.photo ? '<img src="' + item.mentor.photo + '" alt="' + item.mentor.firstName + '">' :
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
        var skills = (item.mentor.skills || []).slice(0, 3).map(function(s) { return '<span>' + s + '</span>'; }).join('');
        return '<div class="mentor-card" onclick="viewMatchDetails(\'' + item.mentor.id + '\')">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">' +
            '<span class="match-badge ' + badgeClass + '">' + badgeText + ' ' + item.score + '%</span></div>' +
            '<div class="mentor-card-header"><div class="mentor-card-avatar">' + avatar + '</div>' +
            '<div class="mentor-card-info"><h4>' + item.mentor.firstName + ' ' + item.mentor.lastName + '</h4>' +
            '<p>' + (item.mentor.position || 'Mentor') + (item.mentor.company ? ' at ' + item.mentor.company : '') + '</p></div></div>' +
            '<div class="mentor-card-skills">' + skills + '</div></div>';
    }).join('');
}

// Match details screen
function viewMatchDetails(mentorId) {
    var users = getUsers();
    var mentor = users.find(function(u) { return u.id === mentorId; });
    if (!mentor) return;
    currentMatchMentor = mentor;

    var match = calculateMatchScore(currentUser, mentor);

    // Update UI
    document.getElementById('match-mentor-name').textContent = mentor.firstName + ' ' + mentor.lastName;
    document.getElementById('match-mentor-title').textContent = (mentor.position || 'Mentor') + (mentor.company ? ' at ' + mentor.company : '');
    document.getElementById('match-bio').textContent = mentor.bio || 'No bio available';

    // Animate score
    document.getElementById('match-score-value').textContent = match.total + '%';
    var circumference = 2 * Math.PI * 54;
    var offset = circumference - (match.total / 100) * circumference;
    document.getElementById('match-score-progress').style.strokeDashoffset = offset;

    // Update bars
    document.getElementById('match-skills-score').textContent = match.skills + '%';
    document.getElementById('match-skills-bar').style.width = match.skills + '%';
    document.getElementById('match-interests-score').textContent = match.interests + '%';
    document.getElementById('match-interests-bar').style.width = match.interests + '%';
    document.getElementById('match-experience-score').textContent = match.experience + '%';
    document.getElementById('match-experience-bar').style.width = match.experience + '%';
    document.getElementById('match-domain-score').textContent = match.domain + '%';
    document.getElementById('match-domain-bar').style.width = match.domain + '%';

    // Reasons
    var reasonsContainer = document.getElementById('match-reasons-list');
    if (match.reasons.length > 0) {
        reasonsContainer.innerHTML = match.reasons.map(function(r) {
            return '<div class="match-reason"><span class="match-reason-icon">' + r.icon + '</span><span class="match-reason-text">' + r.text + '</span></div>';
        }).join('');
    } else {
        reasonsContainer.innerHTML = '<div class="match-reason"><span class="match-reason-icon">💡</span><span class="match-reason-text">Explore this mentor to learn more about their expertise</span></div>';
    }

    // Skills
    var skillsContainer = document.getElementById('match-skills');
    if (mentor.skills && mentor.skills.length > 0) {
        skillsContainer.innerHTML = mentor.skills.map(function(s) { return '<span class="skill-tag">' + s + '</span>'; }).join('');
    }

    // Check connection status
    updateRequestButton(mentorId);

    navigateTo('match-details-screen');
}

function updateRequestButton(mentorId) {
    var btn = document.getElementById('send-request-btn');
    if (!btn) return;
    var conn = getConnectionStatus(currentUser.id, mentorId);
    if (conn && conn.status === 'connected') {
        btn.innerHTML = '✓ Connected';
        btn.disabled = true;
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-outline');
    } else if (conn && conn.status === 'pending') {
        btn.innerHTML = '⏳ Request Pending';
        btn.disabled = true;
    } else {
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg> Send Connection Request';
        btn.disabled = false;
        btn.classList.remove('btn-outline');
        btn.classList.add('btn-primary');
    }
}

// Connection requests
function ucConnectionStatusWith(userId) {
    if (!currentUser) return null;
    var conn = getConnectionStatus(currentUser.id, userId);
    return conn ? conn.status : null;
}

// Connect-first booking: the mentor detail button reflects the request state —
// Send Connect Request -> Request Pending -> Book Session (after mentor accepts).
function updateMentorDetailBookButton() {
    var btn = document.getElementById('mentor-detail-book-btn');
    if (!btn || !currentViewingMentor) return;
    if (!currentUser || currentUser.role !== 'student') { btn.style.display = 'none'; return; }
    btn.style.display = '';
    var status = ucConnectionStatusWith(currentViewingMentor.id);
    if (status === 'connected') {
        btn.className = 'btn btn-primary';
        btn.disabled = false;
        btn.textContent = 'Book Session';
        btn.setAttribute('onclick', 'startBooking()');
        btn.title = 'Pick a date and time';
    } else if (status === 'pending') {
        btn.className = 'btn btn-outline';
        btn.disabled = true;
        btn.textContent = 'Pending';
        btn.setAttribute('onclick', '');
        btn.title = 'Connect request sent — waiting for the mentor to accept';
    } else if (status === 'rejected') {
        btn.className = 'btn btn-outline';
        btn.disabled = true;
        btn.textContent = 'Declined';
        btn.setAttribute('onclick', '');
        btn.title = 'The mentor declined your connect request';
    } else {
        btn.className = 'btn btn-primary';
        btn.disabled = false;
        btn.textContent = 'Connect';
        btn.setAttribute('onclick', 'requestConnectionWithCurrentMentor()');
        btn.title = 'Send connect request — the mentor must accept before you can book';
    }
}

function requestConnectionWithCurrentMentor() {
    if (!currentUser || currentUser.role !== 'student' || !currentViewingMentor) return;
    var status = ucConnectionStatusWith(currentViewingMentor.id);
    if (status === 'pending') { showToast('Connect request already sent. Waiting for the mentor to accept.', 'info'); return; }
    if (status === 'connected') { showToast('You are already connected with this mentor.', 'info'); return; }
    if (status === 'rejected') { showToast('The mentor declined your request. Try connecting with another mentor.', 'error'); return; }
    currentMatchMentor = currentViewingMentor;
    sendConnectionRequest();
}

function sendConnectionRequest() {
    if (!currentMatchMentor) return;
    var connections = getConnections();
    var conn = getConnectionStatus(currentUser.id, currentMatchMentor.id);
    if (conn) {
        showToast('Request already exists', 'error');
        return;
    }
    connections.push({
        id: generateId(),
        from: currentUser.id,
        to: currentMatchMentor.id,
        status: 'pending',
        createdAt: new Date().toISOString()
    });
    saveConnections(connections);
    addActivity('request_sent', 'You sent a connection request to ' + currentMatchMentor.firstName + ' ' + currentMatchMentor.lastName);
    showToast('Connection request sent!', 'success');
    if (typeof ucPushNotification === 'function') {
        ucPushNotification([currentMatchMentor.id], 'connection', 'New connection request',
            currentUser.firstName + ' ' + currentUser.lastName + ' sent you a connect request.');
    }
    if (typeof updateMentorDetailBookButton === 'function') updateMentorDetailBookButton();
    updateRequestButton(currentMatchMentor.id);
}

function acceptRequest(requestId) {
    var connections = getConnections();
    var idx = connections.findIndex(function(c) { return c.id === requestId; });
    if (idx === -1) return;
    connections[idx].status = 'connected';
    saveConnections(connections);
    var fromUser = getUsers().find(function(u) { return u.id === connections[idx].from; });
    addActivity('connection_accepted', 'You connected with ' + (fromUser ? fromUser.firstName : 'a student'));
    showToast('Connection accepted!', 'success');
    if (typeof ucPushNotification === 'function') {
        ucPushNotification([connections[idx].from], 'connection', 'Connection accepted',
            (currentUser ? currentUser.firstName + ' ' + currentUser.lastName : 'The mentor') + ' accepted your connect request. You can now book a session.');
    }
    renderIncomingRequests();
    if (typeof renderMentorStudentRequests === 'function') renderMentorStudentRequests();
}

function rejectRequest(requestId) {
    var connections = getConnections();
    var idx = connections.findIndex(function(c) { return c.id === requestId; });
    if (idx === -1) return;
    connections[idx].status = 'rejected';
    saveConnections(connections);
    showToast('Request rejected', 'info');
    renderIncomingRequests();
    if (typeof renderMentorStudentRequests === 'function') renderMentorStudentRequests();
}

function cancelRequest(requestId) {
    var connections = getConnections();
    connections = connections.filter(function(c) { return c.id !== requestId; });
    saveConnections(connections);
    showToast('Request cancelled', 'info');
    renderIncomingRequests();
}

// Incoming requests screen
function renderIncomingRequests() {
    if (!currentUser) return;
    var connections = getConnections();
    var users = getUsers();

    var incoming;
    if (currentUser.role === 'mentor') {
        incoming = connections.filter(function(c) { return c.to === currentUser.id && c.status === 'pending'; });
    } else {
        incoming = connections.filter(function(c) { return c.from === currentUser.id && c.status === 'pending'; });
    }

    // Update nav
    var nameEl = document.getElementById('ir-nav-name');
    var avatarEl = document.getElementById('ir-nav-avatar');
    if (nameEl) nameEl.textContent = currentUser.firstName + ' ' + currentUser.lastName;
    if (avatarEl && currentUser.photo) avatarEl.innerHTML = '<img src="' + currentUser.photo + '" alt="Avatar">';

    var container = document.getElementById('incoming-requests-list');
    if (!container) return;

    if (incoming.length === 0) {
        container.innerHTML = '<p class="empty-state">No incoming requests</p>';
        return;
    }

    container.innerHTML = incoming.map(function(req) {
        var otherUserId = currentUser.role === 'mentor' ? req.from : req.to;
        var otherUser = users.find(function(u) { return u.id === otherUserId; });
        if (!otherUser) return '';
        var avatar = otherUser.photo ? '<img src="' + otherUser.photo + '" alt="' + otherUser.firstName + '">' :
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
        var actions = currentUser.role === 'mentor' ?
            '<button class="btn btn-primary btn-sm" onclick="acceptRequest(\'' + req.id + '\')">Accept</button>' +
            '<button class="btn btn-outline btn-sm" onclick="rejectRequest(\'' + req.id + '\')">Decline</button>' :
            '<button class="btn btn-outline btn-sm" onclick="cancelRequest(\'' + req.id + '\')">Cancel</button>';
        return '<div class="request-item"><div class="request-avatar">' + avatar + '</div>' +
            '<div class="request-info"><h4>' + otherUser.firstName + ' ' + otherUser.lastName + '</h4>' +
            '<p>' + (otherUser.role === 'mentor' ? (otherUser.position || 'Mentor') : (otherUser.major || 'Student')) + '</p></div>' +
            '<div class="request-actions">' + actions + '</div></div>';
    }).join('');
}

// My connections screen
function renderMyConnections() {
    if (!currentUser) return;
    var connections = getMyConnections();
    var users = getUsers();

    // Update nav
    var nameEl = document.getElementById('mc-nav-name');
    var avatarEl = document.getElementById('mc-nav-avatar');
    if (nameEl) nameEl.textContent = currentUser.firstName + ' ' + currentUser.lastName;
    if (avatarEl && currentUser.photo) avatarEl.innerHTML = '<img src="' + currentUser.photo + '" alt="Avatar">';

    // Update counts
    document.getElementById('connections-count').textContent = connections.length;
    document.getElementById('pending-count').textContent = getPendingRequests().length;

    var container = document.getElementById('connections-list');
    if (!container) return;

    if (connections.length === 0) {
        container.innerHTML = '<p class="empty-state">No connections yet. Start by sending requests!</p>';
        return;
    }

    var connectedUsers = connections.map(function(c) {
        var otherId = c.from === currentUser.id ? c.to : c.from;
        return users.find(function(u) { return u.id === otherId; });
    }).filter(function(u) { return u; });

    container.innerHTML = connectedUsers.map(function(user) {
        var avatar = user.photo ? '<img src="' + user.photo + '" alt="' + user.firstName + '">' :
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
        var skills = (user.skills || []).slice(0, 3).map(function(s) { return '<span>' + s + '</span>'; }).join('');
        return '<div class="mentor-card" onclick="viewMentorDetail(\'' + user.id + '\')">' +
            '<div class="mentor-card-header"><div class="mentor-card-avatar">' + avatar + '</div>' +
            '<div class="mentor-card-info"><h4>' + user.firstName + ' ' + user.lastName + '</h4>' +
            '<p>' + (user.position || user.role) + (user.company ? ' at ' + user.company : '') + '</p></div></div>' +
            '<div class="mentor-card-skills">' + skills + '</div>' +
            '<div style="margin-top:8px;"><span class="connection-status status-connected">✓ Connected</span></div></div>';
    }).join('');
}

// Activity tracking
function getActivities() {
    var data = localStorage.getItem('mentorconnect_activities_' + currentUser.id);
    return data ? JSON.parse(data) : [];
}

function addActivity(type, message) {
    if (!currentUser) return;
    var activities = getActivities();
    activities.unshift({ type: type, message: message, time: new Date().toISOString() });
    activities = activities.slice(0, 50);
    localStorage.setItem('mentorconnect_activities_' + currentUser.id, JSON.stringify(activities));
}

function renderActivity() {
    var container = document.getElementById('activity-list');
    if (!container) return;
    var activities = getActivities();
    if (activities.length === 0) {
        container.innerHTML = '<p class="empty-state">No activity yet</p>';
        return;
    }
    var icons = { request_sent: '📤', connection_accepted: '🤝', request_rejected: '❌' };
    container.innerHTML = activities.map(function(a) {
        var time = new Date(a.time).toLocaleDateString();
        return '<div class="activity-item"><div class="activity-icon">' + (icons[a.type] || '📋') + '</div>' +
            '<div class="activity-content"><p>' + a.message + '</p><span>' + time + '</span></div></div>';
    }).join('');
}

// Override navigateTo for Phase 3 screens
var originalNavigateToPhase3 = navigateTo;
navigateTo = function(screenId) {
    if (screenId === 'recommended-mentors-screen') {
        previousScreen = document.querySelector('.screen.active') ? document.querySelector('.screen.active').id : 'welcome-screen';
        document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
        document.getElementById('recommended-mentors-screen').classList.add('active');
        window.scrollTo(0, 0);
        initRecommendedMentors();
        return;
    }
    if (screenId === 'match-details-screen') {
        previousScreen = document.querySelector('.screen.active') ? document.querySelector('.screen.active').id : 'welcome-screen';
        document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
        document.getElementById('match-details-screen').classList.add('active');
        window.scrollTo(0, 0);
        return;
    }
    if (screenId === 'incoming-requests-screen') {
        previousScreen = document.querySelector('.screen.active') ? document.querySelector('.screen.active').id : 'welcome-screen';
        document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
        document.getElementById('incoming-requests-screen').classList.add('active');
        window.scrollTo(0, 0);
        renderIncomingRequests();
        return;
    }
    if (screenId === 'my-connections-screen') {
        previousScreen = document.querySelector('.screen.active') ? document.querySelector('.screen.active').id : 'welcome-screen';
        document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
        document.getElementById('my-connections-screen').classList.add('active');
        window.scrollTo(0, 0);
        renderMyConnections();
        return;
    }
    if (screenId === 'connection-activity-screen') {
        previousScreen = document.querySelector('.screen.active') ? document.querySelector('.screen.active').id : 'welcome-screen';
        document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
        document.getElementById('connection-activity-screen').classList.add('active');
        window.scrollTo(0, 0);
        renderActivity();
        return;
    }
    originalNavigateToPhase3(screenId);
};

// ========================================
// PHASE 2 - DISCOVER FUNCTIONALITY
// ========================================

let currentSearchType = 'all';
let currentSearchQuery = '';
let currentFilters = { experience: [], rating: 0, domains: [] };
let currentViewingMentor = null;

const POPULAR_DOMAINS = [
    { name: 'Artificial Intelligence', icon: '🤖', color: '#4A90D9' },
    { name: 'Web Development', icon: '🌐', color: '#4A90D9' },
    { name: 'UI/UX Design', icon: '🎨', color: '#F59E0B' },
    { name: 'Data Science', icon: '📊', color: '#2E4172' },
    { name: 'Mobile Development', icon: '📱', color: '#EC4899' },
    { name: 'Cloud Computing', icon: '☁️', color: '#06B6D4' },
    { name: 'Cybersecurity', icon: '🔒', color: '#EF4444' },
    { name: 'Machine Learning', icon: '🧠', color: '#2E4172' },
    { name: 'DevOps', icon: '⚙️', color: '#F97316' },
    { name: 'Blockchain', icon: '⛓️', color: '#2E4172' },
    { name: 'Product Management', icon: '📋', color: '#4A90D9' },
    { name: 'Digital Marketing', icon: '📈', color: '#EC4899' }
];

function initDiscoverScreen() {
    updateDiscoverNav();
    renderPopularDomains();
    renderRecentSearches();
    renderDiscoverRecommended();
}

function updateDiscoverNav() {
    if (!currentUser) return;
    const nameEl = document.getElementById('discover-nav-name');
    const avatarEl = document.getElementById('discover-nav-avatar');
    if (nameEl) nameEl.textContent = currentUser.firstName + ' ' + currentUser.lastName;
    if (avatarEl && currentUser.photo) {
        avatarEl.innerHTML = '<img src="' + currentUser.photo + '" alt="Avatar">';
    }
}

function renderPopularDomains() {
    var grid = document.getElementById('popular-domains-grid');
    if (!grid) return;
    var users = getUsers();
    var mentors = users.filter(function(u) { return u.role === 'mentor'; });
    grid.innerHTML = POPULAR_DOMAINS.slice(0, 6).map(function(domain) {
        var count = mentors.filter(function(m) {
            var skills = (m.skills || []).map(function(s) { return s.toLowerCase(); });
            var interests = (m.interests || []).map(function(i) { return i.toLowerCase(); });
            var d = domain.name.toLowerCase();
            return skills.some(function(s) { return s.includes(d) || d.includes(s); }) ||
                   interests.some(function(i) { return i.includes(d) || d.includes(i); });
        }).length;
        return '<div class="domain-card" onclick="searchByDomain(\'' + domain.name + '\')">' +
            '<div class="domain-card-icon" style="background:' + domain.color + '15;color:' + domain.color + '">' + domain.icon + '</div>' +
            '<h4>' + domain.name + '</h4><p>' + count + ' mentors</p></div>';
    }).join('');
}

function renderAllDomains() {
    var grid = document.getElementById('all-domains-grid');
    if (!grid) return;
    var users = getUsers();
    var mentors = users.filter(function(u) { return u.role === 'mentor'; });
    grid.innerHTML = POPULAR_DOMAINS.map(function(domain) {
        var count = mentors.filter(function(m) {
            var skills = (m.skills || []).map(function(s) { return s.toLowerCase(); });
            var interests = (m.interests || []).map(function(i) { return i.toLowerCase(); });
            var d = domain.name.toLowerCase();
            return skills.some(function(s) { return s.includes(d) || d.includes(s); }) ||
                   interests.some(function(i) { return i.includes(d) || d.includes(i); });
        }).length;
        return '<div class="domain-card" onclick="searchByDomain(\'' + domain.name + '\')">' +
            '<div class="domain-card-icon" style="background:' + domain.color + '15;color:' + domain.color + '">' + domain.icon + '</div>' +
            '<h4>' + domain.name + '</h4><p>' + count + ' mentors</p></div>';
    }).join('');
}

function renderRecentSearches() {
    var list = document.getElementById('recent-searches-list');
    if (!list) return;
    var searches = getRecentSearches();
    if (searches.length > 0) {
        list.innerHTML = searches.map(function(s) {
            return '<span class="recent-search-tag" onclick="searchByKeyword(\'' + s + '\')">' + s + '</span>';
        }).join('');
    } else {
        list.innerHTML = '<span class="empty-state">No recent searches</span>';
    }
}

function renderDiscoverRecommended() {
    var container = document.getElementById('discover-recommended-mentors');
    if (!container) return;
    var users = getUsers();
    var mentors = users.filter(function(u) { return u.role === 'mentor' && u.id !== currentUser.id; });
    if (mentors.length === 0) {
        container.innerHTML = '<p class="empty-state">No mentors available yet</p>';
        return;
    }
    container.innerHTML = mentors.slice(0, 4).map(function(mentor) { return createMentorCard(mentor); }).join('');
}

function setSearchType(type) {
    currentSearchType = type;
    document.querySelectorAll('.search-tab').forEach(function(tab) { tab.classList.remove('active'); });
    event.target.classList.add('active');
}

function performSearch() {
    var query = document.getElementById('discover-search-input').value.trim();
    if (!query) return;
    currentSearchQuery = query;
    addRecentSearch(query);
    navigateTo('search-results-screen');
    renderSearchResults();
}

function searchByDomain(domain) {
    currentSearchQuery = domain;
    addRecentSearch(domain);
    navigateTo('search-results-screen');
    renderSearchResults();
}

function searchByKeyword(keyword) {
    currentSearchQuery = keyword;
    var input = document.getElementById('discover-search-input');
    if (input) input.value = keyword;
    navigateTo('search-results-screen');
    renderSearchResults();
}

function renderSearchResults() {
    var users = getUsers();
    var mentors = users.filter(function(u) { return u.role === 'mentor' && u.id !== currentUser.id; });
    if (currentSearchQuery) {
        var q = currentSearchQuery.toLowerCase();
        mentors = mentors.filter(function(m) {
            var name = (m.firstName + ' ' + m.lastName).toLowerCase();
            var skills = (m.skills || []).join(' ').toLowerCase();
            var interests = (m.interests || []).join(' ').toLowerCase();
            var position = (m.position || '').toLowerCase();
            var company = (m.company || '').toLowerCase();
            var bio = (m.bio || '').toLowerCase();
            return name.includes(q) || skills.includes(q) || interests.includes(q) || position.includes(q) || company.includes(q) || bio.includes(q);
        });
    }
    if (currentFilters.experience.length > 0) {
        mentors = mentors.filter(function(m) { return currentFilters.experience.indexOf(m.experience) > -1; });
    }
    if (currentFilters.rating > 0) {
        mentors = mentors.filter(function(m) { return (m.rating || 0) >= currentFilters.rating; });
    }
    var titleEl = document.getElementById('search-results-title');
    var countEl = document.getElementById('search-results-count');
    if (titleEl) titleEl.textContent = 'Results for "' + currentSearchQuery + '"';
    if (countEl) countEl.textContent = mentors.length + ' mentor' + (mentors.length !== 1 ? 's' : '') + ' found';
    var container = document.getElementById('search-results-mentors');
    if (!container) return;
    if (mentors.length === 0) {
        container.innerHTML = '<p class="empty-state">No mentors found. Try different keywords or filters.</p>';
    } else {
        container.innerHTML = mentors.map(function(mentor) { return createMentorCard(mentor); }).join('');
    }
}

function createMentorCard(mentor) {
    var avatar = mentor.photo ? '<img src="' + mentor.photo + '" alt="' + mentor.firstName + '">' :
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    var skills = (mentor.skills || []).slice(0, 3).map(function(s) { return '<span>' + s + '</span>'; }).join('');
    return '<div class="mentor-card" onclick="viewMentorDetail(\'' + mentor.id + '\')">' +
        '<div class="mentor-card-header"><div class="mentor-card-avatar">' + avatar + '</div>' +
        '<div class="mentor-card-info"><h4>' + mentor.firstName + ' ' + mentor.lastName + '</h4>' +
        '<p>' + (mentor.position || 'Mentor') + (mentor.company ? ' at ' + mentor.company : '') + '</p></div></div>' +
        '<div class="mentor-card-skills">' + skills + '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">' +
        '<span style="font-size:0.8rem;color:#F59E0B;">⭐ ' + (mentor.rating || 0).toFixed(1) + '</span>' +
        '<span style="font-size:0.75rem;color:#9CA3AF;">' + (mentor.sessions || 0) + ' sessions</span></div></div>';
}

function viewMentorDetail(mentorId) {
    var users = getUsers();
    var mentor = users.find(function(u) { return u.id === mentorId; });
    if (!mentor) return;
    currentViewingMentor = mentor;
    document.getElementById('mentor-detail-name').innerHTML = mentor.firstName + ' ' + mentor.lastName + (mentor.verified ? ' <span class="verified-badge">Verified</span>' : '');
    document.getElementById('mentor-detail-title').textContent = (mentor.position || 'Mentor') + (mentor.company ? ' at ' + mentor.company : '');
    if (typeof updateMentorDetailBookButton === 'function') updateMentorDetailBookButton();
    document.getElementById('mentor-detail-rating').textContent = '⭐ ' + (mentor.rating || 0).toFixed(1);
    document.getElementById('mentor-detail-sessions').textContent = (mentor.sessions || 0) + ' sessions';
    document.getElementById('mentor-detail-bio').textContent = mentor.bio || 'No bio available';
    document.getElementById('mentor-detail-company').textContent = mentor.company || '-';
    document.getElementById('mentor-detail-position').textContent = mentor.position || '-';
    document.getElementById('mentor-detail-experience').textContent = mentor.experience || '-';
    var avatar = document.getElementById('mentor-detail-avatar');
    if (mentor.photo) { avatar.innerHTML = '<img src="' + mentor.photo + '" alt="' + mentor.firstName + '">'; }
    var skillsContainer = document.getElementById('mentor-detail-skills');
    if (mentor.skills && mentor.skills.length > 0) {
        skillsContainer.innerHTML = mentor.skills.map(function(s) { return '<span class="skill-tag">' + s + '</span>'; }).join('');
    } else {
        skillsContainer.innerHTML = '<span class="empty-state">No skills listed</span>';
    }
    var linkedinEl = document.getElementById('mentor-detail-linkedin');
    if (mentor.linkedin) { linkedinEl.textContent = 'View Profile'; linkedinEl.href = mentor.linkedin; }
    else { linkedinEl.textContent = '-'; linkedinEl.href = '#'; }
    var githubEl = document.getElementById('mentor-detail-github');
    if (mentor.github) { githubEl.textContent = 'View Profile'; githubEl.href = mentor.github; }
    else { githubEl.textContent = '-'; githubEl.href = '#'; }
    renderMentorReviews();
    updateSaveButton();
    navigateTo('mentor-detail-screen');
}

function renderMentorReviews() {
    var container = document.getElementById('mentor-reviews');
    var toggle = document.getElementById('mentor-reviews-toggle');
    if (!container || !toggle || !currentViewingMentor) return;
    var reviews = getReviews().filter(function (review) { return review.mentorId === currentViewingMentor.id; });
    toggle.textContent = reviews.length ? 'See reviews (' + reviews.length + ')' : 'See reviews';
    container.innerHTML = reviews.length ? reviews.map(function (review) {
        var student = getUsers().find(function (user) { return user.id === review.studentId; });
        return '<div class="mentor-review"><div class="mentor-review-header"><strong>' +
            (student ? student.firstName + ' ' + student.lastName : 'Student') + '</strong><span class="mentor-review-rating">' +
            '★'.repeat(Number(review.rating) || 0) + '</span></div><p>' + (review.text || 'No written feedback.') + '</p></div>';
    }).join('') : '<p class="empty-state">No reviews yet.</p>';
    container.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
}

function toggleMentorReviews() {
    var container = document.getElementById('mentor-reviews');
    var toggle = document.getElementById('mentor-reviews-toggle');
    if (!container || !toggle) return;
    container.hidden = !container.hidden;
    toggle.setAttribute('aria-expanded', String(!container.hidden));
}

function startChatWithCurrentMentor() {
    if (!currentUser) {
        showToast('Sign in to start chatting', 'info');
        navigateTo('login-screen');
        return;
    }
    if (!currentViewingMentor || currentViewingMentor.id === currentUser.id) {
        showToast('This mentor is not available for chat', 'error');
        return;
    }
    openChat(currentViewingMentor.id);
}

function toggleSaveMentor() {
    if (!currentViewingMentor) return;
    var saved = getSavedMentors();
    var idx = saved.indexOf(currentViewingMentor.id);
    if (idx > -1) {
        saved.splice(idx, 1);
        showToast('Mentor removed from saved', 'info');
    } else {
        saved.push(currentViewingMentor.id);
        showToast('Mentor saved!', 'success');
    }
    localStorage.setItem('mentorconnect_saved_' + currentUser.id, JSON.stringify(saved));
    updateSaveButton();
}

function getSavedMentors() {
    var saved = localStorage.getItem('mentorconnect_saved_' + currentUser.id);
    return saved ? JSON.parse(saved) : [];
}

function isMentorSaved(mentorId) {
    return getSavedMentors().indexOf(mentorId) > -1;
}

function updateSaveButton() {
    var btn = document.getElementById('save-mentor-btn');
    if (!btn || !currentViewingMentor) return;
    if (isMentorSaved(currentViewingMentor.id)) {
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg> Saved';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-outline');
    } else {
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg> Save';
        btn.classList.remove('btn-outline');
        btn.classList.add('btn-primary');
    }
}

function renderSavedMentors() {
    var container = document.getElementById('saved-mentors-grid');
    if (!container) return;
    var savedIds = getSavedMentors();
    var users = getUsers();
    var savedMentors = users.filter(function(u) { return savedIds.indexOf(u.id) > -1; });
    if (savedMentors.length === 0) {
        container.innerHTML = '<div class="saved-empty" style="grid-column:1/-1;"><div class="saved-empty-icon">🔖</div><h3>No saved mentors yet</h3><p>Start discovering and save mentors you\'re interested in!</p><button class="btn btn-primary" onclick="navigateTo(\'discover-screen\')">Discover Mentors</button></div>';
    } else {
        container.innerHTML = savedMentors.map(function(mentor) { return createMentorCard(mentor); }).join('');
    }
}

function populateFilterDomains() {
    var container = document.getElementById('filter-domains-list');
    if (!container) return;
    container.innerHTML = POPULAR_DOMAINS.map(function(domain) {
        return '<label class="filter-option"><input type="checkbox" value="' + domain.name + '" onchange="applyFilters()"> ' + domain.name + '</label>';
    }).join('');
}

function applyFilters() {
    currentFilters.experience = [];
    document.querySelectorAll('#filter-screen input[type="checkbox"]').forEach(function(cb) {
        if (cb.checked && cb.value.indexOf('year') > -1) { currentFilters.experience.push(cb.value); }
    });
    currentFilters.domains = [];
    document.querySelectorAll('#filter-domains-list input[type="checkbox"]').forEach(function(cb) {
        if (cb.checked) { currentFilters.domains.push(cb.value); }
    });
    var ratingRadio = document.querySelector('#filter-screen input[name="rating"]:checked');
    currentFilters.rating = ratingRadio ? parseInt(ratingRadio.value) : 0;
}

function clearFilters() {
    currentFilters = { experience: [], rating: 0, domains: [] };
    document.querySelectorAll('#filter-screen input[type="checkbox"]').forEach(function(cb) { cb.checked = false; });
    var anyRating = document.querySelector('#filter-screen input[name="rating"][value="0"]');
    if (anyRating) anyRating.checked = true;
}

function getRecentSearches() {
    var searches = localStorage.getItem('mentorconnect_searches_' + currentUser.id);
    return searches ? JSON.parse(searches) : [];
}

function addRecentSearch(query) {
    var searches = getRecentSearches();
    searches = searches.filter(function(s) { return s !== query; });
    searches.unshift(query);
    searches = searches.slice(0, 10);
    localStorage.setItem('mentorconnect_searches_' + currentUser.id, JSON.stringify(searches));
}

var originalNavigateToDiscover = navigateTo;
navigateTo = function(screenId) {
    if (screenId === 'discover-screen') {
        previousScreen = document.querySelector('.screen.active') ? document.querySelector('.screen.active').id : 'welcome-screen';
        document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
        document.getElementById('discover-screen').classList.add('active');
        window.scrollTo(0, 0);
        initDiscoverScreen();
        return;
    }
    if (screenId === 'search-results-screen') {
        previousScreen = document.querySelector('.screen.active') ? document.querySelector('.screen.active').id : 'welcome-screen';
        document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
        document.getElementById('search-results-screen').classList.add('active');
        window.scrollTo(0, 0);
        return;
    }
    if (screenId === 'filter-screen') {
        previousScreen = document.querySelector('.screen.active') ? document.querySelector('.screen.active').id : 'welcome-screen';
        document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
        document.getElementById('filter-screen').classList.add('active');
        window.scrollTo(0, 0);
        return;
    }
    if (screenId === 'mentor-detail-screen') {
        previousScreen = document.querySelector('.screen.active') ? document.querySelector('.screen.active').id : 'welcome-screen';
        document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
        document.getElementById('mentor-detail-screen').classList.add('active');
        window.scrollTo(0, 0);
        return;
    }
    if (screenId === 'saved-mentors-screen') {
        previousScreen = document.querySelector('.screen.active') ? document.querySelector('.screen.active').id : 'welcome-screen';
        document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
        document.getElementById('saved-mentors-screen').classList.add('active');
        window.scrollTo(0, 0);
        renderSavedMentors();
        return;
    }
    if (screenId === 'popular-domains-screen') {
        previousScreen = document.querySelector('.screen.active') ? document.querySelector('.screen.active').id : 'welcome-screen';
        document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
        document.getElementById('popular-domains-screen').classList.add('active');
        window.scrollTo(0, 0);
        renderAllDomains();
        return;
    }
    originalNavigateToDiscover(screenId);
};

// ========================================
// PHASE 4 - COMMUNITY & KNOWLEDGE NETWORK
// ========================================

let currentCommunityId = null;
let currentPostId = null;
let currentPostFilter = 'all';

// Community data
const DEFAULT_COMMUNITIES = [
    { id: 'uiux', name: 'UI/UX Design', icon: '🎨', description: 'Discuss design principles, tools, and best practices', color: '#F59E0B' },
    { id: 'webdev', name: 'Web Development', icon: '🌐', description: 'Frontend, backend, and full-stack development', color: '#4A90D9' },
    { id: 'ai', name: 'Artificial Intelligence', icon: '🤖', description: 'Machine learning, deep learning, and AI applications', color: '#4A90D9' },
    { id: 'datascience', name: 'Data Science', icon: '📊', description: 'Data analysis, visualization, and statistics', color: '#2E4172' },
    { id: 'mobile', name: 'Mobile Development', icon: '📱', description: 'iOS, Android, and cross-platform development', color: '#EC4899' },
    { id: 'cloud', name: 'Cloud Computing', icon: '☁️', description: 'AWS, Azure, GCP, and cloud architecture', color: '#06B6D4' },
    { id: 'cybersec', name: 'Cybersecurity', icon: '🔒', description: 'Security practices, ethical hacking, and defense', color: '#EF4444' },
    { id: 'devops', name: 'DevOps', icon: '⚙️', description: 'CI/CD, containers, and infrastructure automation', color: '#F97316' },
    { id: 'blockchain', name: 'Blockchain', icon: '⛓️', description: 'Web3, smart contracts, and decentralized apps', color: '#2E4172' },
    { id: 'pm', name: 'Product Management', icon: '📋', description: 'Product strategy, roadmaps, and user research', color: '#4A90D9' }
];

// Storage helpers
function getCommunities() {
    var data = localStorage.getItem('mentorconnect_communities');
    if (!data) {
        localStorage.setItem('mentorconnect_communities', JSON.stringify(DEFAULT_COMMUNITIES));
        return DEFAULT_COMMUNITIES;
    }
    return JSON.parse(data);
}

function getCommunityMembers() {
    var raw = localStorage.getItem('mentorconnect_community_members');
    var members = {};
    try {
        members = raw ? JSON.parse(raw) : {};
    } catch (error) {
        members = {};
    }
    // Self-heal: keep only members whose user account actually exists, so
    // member counts and lists never include stale/ghost entries (e.g. after
    // an admin deleted a user who was part of a community).
    var users = getUsers();
    var changed = false;
    Object.keys(members).forEach(function (cid) {
        if (!Array.isArray(members[cid])) {
            members[cid] = [];
            changed = true;
            return;
        }
        var before = members[cid].length;
        members[cid] = members[cid].filter(function (id) {
            return users.some(function (u) { return u.id === id; });
        });
        if (members[cid].length !== before) changed = true;
    });
    if (changed) {
        saveCommunityMembers(members);
    }
    return members;
}

function saveCommunityMembers(members) {
    localStorage.setItem('mentorconnect_community_members', JSON.stringify(members));
}

function getPosts() {
    var data = localStorage.getItem('mentorconnect_posts');
    return data ? JSON.parse(data) : [];
}

function savePosts(posts) {
    localStorage.setItem('mentorconnect_posts', JSON.stringify(posts));
}

function getComments() {
    var data = localStorage.getItem('mentorconnect_comments');
    return data ? JSON.parse(data) : [];
}

function saveComments(comments) {
    localStorage.setItem('mentorconnect_comments', JSON.stringify(comments));
}

function getLikes() {
    var data = localStorage.getItem('mentorconnect_likes');
    return data ? JSON.parse(data) : {};
}

function saveLikes(likes) {
    localStorage.setItem('mentorconnect_likes', JSON.stringify(likes));
}

function getSavedPosts() {
    if (!currentUser) return [];
    var data = localStorage.getItem('mentorconnect_saved_posts_' + currentUser.id);
    return data ? JSON.parse(data) : [];
}

function saveSavedPosts(saved) {
    if (!currentUser) return;
    localStorage.setItem('mentorconnect_saved_posts_' + currentUser.id, JSON.stringify(saved));
}

// Check if user is member of community
function isCommunityMember(communityId) {
    if (!currentUser) return false;
    var members = getCommunityMembers();
    return (members[communityId] || []).indexOf(currentUser.id) > -1;
}

// Join/leave community
function toggleJoinCommunity() {
    if (!currentUser || !currentCommunityId) return;
    var members = getCommunityMembers();
    if (!members[currentCommunityId]) members[currentCommunityId] = [];
    var idx = members[currentCommunityId].indexOf(currentUser.id);
    if (idx > -1) {
        members[currentCommunityId].splice(idx, 1);
        showToast('Left community', 'info');
    } else {
        members[currentCommunityId].push(currentUser.id);
        showToast('Joined community!', 'success');
    }
    saveCommunityMembers(members);
    updateJoinButton();
    renderCommunityPosts();
}

function updateJoinButton() {
    var btn = document.getElementById('join-leave-btn');
    if (!btn || !currentCommunityId) return;
    if (isCommunityMember(currentCommunityId)) {
        btn.textContent = 'Leave';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-outline');
    } else {
        btn.textContent = 'Join';
        btn.classList.remove('btn-outline');
        btn.classList.add('btn-primary');
    }
}

// Community home screen
function initCommunityHome() {
    if (!currentUser) return;
    var nameEl = document.getElementById('ch-nav-name');
    var avatarEl = document.getElementById('ch-nav-avatar');
    if (nameEl) nameEl.textContent = currentUser.firstName + ' ' + currentUser.lastName;
    if (avatarEl && currentUser.photo) avatarEl.innerHTML = '<img src="' + currentUser.photo + '" alt="Avatar">';

    // My communities
    var members = getCommunityMembers();
    var communities = getCommunities();
    var myCommIds = [];
    for (var cid in members) {
        if (members[cid].indexOf(currentUser.id) > -1) myCommIds.push(cid);
    }
    var grid = document.getElementById('my-communities-grid');
    if (myCommIds.length === 0) {
        grid.innerHTML = '<span class="empty-state">No communities joined yet</span>';
    } else {
        grid.innerHTML = myCommIds.map(function(cid) {
            var c = communities.find(function(x) { return x.id === cid; });
            if (!c) return '';
            return '<div class="domain-card" onclick="openCommunity(\'' + c.id + '\')">' +
                '<div class="domain-card-icon" style="background:' + c.color + '15;color:' + c.color + '">' + c.icon + '</div>' +
                '<h4>' + c.name + '</h4><p>' + (members[c.id] || []).length + ' members</p></div>';
        }).join('');
    }

    // Recent discussions
    var posts = getPosts();
    var recentList = document.getElementById('recent-discussions-list');
    if (posts.length === 0) {
        recentList.innerHTML = '<p class="empty-state">No discussions yet</p>';
    } else {
        var recent = posts.slice(0, 5);
        recentList.innerHTML = recent.map(function(p) { return createPostItem(p); }).join('');
    }
}

// Community list screen
function initCommunityList() {
    if (!currentUser) return;
    var nameEl = document.getElementById('cl-nav-name');
    var avatarEl = document.getElementById('cl-nav-avatar');
    if (nameEl) nameEl.textContent = currentUser.firstName + ' ' + currentUser.lastName;
    if (avatarEl && currentUser.photo) avatarEl.innerHTML = '<img src="' + currentUser.photo + '" alt="Avatar">';
    renderAllCommunities();
}

function renderAllCommunities() {
    var communities = getCommunities();
    var members = getCommunityMembers();
    var grid = document.getElementById('all-communities-grid');
    grid.innerHTML = communities.map(function(c) {
        var isMember = (members[c.id] || []).indexOf(currentUser.id) > -1;
        return '<div class="domain-card" onclick="openCommunity(\'' + c.id + '\')">' +
            '<div class="domain-card-icon" style="background:' + c.color + '15;color:' + c.color + '">' + c.icon + '</div>' +
            '<h4>' + c.name + '</h4><p>' + (members[c.id] || []).length + ' members' +
            (isMember ? ' <span style="color:#10B981;font-weight:600;">&bull; Joined</span>' : '') + '</p></div>';
    }).join('');
}

function searchCommunities() {
    var query = document.getElementById('community-search-input').value.trim().toLowerCase();
    var communities = getCommunities();
    var members = getCommunityMembers();
    if (query) {
        communities = communities.filter(function(c) {
            return c.name.toLowerCase().indexOf(query) > -1 || c.description.toLowerCase().indexOf(query) > -1;
        });
    }
    var grid = document.getElementById('all-communities-grid');
    grid.innerHTML = communities.map(function(c) {
        var isMember = (members[c.id] || []).indexOf(currentUser.id) > -1;
        return '<div class="domain-card" onclick="openCommunity(\'' + c.id + '\')">' +
            '<div class="domain-card-icon" style="background:' + c.color + '15;color:' + c.color + '">' + c.icon + '</div>' +
            '<h4>' + c.name + '</h4><p>' + (members[c.id] || []).length + ' members' +
            (isMember ? ' <span style="color:#10B981;font-weight:600;">&bull; Joined</span>' : '') + '</p></div>';
    }).join('');
}

// Open community detail
function openCommunity(communityId) {
    currentCommunityId = communityId;
    var communities = getCommunities();
    var community = communities.find(function(c) { return c.id === communityId; });
    if (!community) return;

    // Update UI
    document.getElementById('cd-community-name').textContent = community.name;
    document.getElementById('cd-community-icon').textContent = community.icon;
    document.getElementById('cd-community-title').textContent = community.name;
    document.getElementById('cd-community-desc').textContent = community.description;

    var members = getCommunityMembers();
    var posts = getPosts().filter(function(p) { return p.communityId === communityId; });
    document.getElementById('cd-member-count').textContent = (members[communityId] || []).length + ' members';
    document.getElementById('cd-post-count').textContent = posts.length + ' posts';

    // Update nav
    var nameEl = document.getElementById('cd-nav-name');
    var avatarEl = document.getElementById('cd-nav-avatar');
    if (nameEl) nameEl.textContent = currentUser.firstName + ' ' + currentUser.lastName;
    if (avatarEl && currentUser.photo) avatarEl.innerHTML = '<img src="' + currentUser.photo + '" alt="Avatar">';

    updateJoinButton();
    renderCommunityPosts();
    navigateTo('community-detail-screen');
}

function renderCommunityPosts() {
    if (!currentCommunityId) return;
    var allPosts = getPosts().filter(function(p) { return p.communityId === currentCommunityId; });
    var filtered = currentPostFilter === 'all' ? allPosts : allPosts.filter(function(p) { return p.category === currentPostFilter; });
    filtered.sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });

    var container = document.getElementById('community-posts-list');
    if (filtered.length === 0) {
        container.innerHTML = '<p class="empty-state">No posts yet. Be the first to post!</p>';
    } else {
        container.innerHTML = filtered.map(function(p) { return createPostItem(p); }).join('');
    }
}

function filterPosts(category) {
    currentPostFilter = category;
    document.querySelectorAll('.post-category').forEach(function(el) { el.classList.remove('active'); });
    event.target.classList.add('active');
    renderCommunityPosts();
}

function createPostItem(post) {
    var users = getUsers();
    var author = users.find(function(u) { return u.id === post.authorId; });
    var authorName = author ? author.firstName + ' ' + author.lastName : 'Unknown';
    var avatar = author && author.photo ? '<img src="' + author.photo + '" alt="' + authorName + '">' :
        (authorName.charAt(0) || '?');
    var likes = getLikes();
    var postLikes = likes[post.id] || [];
    var saved = getSavedPosts();
    var comments = getComments().filter(function(c) { return c.postId === post.id; });
    var categoryClass = post.category || 'discussion';
    var categoryIcon = post.category === 'question' ? '❓' : post.category === 'resource' ? '📚' : '💬';
    var excerpt = post.content.length > 120 ? post.content.substring(0, 120) + '...' : post.content;
    var timeAgo = getTimeAgo(post.createdAt);

    return '<div class="post-item" onclick="openPost(\'' + post.id + '\')">' +
        '<div class="post-item-header"><div class="post-item-avatar">' + avatar + '</div>' +
        '<div class="post-item-meta"><h4>' + authorName + '</h4><span>' + timeAgo + '</span></div>' +
        '<span class="post-category-badge ' + categoryClass + '">' + categoryIcon + ' ' + (post.category || 'discussion') + '</span></div>' +
        '<h3 class="post-item-title">' + post.title + '</h3>' +
        '<p class="post-item-excerpt">' + excerpt + '</p>' +
        '<div class="post-item-footer">' +
        '<span>❤️ ' + postLikes.length + '</span>' +
        '<span>💬 ' + comments.length + '</span>' +
        (saved.indexOf(post.id) > -1 ? '<span>🔖 Saved</span>' : '') +
        '</div></div>';
}

function getTimeAgo(dateStr) {
    var now = new Date();
    var date = new Date(dateStr);
    var diff = Math.floor((now - date) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    return date.toLocaleDateString();
}

// Create post
function handleCreatePost(event) {
    event.preventDefault();
    var title = document.getElementById('post-title').value.trim();
    var category = document.getElementById('post-category').value;
    var content = document.getElementById('post-content').value.trim();
    var tagsStr = document.getElementById('post-tags').value.trim();
    var tags = tagsStr ? tagsStr.split(',').map(function(t) { return t.trim(); }).filter(function(t) { return t; }) : [];

    var posts = getPosts();
    posts.unshift({
        id: 'post_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        title: title,
        category: category,
        content: content,
        tags: tags,
        authorId: currentUser.id,
        communityId: currentCommunityId,
        createdAt: new Date().toISOString()
    });
    savePosts(posts);
    showToast('Post published!', 'success');
    goBack();
}

// Open post detail
function openPost(postId) {
    currentPostId = postId;
    var posts = getPosts();
    var post = posts.find(function(p) { return p.id === postId; });
    if (!post) return;

    var users = getUsers();
    var author = users.find(function(u) { return u.id === post.authorId; });
    var authorName = author ? author.firstName + ' ' + author.lastName : 'Unknown';
    var avatar = author && author.photo ? '<img src="' + author.photo + '" alt="' + authorName + '">' : (authorName.charAt(0) || '?');
    var likes = getLikes();
    var postLikes = likes[postId] || [];
    var isLiked = currentUser && postLikes.indexOf(currentUser.id) > -1;
    var saved = getSavedPosts();
    var isSaved = saved.indexOf(postId) > -1;

    var container = document.getElementById('post-detail-content');
    container.innerHTML = '<div class="post-detail-card">' +
        '<div class="post-detail-header"><div class="post-detail-avatar">' + avatar + '</div>' +
        '<div class="post-detail-meta"><h4>' + authorName + '</h4><span>' + getTimeAgo(post.createdAt) + '</span></div></div>' +
        '<h2 class="post-detail-title">' + post.title + '</h2>' +
        '<div class="post-detail-content">' + post.content.replace(/\n/g, '<br>') + '</div>' +
        (post.tags && post.tags.length > 0 ? '<div style="margin-bottom:12px;">' + post.tags.map(function(t) { return '<span class="post-tag">#' + t + '</span>'; }).join('') + '</div>' : '') +
        '<div class="post-detail-actions">' +
        '<button class="post-action-btn ' + (isLiked ? 'liked' : '') + '" onclick="toggleLike(\'' + post.id + '\')">' + (isLiked ? '❤️' : '🤍') + ' ' + postLikes.length + '</button>' +
        '<button class="post-action-btn ' + (isSaved ? 'saved' : '') + '" onclick="toggleSavePost(\'' + post.id + '\')">' + (isSaved ? '🔖' : '🔖') + ' ' + (isSaved ? 'Saved' : 'Save') + '</button>' +
        '<button class="post-action-btn" onclick="reportPost(\'' + post.id + '\')">🚩 Report</button>' +
        '</div></div>';

    renderComments();
    navigateTo('question-detail-screen');
}

function toggleLike(postId) {
    if (!currentUser) return;
    var likes = getLikes();
    if (!likes[postId]) likes[postId] = [];
    var idx = likes[postId].indexOf(currentUser.id);
    if (idx > -1) {
        likes[postId].splice(idx, 1);
    } else {
        likes[postId].push(currentUser.id);
    }
    saveLikes(likes);
    openPost(postId);
}

function toggleSavePost(postId) {
    if (!currentUser) return;
    var saved = getSavedPosts();
    var idx = saved.indexOf(postId);
    if (idx > -1) {
        saved.splice(idx, 1);
        showToast('Post unsaved', 'info');
    } else {
        saved.push(postId);
        showToast('Post saved!', 'success');
    }
    saveSavedPosts(saved);
    openPost(postId);
}

function reportPost(postId) {
    showToast('Post reported. Thank you for keeping the community safe.', 'info');
}

// Comments
function renderComments() {
    if (!currentPostId) return;
    var comments = getComments().filter(function(c) { return c.postId === currentPostId; });
    comments.sort(function(a, b) { return new Date(a.createdAt) - new Date(b.createdAt); });

    var container = document.getElementById('post-comments-list');
    if (comments.length === 0) {
        container.innerHTML = '<p class="empty-state">No comments yet. Be the first to comment!</p>';
        return;
    }

    var users = getUsers();
    container.innerHTML = comments.map(function(comment) {
        var author = users.find(function(u) { return u.id === comment.authorId; });
        var authorName = author ? author.firstName + ' ' + author.lastName : 'Unknown';
        var avatar = author && author.photo ? '<img src="' + author.photo + '" alt="' + authorName + '">' : (authorName.charAt(0) || '?');
        return '<div class="comment-item"><div class="comment-header"><div class="comment-avatar">' + avatar + '</div>' +
            '<div class="comment-meta"><h5>' + authorName + '</h5><span>' + getTimeAgo(comment.createdAt) + '</span></div></div>' +
            '<p class="comment-content">' + comment.content + '</p></div>';
    }).join('');
}

function addComment() {
    if (!currentUser || !currentPostId) return;
    var input = document.getElementById('comment-input');
    var content = input.value.trim();
    if (!content) return;

    var comments = getComments();
    comments.push({
        id: 'comment_' + Date.now(),
        postId: currentPostId,
        authorId: currentUser.id,
        content: content,
        createdAt: new Date().toISOString()
    });
    saveComments(comments);
    input.value = '';
    renderComments();
    showToast('Comment posted!', 'success');
}

// Saved posts screen
function renderSavedPostsScreen() {
    if (!currentUser) return;
    var nameEl = document.getElementById('sp-nav-name');
    var avatarEl = document.getElementById('sp-nav-avatar');
    if (nameEl) nameEl.textContent = currentUser.firstName + ' ' + currentUser.lastName;
    if (avatarEl && currentUser.photo) avatarEl.innerHTML = '<img src="' + currentUser.photo + '" alt="Avatar">';

    var savedIds = getSavedPosts();
    var posts = getPosts().filter(function(p) { return savedIds.indexOf(p.id) > -1; });
    var container = document.getElementById('saved-posts-list');

    if (posts.length === 0) {
        container.innerHTML = '<div class="saved-empty"><div class="saved-empty-icon">🔖</div><h3>No saved posts yet</h3><p>Save posts to read them later!</p><button class="btn btn-primary" onclick="navigateTo(\'community-home-screen\')">Browse Communities</button></div>';
    } else {
        container.innerHTML = posts.map(function(p) { return createPostItem(p); }).join('');
    }
}

// Override navigateTo for Phase 4 screens
var originalNavigateToPhase4 = navigateTo;
navigateTo = function(screenId) {
    if (screenId === 'community-home-screen') {
        previousScreen = document.querySelector('.screen.active') ? document.querySelector('.screen.active').id : 'welcome-screen';
        document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
        document.getElementById('community-home-screen').classList.add('active');
        window.scrollTo(0, 0);
        initCommunityHome();
        return;
    }
    if (screenId === 'community-list-screen') {
        previousScreen = document.querySelector('.screen.active') ? document.querySelector('.screen.active').id : 'welcome-screen';
        document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
        document.getElementById('community-list-screen').classList.add('active');
        window.scrollTo(0, 0);
        initCommunityList();
        return;
    }
    if (screenId === 'community-detail-screen') {
        previousScreen = document.querySelector('.screen.active') ? document.querySelector('.screen.active').id : 'welcome-screen';
        document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
        document.getElementById('community-detail-screen').classList.add('active');
        window.scrollTo(0, 0);
        return;
    }
    if (screenId === 'create-post-screen') {
        previousScreen = document.querySelector('.screen.active') ? document.querySelector('.screen.active').id : 'welcome-screen';
        document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
        document.getElementById('create-post-screen').classList.add('active');
        window.scrollTo(0, 0);
        return;
    }
    if (screenId === 'question-detail-screen') {
        previousScreen = document.querySelector('.screen.active') ? document.querySelector('.screen.active').id : 'welcome-screen';
        document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
        document.getElementById('question-detail-screen').classList.add('active');
        window.scrollTo(0, 0);
        return;
    }
    if (screenId === 'saved-posts-screen') {
        previousScreen = document.querySelector('.screen.active') ? document.querySelector('.screen.active').id : 'welcome-screen';
        document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
        document.getElementById('saved-posts-screen').classList.add('active');
        window.scrollTo(0, 0);
        renderSavedPostsScreen();
        return;
    }
    originalNavigateToPhase4(screenId);
};

// ========================================
// PHASE 5 - REAL-TIME MENTORSHIP COMMUNICATION
// ========================================

let currentChatPartnerId = null;

// Storage helpers
function getMessages() {
    var data = localStorage.getItem('mentorconnect_messages');
    return data ? JSON.parse(data) : [];
}

function updateNotificationIndicators() {
    var unreadCount = currentUser
        ? getMessages().filter(function (message) {
            return message.receiverId === currentUser.id && !message.read;
        }).length
        : 0;
    document.querySelectorAll('.notification-badge').forEach(function (badge) {
        if (badge.id === 'admin-new-users-badge') return; // admin bell tracks new-member registrations
        // All header badges are now driven by the universal notification system
        // (notifications.js) — message unread counts are no longer shown on bells.
        return;
        badge.textContent = unreadCount > 0 ? unreadCount : '';
        badge.classList.toggle('has-unread', unreadCount > 0);
    });
}

function saveMessages(messages) {
    localStorage.setItem('mentorconnect_messages', JSON.stringify(messages));
}

function getBlockedUsers() {
    if (!currentUser) return [];
    var data = localStorage.getItem('mentorconnect_blocked_' + currentUser.id);
    return data ? JSON.parse(data) : [];
}

function saveBlockedUsers(blocked) {
    if (!currentUser) return;
    localStorage.setItem('mentorconnect_blocked_' + currentUser.id, JSON.stringify(blocked));
}

function getResources() {
    var data = localStorage.getItem('mentorconnect_resources');
    return data ? JSON.parse(data) : [];
}

function saveResources(resources) {
    localStorage.setItem('mentorconnect_resources', JSON.stringify(resources));
}

function isUserBlocked(userId) {
    return getBlockedUsers().indexOf(userId) > -1;
}

function getConversationId(userId1, userId2) {
    return [userId1, userId2].sort().join('_');
}

// Messages screen
function initMessagesScreen() {
    if (!currentUser) return;
    var nameEl = document.getElementById('msg-nav-name');
    var avatarEl = document.getElementById('msg-nav-avatar');
    if (nameEl) nameEl.textContent = currentUser.firstName + ' ' + currentUser.lastName;
    if (avatarEl && currentUser.photo) avatarEl.innerHTML = '<img src="' + currentUser.photo + '" alt="Avatar">';

    renderConversationsList();
}

function renderConversationsList() {
    var messages = getMessages();
    var users = getUsers();
    var blocked = getBlockedUsers();

    // Get unique conversation partners
    var partners = {};
    messages.forEach(function(msg) {
        if (msg.senderId === currentUser.id && blocked.indexOf(msg.receiverId) === -1) {
            if (!partners[msg.receiverId]) partners[msg.receiverId] = { lastMsg: msg, unread: 0 };
            else if (new Date(msg.createdAt) > new Date(partners[msg.receiverId].lastMsg.createdAt)) partners[msg.receiverId].lastMsg = msg;
        }
        if (msg.receiverId === currentUser.id && blocked.indexOf(msg.senderId) === -1) {
            if (!partners[msg.senderId]) partners[msg.senderId] = { lastMsg: msg, unread: msg.read ? 0 : 1 };
            else {
                if (new Date(msg.createdAt) > new Date(partners[msg.senderId].lastMsg.createdAt)) partners[msg.senderId].lastMsg = msg;
                if (!msg.read) partners[msg.senderId].unread++;
            }
        }
    });

    var container = document.getElementById('conversations-list');
    var partnerIds = Object.keys(partners);

    // Update unread badge
    var totalUnread = partnerIds.reduce(function(sum, pid) { return sum + (partners[pid].unread || 0); }, 0);
    var badge = document.getElementById('unread-badge');
    if (totalUnread > 0) {
        badge.textContent = totalUnread + ' unread';
        badge.style.display = 'inline';
    } else {
        badge.style.display = 'none';
    }
    updateNotificationIndicators();

    if (partnerIds.length === 0) {
        container.innerHTML = '<p class="empty-state">No conversations yet. Connect with mentors to start chatting!</p>';
        return;
    }

    container.innerHTML = partnerIds.map(function(pid) {
        var partner = users.find(function(u) { return u.id === pid; });
        if (!partner) return '';
        var conv = partners[pid];
        var avatar = partner.photo ? '<img src="' + partner.photo + '" alt="' + partner.firstName + '">' : partner.firstName.charAt(0);
        var lastMsg = conv.lastMsg.content.length > 40 ? conv.lastMsg.content.substring(0, 40) + '...' : conv.lastMsg.content;
        var isUnread = conv.unread > 0;
        return '<div class="conversation-item ' + (isUnread ? 'unread' : '') + '" onclick="openChat(\'' + pid + '\')">' +
            '<div class="conversation-avatar">' + avatar + '</div>' +
            '<div class="conversation-info"><h4>' + partner.firstName + ' ' + partner.lastName + '</h4>' +
            '<p>' + (conv.lastMsg.senderId === currentUser.id ? 'You: ' : '') + lastMsg + '</p></div>' +
            '<div class="conversation-meta"><span>' + formatTime(conv.lastMsg.createdAt) + '</span>' +
            (isUnread ? '<div class="unread-dot"></div>' : '') + '</div></div>';
    }).join('');
}

function formatTime(dateStr) {
    var date = new Date(dateStr);
    var now = new Date();
    var diff = now - date;
    if (diff < 60000) return 'now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h';
    if (diff < 604800000) return Math.floor(diff / 86400000) + 'd';
    return date.toLocaleDateString();
}

// Open chat
function openChat(partnerId) {
    currentChatPartnerId = partnerId;
    var users = getUsers();
    var partner = users.find(function(u) { return u.id === partnerId; });
    if (!partner) return;

    // Update header
    document.getElementById('chat-partner-name').textContent = partner.firstName + ' ' + partner.lastName;
    var status = partner.online ? 'Online' : 'Offline';
    document.getElementById('chat-partner-status').textContent = status;
    document.getElementById('chat-partner-status').classList.toggle('online', !!partner.online);
    var avatarEl = document.getElementById('chat-partner-avatar');
    avatarEl.innerHTML = partner.photo ? '<img src="' + partner.photo + '" alt="' + partner.firstName + '">' : partner.firstName.charAt(0);
    renderChatProfile(partner);
    closeChatProfile();

    // Update block button
    var blockBtn = document.getElementById('block-btn');
    if (isUserBlocked(partnerId)) {
        blockBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg> Unblock';
    } else {
        blockBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M4.93 4.93l14.14 14.14"/></svg> Block';
    }

    // Mark messages as read
    var messages = getMessages();
    messages.forEach(function(msg) {
        if (msg.senderId === partnerId && msg.receiverId === currentUser.id) msg.read = true;
    });
    saveMessages(messages);

    renderChatMessages();
    navigateTo('private-chat-screen');
    setTimeout(function() { document.getElementById('message-input').focus(); }, 300);
}

function renderChatProfile(partner) {
    var fullName = partner.firstName + ' ' + partner.lastName;
    var status = partner.online ? 'Online' : 'Offline';
    var avatar = partner.photo ? '<img src="' + partner.photo + '" alt="' + fullName + '">' : partner.firstName.charAt(0);
    document.getElementById('chat-profile-avatar').innerHTML = avatar;
    document.getElementById('chat-profile-name').textContent = fullName;
    document.getElementById('chat-profile-status').textContent = status;
    document.getElementById('chat-profile-status').classList.toggle('online', !!partner.online);
    document.getElementById('chat-profile-role').textContent = partner.role ? partner.role.charAt(0).toUpperCase() + partner.role.slice(1) : 'Member';
    document.getElementById('chat-profile-email').textContent = partner.email || '-';
    document.getElementById('chat-profile-connection').textContent = isUserBlocked(partner.id) ? 'Blocked' : 'Connected';
}

function toggleChatProfile(event) {
    event.stopPropagation();
    var popover = document.getElementById('chat-profile-popover');
    var button = document.querySelector('.chat-header-person');
    var isOpen = popover.classList.toggle('open');
    popover.setAttribute('aria-hidden', String(!isOpen));
    button.setAttribute('aria-expanded', String(isOpen));
}

function closeChatProfile() {
    var popover = document.getElementById('chat-profile-popover');
    var button = document.querySelector('.chat-header-person');
    if (!popover) return;
    popover.classList.remove('open');
    popover.setAttribute('aria-hidden', 'true');
    if (button) button.setAttribute('aria-expanded', 'false');
}

function startChatCall(type) {
    var partner = currentChatPartnerId && userById(currentChatPartnerId);
    if (!partner) return;
    showToast((type === 'audio' ? 'Audio' : 'Video') + ' call with ' + partner.firstName + ' is not available in this demo yet.', 'info');
}

function viewChatPartnerProfile() {
    var partner = currentChatPartnerId && userById(currentChatPartnerId);
    if (!partner) return;
    closeChatProfile();
    if (partner.role === 'mentor') {
        viewMentorDetail(partner.id);
    } else {
        showToast('This contact has no public profile page yet.', 'info');
    }
}

document.addEventListener('click', function(event) {
    var popover = document.getElementById('chat-profile-popover');
    if (popover && popover.classList.contains('open') && !event.target.closest('.chat-header-person') && !event.target.closest('.chat-profile-popover')) {
        closeChatProfile();
    }
});

function renderChatMessages() {
    if (!currentChatPartnerId) return;
    var messages = getMessages().filter(function(msg) {
        return (msg.senderId === currentUser.id && msg.receiverId === currentChatPartnerId) ||
               (msg.senderId === currentChatPartnerId && msg.receiverId === currentUser.id);
    });
    messages.sort(function(a, b) { return new Date(a.createdAt) - new Date(b.createdAt); });

    var container = document.getElementById('chat-messages');
    if (messages.length === 0) {
        container.innerHTML = '<p class="empty-state" style="text-align:center;padding:40px;">No messages yet. Start the conversation!</p>';
        return;
    }

    container.innerHTML = messages.map(function(msg) {
        var isSent = msg.senderId === currentUser.id;
        var time = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return '<div class="message-bubble ' + (isSent ? 'sent' : 'received') + '">' +
            '<p>' + msg.content + '</p><span class="message-time">' + time + '</span></div>';
    }).join('');

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
}

function sendMessage(event) {
    event.preventDefault();
    if (!currentChatPartnerId) return;
    var input = document.getElementById('message-input');
    var content = input.value.trim();
    if (!content) return;

    if (isUserBlocked(currentChatPartnerId)) {
        showToast('This user is blocked', 'error');
        return;
    }

    var messages = getMessages();
    messages.push({
        id: 'msg_' + Date.now(),
        senderId: currentUser.id,
        receiverId: currentChatPartnerId,
        content: content,
        read: false,
        createdAt: new Date().toISOString()
    });
    saveMessages(messages);
    input.value = '';
    renderChatMessages();

    // Push a bell notification to the recipient so direct messages show up there.
    if (typeof ucPushNotification === 'function') {
        var partner = getUsers().find(function (u) { return u.id === currentChatPartnerId; });
        var senderName = currentUser.firstName + ' ' + currentUser.lastName;
        var preview = content.length > 60 ? content.slice(0, 60) + '…' : content;
        var roleLabel = partner && partner.role === 'mentor' ? ' (Mentor)' : '';
        ucPushNotification([currentChatPartnerId], 'message',
            'New message from ' + senderName + roleLabel, preview);
    }
}

// Block/Unblock user
function blockCurrentUser() {
    if (!currentChatPartnerId) return;
    var blocked = getBlockedUsers();
    var idx = blocked.indexOf(currentChatPartnerId);
    if (idx > -1) {
        blocked.splice(idx, 1);
        showToast('User unblocked', 'success');
    } else {
        blocked.push(currentChatPartnerId);
        showToast('User blocked', 'info');
    }
    saveBlockedUsers(blocked);
    openChat(currentChatPartnerId);
}

function renderBlockedUsers() {
    var blocked = getBlockedUsers();
    var users = getUsers();
    var container = document.getElementById('blocked-users-list');

    if (blocked.length === 0) {
        container.innerHTML = '<p class="empty-state">No blocked users</p>';
        return;
    }

    container.innerHTML = blocked.map(function(uid) {
        var user = users.find(function(u) { return u.id === uid; });
        if (!user) return '';
        var avatar = user.photo ? '<img src="' + user.photo + '" alt="' + user.firstName + '">' : user.firstName.charAt(0);
        return '<div class="blocked-item"><div class="blocked-avatar">' + avatar + '</div>' +
            '<div class="blocked-info"><h4>' + user.firstName + ' ' + user.lastName + '</h4>' +
            '<p>' + (user.role === 'mentor' ? (user.position || 'Mentor') : (user.major || 'Student')) + '</p></div>' +
            '<button class="btn btn-outline btn-sm" onclick="unblockUser(\'' + uid + '\')">Unblock</button></div>';
    }).join('');
}

function unblockUser(userId) {
    var blocked = getBlockedUsers();
    blocked = blocked.filter(function(id) { return id !== userId; });
    saveBlockedUsers(blocked);
    renderBlockedUsers();
    showToast('User unblocked', 'success');
}

// Shared resources
function renderSharedResources() {
    if (!currentUser) return;
    var nameEl = document.getElementById('res-nav-name');
    var avatarEl = document.getElementById('res-nav-avatar');
    if (nameEl) nameEl.textContent = currentUser.firstName + ' ' + currentUser.lastName;
    if (avatarEl && currentUser.photo) avatarEl.innerHTML = '<img src="' + currentUser.photo + '" alt="Avatar">';

    var resources = getResources().filter(function(r) {
        return r.sharedWith === currentUser.id || r.sharedBy === currentUser.id;
    });
    var container = document.getElementById('shared-resources-list');

    if (resources.length === 0) {
        container.innerHTML = '<p class="empty-state">No resources shared yet</p>';
        return;
    }

    var users = getUsers();
    container.innerHTML = resources.map(function(res) {
        var owner = users.find(function(u) { return u.id === res.sharedBy; });
        var ownerName = owner ? owner.firstName + ' ' + owner.lastName : 'Unknown';
        return '<div class="resource-item"><div class="resource-icon">📎</div>' +
            '<div class="resource-info"><h4>' + res.name + '</h4>' +
            '<p>' + res.description + '</p></div>' +
            '<div class="resource-meta">Shared by ' + ownerName + '<br>' + formatTime(res.createdAt) + '</div></div>';
    }).join('');
}

// Override navigateTo for Phase 5 screens
var originalNavigateToPhase5 = navigateTo;
navigateTo = function(screenId) {
    if (screenId === 'messages-screen') {
        previousScreen = document.querySelector('.screen.active') ? document.querySelector('.screen.active').id : 'welcome-screen';
        document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
        document.getElementById('messages-screen').classList.add('active');
        window.scrollTo(0, 0);
        initMessagesScreen();
        return;
    }
    if (screenId === 'private-chat-screen') {
        previousScreen = document.querySelector('.screen.active') ? document.querySelector('.screen.active').id : 'welcome-screen';
        document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
        document.getElementById('private-chat-screen').classList.add('active');
        window.scrollTo(0, 0);
        return;
    }
    if (screenId === 'shared-resources-screen') {
        previousScreen = document.querySelector('.screen.active') ? document.querySelector('.screen.active').id : 'welcome-screen';
        document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
        document.getElementById('shared-resources-screen').classList.add('active');
        window.scrollTo(0, 0);
        renderSharedResources();
        return;
    }
    if (screenId === 'blocked-users-screen') {
        previousScreen = document.querySelector('.screen.active') ? document.querySelector('.screen.active').id : 'welcome-screen';
        document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
        document.getElementById('blocked-users-screen').classList.add('active');
        window.scrollTo(0, 0);
        renderBlockedUsers();
        return;
    }
    originalNavigateToPhase5(screenId);
};
