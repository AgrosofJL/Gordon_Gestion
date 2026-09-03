const fs = require('fs');
const path = require('path');
const { db } = require('./bases.js');
const { supabaseCampo, supabaseCosecha } = require('./conexion.js');
const tablasConfig = require('./tablas_lista.js'); 

/* ACA ES LO NUEVO: Helper robusto para descargar y guardar fotos creando carpetas si no existen */
async function guardarImagenDescargada(cliente, nombreBucket, rutaRemota, rutaLocalAbsoluta) {
  try {
    // 1. Crear directorios contenedores si no existen (solución al error ENOENT)
    const carpetaContenedora = path.dirname(rutaLocalAbsoluta);
    if (!fs.existsSync(carpetaContenedora)) {
      fs.mkdirSync(carpetaContenedora, { recursive: true });
    }

    // 2. Descargar el archivo desde Supabase Storage
    const { data, error } = await cliente.storage.from(nombreBucket).download(rutaRemota);
    if (error) throw error;

    // 3. Escribir el buffer al disco local
    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(rutaLocalAbsoluta, buffer);
    console.log(`  📸 Imagen guardada en disco: ${rutaRemota}`);
  } catch (err) {
    console.error(`  ❌ Error al descargar archivo ${rutaRemota}:`, err.message);
  }
}

async function bajarCambiosRemotos() {
  console.log("--- [PULL] Iniciando descarga incremental multi-proyecto ---");

  for (const tabla of tablasConfig) {
    try {
      const cliente = tabla.proyecto === 'campo' ? supabaseCampo : supabaseCosecha;
      
      // Consultamos los registros remotos
      const { data: registrosRemotos, error } = await cliente.from(tabla.remoto).select('*');
      if (error) {
        console.error(`  ❌ Error al consultar ${tabla.remoto} en [${tabla.proyecto.toUpperCase()}]:`, error.message);
        continue;
      }

      if (!registrosRemotos || registrosRemotos.length === 0) continue;

      let pkColumna = 'id';
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
      if (mapaClavesEspeciales[tabla.local]) pkColumna = mapaClavesEspeciales[tabla.local];
      const pkColumnas = Array.isArray(pkColumna) ? pkColumna : [pkColumna];

      // Obtenemos columnas validas de la tabla local SQLite para no intentar insertar propiedades inexistentes
      const columnasTablaLocal = db.prepare(`PRAGMA table_info(${tabla.local})`).all().map(c => c.name);

      for (const regRemoto of registrosRemotos) {
        // Filtrar propiedades del payload para que coincidan con SQLite local
        const regFiltrado = {};
        for (const col of columnasTablaLocal) {
          if (regRemoto[col] !== undefined) {
            regFiltrado[col] = regRemoto[col];
          }
        }
        regFiltrado.sincronizado = 1; // Marcamos como sincronizado al bajarlo

        const pkValores = pkColumnas.map(col => regRemoto[col]);
        const existeLocal = db.prepare(`SELECT 1 FROM ${tabla.local} WHERE ${pkColumnas.map(col => `${col} = ?`).join(' AND ')}`).get(...pkValores);

        const columnasKeys = Object.keys(regFiltrado);
        if (existeLocal) {
          const setClause = columnasKeys.map(col => `${col} = ?`).join(', ');
          const updateValues = columnasKeys.map(col => regFiltrado[col]);
          db.prepare(`UPDATE ${tabla.local} SET ${setClause} WHERE ${pkColumnas.map(col => `${col} = ?`).join(' AND ')}`).run(...updateValues, ...pkValores);
        } else {
          const placeholders = columnasKeys.map(() => '?').join(', ');
          const insertValues = columnasKeys.map(col => regFiltrado[col]);
          db.prepare(`INSERT INTO ${tabla.local} (${columnasKeys.join(', ')}) VALUES (${placeholders})`).run(...insertValues);
        }

        /* ACA ES LO NUEVO: Si la tabla contiene rutas a imágenes de despachos, las descargamos asegurando directorios */
        if (regRemoto.foto_path || regRemoto.imagen_ruta) {
          const rutaFoto = regRemoto.foto_path || regRemoto.imagen_ruta;
          if (rutaFoto) {
            const rutaLocalAbsoluta = path.join(__dirname, 'despachos_media', rutaFoto);
            if (!fs.existsSync(rutaLocalAbsoluta)) {
              await guardarImagenDescargada(cliente, 'despachos_media', rutaFoto, rutaLocalAbsoluta);
            }
          }
        }
      }

      console.log(`  ✓ [Sincronizado PULL] ${tabla.local} <- ${registrosRemotos.length} filas procesadas`);
    } catch (err) {
      console.error(`Fallo en lote de bajada para ${tabla.local}:`, err.message);
    }
  }

  console.log("--- [PULL] Finalizado correctamente ---");
}

module.exports = { bajarCambiosRemotos };