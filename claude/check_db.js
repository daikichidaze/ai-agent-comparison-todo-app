const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('todo.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }

  console.log('Connected to database');

  db.all('SELECT * FROM tasks ORDER BY id', [], (err, rows) => {
    if (err) {
      console.error('Error querying tasks:', err);
      process.exit(1);
    }

    console.log('\n=== Tasks in Database ===');
    console.log('Total tasks:', rows.length);
    console.log('\nTask details:');
    rows.forEach(row => {
      console.log(JSON.stringify(row, null, 2));
    });

    db.close();
  });
});
