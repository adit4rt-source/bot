// test/mocks/better-sqlite3.js — better-sqlite3-compatible API on top of Node's
// built-in node:sqlite (DatabaseSync). Used only by the test runner so tests run
// without installing the native better-sqlite3 module.
const { DatabaseSync } = require('node:sqlite');
class Statement {
  constructor(db, sql) { this._stmt = db.prepare(sql); }
  _norm(args){ if (args.length === 1 && Array.isArray(args[0])) return args[0]; return args; }
  get(...a){ return this._stmt.get(...this._norm(a)); }
  all(...a){ return this._stmt.all(...this._norm(a)); }
  run(...a){ const r=this._stmt.run(...this._norm(a)); return { changes:Number(r.changes), lastInsertRowid:r.lastInsertRowid }; }
  iterate(...a){ return this._stmt.all(...this._norm(a))[Symbol.iterator](); }
  pluck(){ return this; } raw(){ return this; } bind(){ return this; }
}
class Database {
  constructor(path){ this._path = path || ':memory:'; this._db = new DatabaseSync(this._path); }
  prepare(sql){ return new Statement(this._db, sql); }
  exec(sql){ this._db.exec(sql); return this; }
  pragma(str){
    const s = String(str).trim();
    // Support the read form used by checkGlobalMode(): pragma('table_info(users)')
    const m = s.match(/^table_info\(([^)]+)\)$/i);
    if (m) {
      try { return this._db.prepare(`PRAGMA table_info(${m[1]})`).all(); } catch (e) { return []; }
    }
    try { this._db.exec('PRAGMA ' + s + ';'); } catch(e){}
    return [];
  }
  transaction(fn){ const db=this._db; return (...args)=>{ db.exec('BEGIN'); try{ const r=fn(...args); db.exec('COMMIT'); return r; } catch(e){ try{db.exec('ROLLBACK');}catch(_){} throw e; } }; }
  // better-sqlite3 online backup API (Promise form)
  backup(dest){
    const fs = require('fs');
    return new Promise((resolve, reject) => {
      try {
        // node:sqlite has no backup API; for tests just copy the file if path-like
        if (this._path && this._path !== ':memory:' && fs.existsSync(this._path)) {
          fs.copyFileSync(this._path, dest);
        } else {
          // Memory DB: write empty placeholder so callers don't crash
          fs.writeFileSync(dest, '');
        }
        resolve();
      } catch (e) { reject(e); }
    });
  }
  close(){ try{ this._db.close(); }catch(_){} }
  function(){} aggregate(){}
}
module.exports = Database;
