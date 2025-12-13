const fs = require('fs');
try {
    const data = fs.readFileSync('fronts.json', 'utf8');
    fs.writeFileSync('db.js', 'const INITIAL_DB = ' + data + ';');
    console.log("Success");
} catch (e) { console.error(e); }
