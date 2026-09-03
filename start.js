// Lanza Electron con ELECTRON_RUN_AS_NODE limpio.
// Necesario porque terminales embebidas (p.ej. VS Code) heredan esa variable
// de su propio proceso Electron, y con ella activa "electron ." corre como
// Node puro (app llega undefined en main.js) en vez de levantar la app.
delete process.env.ELECTRON_RUN_AS_NODE;

const { spawn } = require('child_process');
const electronPath = require('electron');

const child = spawn(electronPath, ['.'], { stdio: 'inherit', env: process.env });
child.on('exit', (code) => process.exit(code === null ? 1 : code));
