
const { app, BrowserWindow } = require('electron');
const path = require('path');

let ventanaPrincipal = null;

const cerrojoUnico = app.requestSingleInstanceLock();

if (!cerrojoUnico) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (ventanaPrincipal) {
      if (ventanaPrincipal.isMinimized()) ventanaPrincipal.restore();
      ventanaPrincipal.focus();
    }
  });

  app.whenReady().then(crearVentana);
}

function crearVentana() {
 
  ventanaPrincipal = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#f5f5f7', // ESTO LO MODIFIQUE: Color base gris claro nativo de Apple Soft
    autoHideMenuBar: true, 
    icon: path.join(__dirname, 'logo.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });


  ventanaPrincipal.loadFile(path.join(__dirname, 'index.html'));
  //ventanaPrincipal.loadURL("data:text/html,<h1>FUNCIONA</h1>");
  // Descomentá esta línea mientras estés desarrollando, si querés ver la consola:
   //ventanaPrincipal.webContents.openDevTools();

  ventanaPrincipal.on('closed', () => {
    ventanaPrincipal = null;
  });
}

app.on('window-all-closed', () => {
   
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  
  if (BrowserWindow.getAllWindows().length === 0) crearVentana();
});