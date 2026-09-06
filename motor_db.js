// motor_db.js - Capa universal de datos para Electron (SQLite) y Web (localStorage)
(function() {
  const isElectron = typeof require === 'function';
  let dbInstance = null;

  if (isElectron) {
    try {
      const Database = require('better-sqlite3');
      // Subir nivel según la profundidad relativa habitual o cargar desde ruta estándar
      const dbPath = require('../db_path.js').DB_PATH || require('./db_path.js').DB_PATH;
      dbInstance = new Database(dbPath);
    } catch (e) {
      try {
        const Database = require('better-sqlite3');
        dbInstance = new Database(require('./db_path.js').DB_PATH);
      } catch (err) {}
    }
  }

  // Si no está en Electron, dbInstance emula las funciones necesarias de SQLite
  if (!dbInstance) {
    dbInstance = {
      transaction: function(fn) {
        return function(...args) { return fn(...args); };
      },
      prepare: function(sql) {
        return {
          all: function(...args) { return q(sql, ...args); },
          get: function(...args) { return qGet(sql, ...args); },
          run: function(...args) { return qRun(sql, ...args); }
        };
      }
    };
  }

  // Exponer db al ámbito global (window)
  window.db = dbInstance;

  // Resolución universal de sesión
  let sesionActiva = null;
  if (isElectron) {
    try {
      const auth = require('../auth.js') || require('./auth.js');
      sesionActiva = auth.obtenerSesionActiva ? auth.obtenerSesionActiva() : null;
    } catch (e) {}
  }
  if (!sesionActiva) {
    try { sesionActiva = JSON.parse(localStorage.getItem('sesion_activa')); } catch (e) {}
  }
  window.sesionActiva = sesionActiva;
  window.operarioGlobal = sesionActiva 
    ? (sesionActiva.nombre_completo || sesionActiva.operario || sesionActiva.usuario) 
    : 'Operario';

  // Helpers auxiliares de almacenamiento web
  function parsearTabla(sql) {
    const match = sql.match(/(?:FROM|INTO|UPDATE|TABLE)\s+([a-zA-Z0-9_]+)/i);
    return match ? match[1].toLowerCase() : null;
  }

  function obtenerRegistros(tabla) {
    try {
      const crudo = localStorage.getItem(tabla);
      return crudo ? JSON.parse(crudo) : [];
    } catch (e) {
      return [];
    }
  }

  function guardarRegistros(tabla, filas) {
    try {
      localStorage.setItem(tabla, JSON.stringify(filas));
    } catch (e) {}
  }

  // 1. SELECT general (all)
  window.q = function(sql, ...args) {
    if (isElectron && dbInstance && dbInstance.prepare && typeof dbInstance.prepare(sql).all === 'function') {
      try { return dbInstance.prepare(sql).all(...args); } catch (e) { console.error(sql, e); return []; }
    }

    const tabla = parsearTabla(sql);
    if (!tabla) return [];

    let filas = obtenerRegistros(tabla);

    if (/WHERE.*estado\s*=\s*['"]ACTIVO['"]/i.test(sql) || /WHERE.*activo/i.test(sql)) {
      filas = filas.filter(r => {
        const act = String(r.estado || r.activo || '').toUpperCase().trim();
        return act === 'ACTIVO' || act === '1' || act === 'TRUE' || act === '';
      });
    }

    if (/WHERE.*fecha\s*=\s*\?/i.test(sql) && args.length > 0) {
      filas = filas.filter(r => String(r.fecha) === String(args[0]));
    } else if (/WHERE.*fecha\s*>=\s*\?\s*AND\s*fecha\s*<=\s*\?/i.test(sql) && args.length >= 2) {
      filas = filas.filter(r => r.fecha >= args[0] && r.fecha <= args[1]);
    }

    if (/turno_riego\s*=\s*\?/i.test(sql) && args.length > 0) {
      filas = filas.filter(r => parseInt(r.turno_riego) === parseInt(args[0]));
    }

    if (/ORDER BY.*DESC/i.test(sql)) {
      filas.sort((a, b) => (Number(b.id || b.registro) || 0) - (Number(a.id || a.registro) || 0));
    } else if (/ORDER BY.*ASC/i.test(sql)) {
      filas.sort((a, b) => (Number(a.id || a.registro) || 0) - (Number(b.id || b.registro) || 0));
    }

    return filas;
  };

  // 2. SELECT registro único (get)
  window.qGet = function(sql, ...args) {
    if (isElectron && dbInstance && dbInstance.prepare && typeof dbInstance.prepare(sql).get === 'function') {
      try { return dbInstance.prepare(sql).get(...args); } catch (e) { console.error(sql, e); return null; }
    }

    const tabla = parsearTabla(sql);
    if (!tabla) return null;

    if (/SELECT\s+MAX\(([a-zA-Z0-9_]+)\)/i.test(sql)) {
      const matchCampo = sql.match(/SELECT\s+MAX\(([a-zA-Z0-9_]+)\)/i);
      const campo = matchCampo ? matchCampo[1] : 'id';
      const filas = obtenerRegistros(tabla);
      let maximo = 0;
      for (const r of filas) {
        const v = Number(r[campo]);
        if (!isNaN(v) && v > maximo) maximo = v;
      }
      return { maxId: maximo, maximo: maximo, [campo]: maximo };
    }

    if (/WHERE.*id\s*=\s*\?\s*AND\s*reg_local\s*=\s*\?/i.test(sql) && args.length >= 2) {
      const filas = obtenerRegistros(tabla);
      return filas.find(r => String(r.id) === String(args[0]) && String(r.reg_local) === String(args[1])) || null;
    }

    const resultado = window.q(sql, ...args);
    return resultado.length > 0 ? resultado[0] : null;
  };

  // 3. INSERT / UPDATE / DELETE (run)
  window.qRun = function(sql, ...args) {
    if (isElectron && dbInstance && dbInstance.prepare && typeof dbInstance.prepare(sql).run === 'function') {
      try { return dbInstance.prepare(sql).run(...args); } catch (e) { console.error(sql, e); throw e; }
    }

    const tabla = parsearTabla(sql);
    if (!tabla) return { changes: 0 };

    let filas = obtenerRegistros(tabla);

    if (/^INSERT/i.test(sql.trim())) {
      const nuevo = {};
      const matchCols = sql.match(/\((.*?)\)\s*VALUES/i);

      if (matchCols) {
        const columnas = matchCols[1].split(',').map(c => c.trim());
        columnas.forEach((col, idx) => {
          nuevo[col] = args[idx] !== undefined ? args[idx] : null;
        });
      }

      filas.unshift(nuevo);
      guardarRegistros(tabla, filas);
      return { changes: 1, lastInsertRowid: nuevo.id };
    }

    if (/^UPDATE/i.test(sql.trim())) {
      if (args.length >= 6) {
        const [nh, nl, ntot, nc, targetId, targetReg] = args;
        filas.forEach(r => {
          if (String(r.id) === String(targetId) || String(r.reg_local) === String(targetReg)) {
            r.horas = nh;
            r.lamina = nl;
            r.total_mm = ntot;
            r.comentario = nc;
            r.sincronizado = 0;
          }
        });
      }
      guardarRegistros(tabla, filas);
      return { changes: 1 };
    }

    if (/^DELETE/i.test(sql.trim())) {
      if (/WHERE.*fecha\s*=\s*\?/i.test(sql) && args.length > 0) {
        filas = filas.filter(r => String(r.fecha) !== String(args[0]));
      } else if (/WHERE.*id\s*=\s*\?/i.test(sql) && args.length > 0) {
        filas = filas.filter(r => String(r.id) !== String(args[0]));
      }
      guardarRegistros(tabla, filas);
      return { changes: 1 };
    }

    return { changes: 0 };
  };
})();