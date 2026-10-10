const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'university.db'));
db.pragma('foreign_keys = ON');

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'replace-this-classroom-demo-secret',
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 2 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

const schema = [
`CREATE TABLE IF NOT EXISTS departments (
 department_id TEXT PRIMARY KEY,
 department_name TEXT NOT NULL UNIQUE,
 location TEXT NOT NULL
)`,
`CREATE TABLE IF NOT EXISTS students (
 student_id TEXT PRIMARY KEY,
 full_name TEXT NOT NULL,
 email TEXT UNIQUE,
 age INTEGER CHECK(age BETWEEN 16 AND 100),
 cgpa REAL CHECK(cgpa BETWEEN 0 AND 10),
 department_id TEXT,
 FOREIGN KEY(department_id) REFERENCES departments(department_id) ON UPDATE CASCADE ON DELETE SET NULL
)`,
`CREATE TABLE IF NOT EXISTS faculty (
 faculty_id TEXT PRIMARY KEY,
 full_name TEXT NOT NULL,
 email TEXT UNIQUE,
 designation TEXT,
 department_id TEXT,
 FOREIGN KEY(department_id) REFERENCES departments(department_id) ON UPDATE CASCADE ON DELETE SET NULL
)`,
`CREATE TABLE IF NOT EXISTS courses (
 course_id TEXT PRIMARY KEY,
 course_name TEXT NOT NULL,
 credits INTEGER NOT NULL CHECK(credits BETWEEN 1 AND 10),
 department_id TEXT,
 faculty_id TEXT,
 FOREIGN KEY(department_id) REFERENCES departments(department_id) ON UPDATE CASCADE ON DELETE SET NULL,
 FOREIGN KEY(faculty_id) REFERENCES faculty(faculty_id) ON UPDATE CASCADE ON DELETE SET NULL
)`,
`CREATE TABLE IF NOT EXISTS enrollments (
 enrollment_id INTEGER PRIMARY KEY AUTOINCREMENT,
 student_id TEXT NOT NULL,
 course_id TEXT NOT NULL,
 semester TEXT NOT NULL,
 grade TEXT,
 UNIQUE(student_id, course_id, semester),
 FOREIGN KEY(student_id) REFERENCES students(student_id) ON DELETE CASCADE,
 FOREIGN KEY(course_id) REFERENCES courses(course_id) ON DELETE CASCADE
)`
];
schema.forEach(sql => db.exec(sql));

const count = db.prepare('SELECT COUNT(*) AS n FROM departments').get().n;
if (!count) {
  const seed = db.transaction(() => {
    db.prepare('INSERT INTO departments VALUES (?, ?, ?)').run('DP101', 'Computer Science', 'Block A');
    db.prepare('INSERT INTO departments VALUES (?, ?, ?)').run('DP102', 'Electronics', 'Block B');
    db.prepare('INSERT INTO departments VALUES (?, ?, ?)').run('DP103', 'Mechanical', 'Block C');
    db.prepare('INSERT INTO students VALUES (?, ?, ?, ?, ?, ?)').run('S101', 'Aarav Sharma', 'aarav@example.edu', 19, 8.6, 'DP101');
    db.prepare('INSERT INTO students VALUES (?, ?, ?, ?, ?, ?)').run('S102', 'Meera Iyer', 'meera@example.edu', 20, 9.1, 'DP101');
    db.prepare('INSERT INTO students VALUES (?, ?, ?, ?, ?, ?)').run('S103', 'Kabir Singh', 'kabir@example.edu', 19, 7.8, 'DP102');
    db.prepare('INSERT INTO faculty VALUES (?, ?, ?, ?, ?)').run('F201', 'Dr. N. Rao', 'n.rao@example.edu', 'Professor', 'DP101');
    db.prepare('INSERT INTO faculty VALUES (?, ?, ?, ?, ?)').run('F202', 'Dr. P. Menon', 'p.menon@example.edu', 'Associate Professor', 'DP102');
    db.prepare('INSERT INTO courses VALUES (?, ?, ?, ?, ?)').run('C101', 'Database Management Systems', 4, 'DP101', 'F201');
    db.prepare('INSERT INTO courses VALUES (?, ?, ?, ?, ?)').run('C102', 'Computer Networks', 3, 'DP101', 'F201');
    db.prepare('INSERT INTO courses VALUES (?, ?, ?, ?, ?)').run('C103', 'Digital Electronics', 4, 'DP102', 'F202');
    db.prepare('INSERT INTO enrollments (student_id, course_id, semester, grade) VALUES (?, ?, ?, ?)').run('S101', 'C101', 'Fall 2026', 'A');
    db.prepare('INSERT INTO enrollments (student_id, course_id, semester, grade) VALUES (?, ?, ?, ?)').run('S102', 'C101', 'Fall 2026', 'A+');
    db.prepare('INSERT INTO enrollments (student_id, course_id, semester, grade) VALUES (?, ?, ?, ?)').run('S103', 'C103', 'Fall 2026', 'B+');
  });
  seed();
}

