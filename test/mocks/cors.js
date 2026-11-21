// test/mocks/cors.js — no-op CORS middleware mock for API route tests.
'use strict';
module.exports = () => (_req, _res, next) => { if (typeof next === 'function') next(); };
