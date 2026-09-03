// db_path.js
// Ruta fija y writable para la base local, independiente del cwd del proceso
// (en la app empaquetada el cwd varía / puede no tener permisos de escritura,
// lo que hacía que la sesión guardada en local_sesion no persistiera entre reinicios).
const path = require('path');
const os = require('os');
const fs = require('fs');

const DB_DIR = path.join(os.homedir(), '.gordon_gestion');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const DB_PATH = path.join(DB_DIR, 'gordon_gestion_local.db');

module.exports = { DB_PATH };