const users = new Map([
  ['admin', { passwordHash: bcrypt.hashSync('admin123', 10), role: 'Administrator' }],
  ['faculty', { passwordHash: bcrypt.hashSync('faculty123', 10), role: 'Faculty' }]
]);
const permissions = {
  Administrator: ['DDL', 'DML', 'DQL', 'DCL', 'TCL'],
  Faculty: ['DQL', 'DML']
};
const roleGrants = new Map([
  ['Administrator', new Set(['DDL', 'DML', 'DQL', 'DCL', 'TCL'])],
  ['Faculty', new Set(['DQL', 'DML'])]
]);
const queryHistory = new Map();

function auth(req, res, next) {
  if (!req.session.username || !users.has(req.session.username)) return res.status(401).json({ error: 'Please log in again.' });
  next();
}
function allowed(req, category) {
  const user = users.get(req.session.username);
  return user && (roleGrants.get(user.role)?.has(category) || false);
}
function categoryOf(sql) {
  const s = sql.trim().replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '').trim().toUpperCase();
  if (/^(CREATE|ALTER|DROP|TRUNCATE|RENAME)\b/.test(s)) return 'DDL';
  if (/^(INSERT|UPDATE|DELETE|REPLACE)\b/.test(s)) return 'DML';
  if (/^(SELECT|WITH|EXPLAIN|PRAGMA\s+TABLE_INFO)\b/.test(s)) return 'DQL';
  if (/^(BEGIN|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE)\b/.test(s)) return 'TCL';
  if (/^(GRANT|REVOKE)\b/.test(s)) return 'DCL';
  return 'OTHER';
}
function oneStatement(sql) {
  const stripped = sql.trim().replace(/;+\s*$/, '');
  if (!stripped) throw new Error('Enter a SQL statement first.');
  if (stripped.includes(';')) throw new Error('Run one SQL statement at a time.');
  return stripped;
}
function runSql(sql) {
  const stmt = oneStatement(sql);
  const category = categoryOf(stmt);
  if (category === 'DCL') throw new Error('SQLite has no native GRANT/REVOKE commands. Use the DCL Permissions panel to demonstrate application-level role permissions.');
  if (category === 'OTHER') throw new Error('Supported statements: SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, and transaction commands.');
  if (/^\s*(ATTACH|DETACH|VACUUM|LOAD_EXTENSION)\b/i.test(stmt)) throw new Error('This statement is disabled in the classroom SQL console.');
  if (/^\s*PRAGMA\b/i.test(stmt) && !/^PRAGMA\s+TABLE_INFO\s*\(/i.test(stmt)) throw new Error('Only PRAGMA table_info(table_name) is allowed.');
  if (/^\s*(BEGIN|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE)\b/i.test(stmt)) {
    db.exec(stmt);
    return { category, message: `${category} statement executed successfully.`, rows: [], changes: 0 };
  }
  if (/^\s*SELECT\b/i.test(stmt) || /^\s*WITH\b/i.test(stmt) || /^\s*PRAGMA\s+TABLE_INFO/i.test(stmt) || /^\s*EXPLAIN\b/i.test(stmt)) {
    const rows = db.prepare(stmt).all();
    return { category: category === 'OTHER' ? 'DQL' : category, rows, changes: 0, message: `${rows.length} row(s) returned.` };
  }
  const result = db.prepare(stmt).run();
  return { category, rows: [], changes: result.changes, lastInsertRowid: result.lastInsertRowid, message: `Statement executed successfully. ${result.changes} row(s) affected.` };
}

app.post('/api/login', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const user = users.get(username);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) return res.status(401).json({ error: 'Invalid username or password.' });
  req.session.username = username;
  queryHistory.set(username, []);
  res.json({ username, role: user.role });
});
app.post('/api/logout', auth, (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/me', auth, (req, res) => {
  const user = users.get(req.session.username);
  res.json({ username: req.session.username, role: user.role, permissions: [...(roleGrants.get(user.role) || [])] });
});
app.get('/api/tables', auth, (req, res) => {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(x => x.name);
  res.json({ tables });
});
app.get('/api/table/:name', auth, (req, res) => {
  const name = String(req.params.name);
  const valid = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
  if (!valid) return res.status(404).json({ error: 'Table not found.' });
  try {
    const columns = db.prepare(`PRAGMA table_info("${name.replace(/"/g, '""')}")`).all();
    const rows = db.prepare(`SELECT * FROM "${name.replace(/"/g, '""')}" LIMIT 250`).all();
    res.json({ name, columns, rows });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/stats', auth, (req, res) => {
  const get = t => db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n;
  res.json({ students: get('students'), faculty: get('faculty'), courses: get('courses'), departments: get('departments'), enrollments: get('enrollments') });
});
app.post('/api/query', auth, (req, res) => {
  const sql = String(req.body.sql || '');
  const category = categoryOf(sql);
  if (category !== 'OTHER' && !allowed(req, category)) return res.status(403).json({ error: `Your role does not have ${category} permission.` });
  try {
    const result = runSql(sql);
    const h = queryHistory.get(req.session.username) || [];
    h.unshift({ sql: sql.trim(), category: result.category, at: new Date().toISOString(), ok: true });
    queryHistory.set(req.session.username, h.slice(0, 30));
    res.json(result);
  } catch (e) {
    const h = queryHistory.get(req.session.username) || [];
    h.unshift({ sql: sql.trim(), category, at: new Date().toISOString(), ok: false });
    queryHistory.set(req.session.username, h.slice(0, 30));
    res.status(400).json({ error: e.message });
  }
});
app.get('/api/history', auth, (req, res) => res.json({ history: queryHistory.get(req.session.username) || [] }));
app.get('/api/permissions', auth, (req, res) => {
  const result = {};
  for (const [role, grants] of roleGrants.entries()) result[role] = [...grants];
  res.json({ permissions: result, currentRole: users.get(req.session.username).role });
});
app.post('/api/permissions', auth, (req, res) => {
  if (!allowed(req, 'DCL')) return res.status(403).json({ error: 'Only an Administrator can change role permissions.' });
  const { role, category, action } = req.body;
  if (!roleGrants.has(role) || !['DDL','DML','DQL','DCL','TCL'].includes(category) || !['grant','revoke'].includes(action)) return res.status(400).json({ error: 'Invalid role, permission, or action.' });
  const set = roleGrants.get(role);
  if (action === 'grant') set.add(category); else set.delete(category);
  res.json({ message: `${category} ${action === 'grant' ? 'granted to' : 'revoked from'} ${role}.`, permissions: Object.fromEntries([...roleGrants].map(([k,v]) => [k,[...v]])) });
});
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`University DBMS website running at http://localhost:${PORT}`));
