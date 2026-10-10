# University Management System — DBMS Practical Website

A full-stack demonstration project with a login page and a DBMS dashboard covering DDL, DML, DQL, DCL-style permission management, and TCL transactions.

## Requirements
- Node.js 18+ (20+ recommended)
- Internet connection on first install to download packages

## Run locally
1. Extract this folder.
2. Open a terminal inside the folder.
3. Run `npm install`
4. Run `npm start`
5. Open `http://localhost:3000`

## Demo login
- Username: `admin`
- Password: `admin123`

Change the demo password before using this beyond a classroom demo. This project is intended for local coursework demonstration, not production deployment.

## Features
- Login/logout and session-protected dashboard
- University tables: Departments, Students, Faculty, Courses, Enrollments
- Browse tables and view records
- DDL: CREATE TABLE, ALTER TABLE (add column), DROP TABLE
- DML: INSERT, UPDATE, DELETE
- DQL: SELECT, filtering, sorting, joins and aggregates via SQL console
- DCL: Grant/Revoke simulated application permissions (SQLite does not implement SQL GRANT/REVOKE)
- TCL: BEGIN, COMMIT, ROLLBACK using transaction controls
- Query history and sample query templates
- Server-side SQL execution; only one SQL statement per run

## Important technical note
This project uses SQLite for easy local setup. SQLite supports DDL, DML, DQL and transaction statements, but does not implement SQL `GRANT` and `REVOKE`. The DCL section therefore demonstrates role-based access permissions at the application level rather than pretending SQLite has native DCL support. The interface labels this clearly.

## Example SQL to try
```sql
SELECT s.student_id, s.full_name, d.department_name, s.cgpa
FROM students s
LEFT JOIN departments d ON d.department_id = s.department_id
ORDER BY s.student_id;
```

```sql
SELECT department_id, COUNT(*) AS student_count, AVG(cgpa) AS average_cgpa
FROM students
GROUP BY department_id;
```

## Project structure
- `server.js` — Express server, authentication, database setup and SQL API
- `public/index.html` — login page and dashboard UI
- `public/styles.css` — responsive styling
- `public/app.js` — dashboard interactions
- `data/` — SQLite database created automatically on first run
