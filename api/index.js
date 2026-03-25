// api/index.js - Punto de entrada para Vercel
const handler = require('../dist/main.js');

module.exports = handler.default || handler;