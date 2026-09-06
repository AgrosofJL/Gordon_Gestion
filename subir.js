// subir.js
const esEntornoNode = typeof require === 'function' && typeof process !== 'undefined';

let db = null;
let supabaseCampo = null;
let supabaseCosecha = null;
let tablasConfig = [];

if (esEntornoNode) {
  try {
    const bases = require('./bases.js');
    db = bases.db;
  } catch (e) {}

  try {
    const conexion = require('./conexion.js');
    supabaseCampo = conexion.supabaseCampo;
    supabaseCosecha = conexion.supabaseCosecha;
  } catch (e) {}

  try {
    tablasConfig = require('./tablas_lista.js');
  } catch (e) {}
} else {
  // Entorno Web (Safari / Chrome / GitHub Pages)
  tablasConfig = window.TABLAS_CONFIG || [];
  supabaseCampo = window._clientCampo;
  supabaseCosecha = window._clientCosecha;
}

const columnasExcluidasPorTabla = {
  'local_p_nomina_personal': [
    'fecha_nacimiento', 'estado_civil', 'nacionalidad', 'domicilio', 'cp', 'localidad', 'provincia',
    'telefono', 'email', 'domicilio_notif', 'beneficiario_nombre', 'beneficiario_dni',
    'beneficiario_parentesco', 'beneficiario_domicilio', 'beneficiario_localidad', 'beneficiario_provincia'
  ]
};

const mapaClavesEspeciales = {
  'local_p_cuadros': 'cod_parcela',
  'local_p_cultivo': 'cod_esp',
  'local_p_inventario_plantacion': 'id_inv',
  'local_p_marcos_plantacion': 'cod_marco',
  'local_p_variedades': 'id_var',
  'local_cosecha': 'nro_unidad',
  'local_p_tipo_control_aplicaciones': 'codigo',
  'local_p_aplicacionesOrdenes': 'cabecera',
  'local_p_nomina_personal': 'legajo',
  'local_p_legajo_datos': 'legajo',
  'local_i_insumos_rubros': 'id_rubro',
  'local_i_insumos_subrubros': 'cod',
  'local_p_recetas_aplicaciones': ['registro', 'cabecera'],
  'local_r_aplicaciones_fol_fert': ['registro', 'reg_aplic', 'cab_aplic'],
  'local_c_consumos_combustibles': ['id', 'reg_local'],
  'local_i_insumos_catalogo': ['id', 'reg_local'],
  'local_i_insumos_detalle': ['id', 'reg_local'],
  'local_i_insumos_movimientos': ['id', 'reg_local'],
  'local_i_insumosingresos': ['id', 'reg_local'],
  'local_m_labores_maquinaria': ['id', 'reg_local'],
  'local_p_personal_historial': ['id', 'reg_local'],
  'local_p_normas_conducta': ['id', 'reg_local'],
  'local_p_personal_sanciones': ['id', 'reg_local'],
  'local_r_campo_riego': ['id', 'reg_local'],
  'local_r_jornada_trabajo': ['id', 'reg_local'],
  'local_r_mantenimiento_maquinaria': ['id', 'reg_local'],
  'local_descarte': ['id', 'reg_local'],
  'local_p_calibre': ['id', 'reg_local'],
  'local_p_categoria': ['id', 'reg_local'],
  'local_p_clientes': ['id', 'reg_local'],
  'local_p_embalaje': ['id', 'reg_local'],
  'local_p_productores': ['id', 'reg_local'],
  'local_paletizado': ['id', 'reg_local'],
  'local_despachos_produccion': 'reg_local',
  'local_detalle_recepcion': 'reg_local'
};

// ============================================================================
// 1. REPLICAR ELIMINACIONES PENDIENTES (DELETE EN SUPABASE)
// ============================================================================
async function subirEliminacionesPendientes() {
  console.log("--- [DELETE PUSH] Verificando eliminaciones pendientes ---");

  // CASO A: En la PC (Electron con SQLite)
  if (esEntornoNode && db) {
    try {
      const existeTabla = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='local_eliminados'").get();
      if (existeTabla) {
        const eliminados = db.prepare("SELECT * FROM local_eliminados WHERE sincronizado = 0").all();
        for (const el of eliminados) {
          const cliente = el.proyecto === 'cosecha' ? supabaseCosecha : supabaseCampo;
          if (!cliente) continue;

          const { error } = await cliente
            .from(el.tabla_remota)
            .delete()
            .eq(el.columna_pk, el.valor_pk);

          if (!error) {
            db.prepare("UPDATE local_eliminados SET sincronizado = 1 WHERE id = ?").run(el.id);
            console.log(`  ✓ [Baja SQLite] ${el.tabla_remota} (${el.columna_pk} = ${el.valor_pk})`);
          } else {
            console.error(`  ❌ Error al borrar en ${el.tabla_remota}:`, error.message);
          }
        }
      }
    } catch (e) {
      console.warn("Aviso revisando local_eliminados en SQLite:", e.message);
    }
  }

  // CASO B: En la Web (Safari / Chrome -> LocalStorage)
  if (!esEntornoNode) {
    try {
      const cola = JSON.parse(localStorage.getItem('local_eliminados_pendientes') || '[]');
      if (cola.length === 0) return;

      const pendientesRestantes = [];

      for (const item of cola) {
        const cliente = item.proyecto === 'cosecha' ? window._clientCosecha : window._clientCampo;
        if (!cliente) {
          pendientesRestantes.push(item);
          continue;
        }

        const { error } = await cliente
          .from(item.tabla_remota)
          .delete()
          .eq(item.columna_pk, item.valor_pk);

        if (!error) {
          console.log(`  ✓ [Baja Web] ${item.tabla_remota} (${item.columna_pk} = ${item.valor_pk})`);
        } else {
          console.error(`  ❌ Error al borrar en Supabase (${item.tabla_remota}):`, error.message);
          pendientesRestantes.push(item);
        }
      }

      localStorage.setItem('local_eliminados_pendientes', JSON.stringify(pendientesRestantes));
    } catch (err) {
      console.error("Error procesando eliminaciones web:", err);
    }
  }
}

