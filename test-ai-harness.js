// Temporary harness: exercises the offline AI coach engine outside the browser.
const fs = require('fs');
const src = fs.readFileSync('platform.js', 'utf8');
const start = src.indexOf('MENTOR AI — conversational career coach');
const end = src.indexOf('\nfunction renderPlans');
if (start === -1 || end === -1) { console.error('markers not found'); process.exit(1); }
let code = src.slice(src.lastIndexOf('/*', start), end);

// Browser/global stubs
const store = {};
global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); }
};
global.currentUser = { id: 'u_test', firstName: 'Alex', lastName: 'Rivera', role: 'student' };
global.CAREER_FIELDS = {
    'software-engineering': { name: 'Software Engineering', skills: ['JavaScript', 'Git', 'Problem Solving', 'Collaboration'] },
    'ui-ux-design': { name: 'UI/UX Design', skills: ['Figma', 'User Research', 'Wireframing', 'Collaboration'] }
};
global.getCareerProfile = () => ({
    currentField: 'software-engineering',
    targetField: 'ui-ux-design',
    skillProgress: { Figma: 40, 'User Research': 10 },
    milestones: [
        { id: 'm1', title: 'Choose a target career', done: true },
        { id: 'm2', title: 'Complete first skill sprint', done: false }
    ]
});
global.analyzeTransition = () => ({
    from: global.CAREER_FIELDS['software-engineering'],
    to: global.CAREER_FIELDS['ui-ux-design'],
    transferable: ['Problem Solving', 'Collaboration'],
    missing: ['Figma', 'User Research', 'Wireframing']
});
global.getSub = () => ({ plan: 'free', sessionLimit: 3, aiUses: 0 });
global.getUsers = () => ([
    { id: 'me', role: 'student' },
    { id: 'm1', role: 'mentor', firstName: 'Priya', lastName: 'Sharma', position: 'Lead UI/UX Designer', skills: ['Figma', 'User Research'] },
    { id: 'm2', role: 'mentor', firstName: 'James', lastName: 'Okeke', position: 'Product Designer', skills: ['Wireframing'] }
]);
global.getSessions = () => ([
    { studentId: 'u_test', status: 'confirmed', topic: 'Portfolio review', date: '2026-09-15', time: '10:00' }
]);
global.lsGet = (k, f) => (k in store ? JSON.parse(store[k]) : f);
global.lsSet = (k, v) => { store[k] = JSON.stringify(v); };
global.showToast = () => {};
global.navigateTo = () => {};
global.searchByDomain = () => {};
global.window = global;

eval(code);

const tests = [
    ['hi', 'greeting'],
    ['How are you?', 'howareyou'],
    ['Which skills should I learn next?', 'skills'],
    ['Recommend mentors for my career goal.', 'mentors'],
    ['How should I update my resume for a career change?', 'resume'],
    ['I feel stuck and tired', 'motivation'],
    ['Build me a career roadmap', 'roadmap'],
    ['How much does premium cost?', 'pricing'],
    ['any advice for interviews?', 'interview'],
    ['what can you do?', 'aboutyou'],
    ['thanks that was helpful', 'thanks'],
    ['How is my progress?', 'progress'],
    ['How do I write a connect request?', 'mentors'],
    ['I want to switch to UI/UX', 'fields|roadmap'],
    ['What is the meaning of life?', 'fallback']
];
let fail = 0;
const chat = aiNewChat();
tests.forEach(([q, expected]) => {
    const intent = aiDetectIntent(q);
    const ok = expected.split('|').indexOf(intent) !== -1;
    if (!ok) fail++;
    console.log((ok ? 'PASS' : 'FAIL') + '  [' + intent + '] ' + q);
});
// Follow-up + blocker flows
chat.lastIntent = 'skills';
console.log((aiDetectIntent('tell me more') === 'followup' ? 'PASS' : 'FAIL') + '  [followup] tell me more');
const moreTurn = aiComposeReply('tell me more', chat);
console.log((moreTurn.text.indexOf('Going deeper') === 0 && moreTurn.text.indexOf('Figma') !== -1 ? 'PASS' : 'FAIL') + '  [deeper reply] ' + moreTurn.text.slice(0, 90) + '...');
chat.pending = 'blocker';
const blockerTurn = aiComposeReply('I have no time because of my job', chat);
console.log((blockerTurn.intent === 'blocker' && /Time is the usual suspect/.test(blockerTurn.text) ? 'PASS' : 'FAIL') + '  [blocker reply] ' + blockerTurn.text.slice(0, 90) + '...');
// Greeting + chips sanity
const g = aiGreeting(chat, false);
console.log((g.text.indexOf('Alex') !== -1 && g.quick.length === 4 ? 'PASS' : 'FAIL') + '  [greeting] ' + g.text.slice(0, 90) + '...');
const m = aiComposeReply('Recommend mentors for my career goal.', chat);
console.log((m.text.indexOf('Priya Sharma') !== -1 && m.actions.length >= 1 ? 'PASS' : 'FAIL') + '  [mentor names + actions] ' + m.text.slice(0, 90) + '...');
// Persistence round-trip
chat.messages.push({ role: 'user', text: 'hi', ts: 1 }, { role: 'assistant', text: 'yo', ts: 2 });
aiSaveChat(chat);
const reloaded = aiGetChat();
console.log((reloaded.messages.length === 2 ? 'PASS' : 'FAIL') + '  [persistence] ' + reloaded.messages.length + ' messages');
// generateAiReply compat
console.log((typeof generateAiReply('which skills next') === 'string' && generateAiReply('which skills next').length > 20 ? 'PASS' : 'FAIL') + '  [generateAiReply compat]');
console.log(fail === 0 ? 'ALL PASS' : fail + ' FAILURES');
process.exit(fail === 0 ? 0 : 1);