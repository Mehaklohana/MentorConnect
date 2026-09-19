const app = require('./server.js');
const request = require('supertest');

async function runTests() {
    try {
        const res = await request(app).get('/api/health');
        console.log('Health:', res.status, res.body);
    } catch(e) {
        console.error(e);
    }
    process.exit(0);
}
runTests();