// ============================================================================
// 2. SUBIR CAMBIOS LOCALES PENDIENTES (INSERT / UPDATE EN SUPABASE)
// ============================================================================
async function subirCambiosLocales() {
  console.log("--- [PUSH] Iniciando subida incremental multi-proyecto ---");

  if (!esEntornoNode) {
    if (!supabaseCampo && window._clientCampo) supabaseCampo = window._clientCampo;
    if (!supabaseCosecha && window._clientCosecha) supabaseCosecha = window._clientCosecha;
    if (!tablasConfig || tablasConfig.length === 0) tablasConfig = window.TABLAS_CONFIG || [];
  }

  for (const tabla of tablasConfig) {
    try {
      let registros = [];

      // Lectura de registros pendientes con sincronizado = 0
      if (esEntornoNode && db) {
        registros = db.prepare(`SELECT * FROM ${tabla.local} WHERE sincronizado = 0`).all();
      } else {
        const crudo = localStorage.getItem(tabla.local);
        if (crudo) {
          const todos = JSON.parse(crudo);
          registros = todos.filter(r => r.sincronizado === 0 || r.sincronizado === '0' || r.sincronizado === false);
        }
      }

      if (!registros || registros.length === 0) continue;

      const cliente = tabla.proyecto === 'campo' ? supabaseCampo : supabaseCosecha;
      if (!cliente) continue;

      console.log(`Subiendo ${registros.length} cambios a Proyecto [${tabla.proyecto.toUpperCase()}] -> Tabla: ${tabla.remoto}`);

      let pkColumna = mapaClavesEspeciales[tabla.local] || 'id';
      const pkColumnas = Array.isArray(pkColumna) ? pkColumna : [pkColumna];
      const onConflictKey = Array.isArray(pkColumna) ? pkColumnas.join(',') : pkColumna;

      for (const reg of registros) {
        const payload = { ...reg };
        delete payload.sincronizado;
        delete payload.hora_volcado;

        for (const colExcluida of (columnasExcluidasPorTabla[tabla.local] || [])) {
          delete payload[colExcluida];
        }

        if (pkColumnas.includes('id')) {
          if (payload.id === null || payload.id === undefined || payload.id === 0 || payload.id === '') {
            const idGenerado = Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000);
            payload.id = idGenerado;
            reg.id = idGenerado;
          }
        }

        const pkValores = pkColumnas.map(col => reg[col]);

        const { error } = await cliente
          .from(tabla.remoto)
          .upsert([payload], { onConflict: onConflictKey });

        if (!error) {
          if (esEntornoNode && db) {
            db.prepare(`UPDATE ${tabla.local} SET sincronizado = 1 WHERE ${pkColumnas.map(col => `${col} = ?`).join(' AND ')}`).run(...pkValores);
          } else {
            const listaLocal = JSON.parse(localStorage.getItem(tabla.local) || '[]');
            const index = listaLocal.findIndex(item => pkColumnas.every(col => String(item[col]) === String(reg[col])));
            if (index !== -1) {
              listaLocal[index].sincronizado = 1;
              localStorage.setItem(tabla.local, JSON.stringify(listaLocal));
            }
          }
          console.log(`  ✓ [Sincronizado] ${tabla.remoto} -> ${pkColumnas.join(',')}: ${pkValores.join(',')}`);
        } else {
          console.error(`  ❌ Error en Proyecto [${tabla.proyecto.toUpperCase()}] para ${tabla.remoto}:`, error.message);
        }
      }
    } catch (err) {
      console.error(`Fallo en lote de subida para ${tabla.local}:`, err.message);
    }
  }
  console.log("--- [PUSH] Finalizado correctamente ---");
}

// Exportación Híbrida
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { subirCambiosLocales, subirEliminacionesPendientes };
} else {
  window.subirCambiosLocales = subirCambiosLocales;
  window.subirEliminacionesPendientes = subirEliminacionesPendientes;
}