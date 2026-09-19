const fs = require('fs');
try {
    const app = require('./server.js');
    console.log('Successfully required server.js');
} catch (err) {
    console.error('Error requiring server.js:', err);
    fs.writeFileSync('error_log.txt', err.stack);
}
