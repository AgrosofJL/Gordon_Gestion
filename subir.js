const { db } = require('./bases.js');
const { supabaseCampo, supabaseCosecha } = require('./conexion.js');
const tablasConfig = require('./tablas_lista.js'); 

const columnasExcluidasPorTabla = {
  'local_p_nomina_personal': [
    'fecha_nacimiento', 'estado_civil', 'nacionalidad', 'domicilio', 'cp', 'localidad', 'provincia',
    'telefono', 'email', 'domicilio_notif', 'beneficiario_nombre', 'beneficiario_dni',
    'beneficiario_parentesco', 'beneficiario_domicilio', 'beneficiario_localidad', 'beneficiario_provincia'
  ]
};

async function subirCambiosLocales() {
  console.log("--- [PUSH] Iniciando subida incremental multi-proyecto ---");

  for (const tabla of tablasConfig) {
    try {
      const registros = db.prepare(`SELECT * FROM ${tabla.local} WHERE sincronizado = 0`).all();
      if (registros.length === 0) continue;

      const cliente = tabla.proyecto === 'campo' ? supabaseCampo : supabaseCosecha;
      console.log(`Subiendo ${registros.length} cambios a Proyecto [${tabla.proyecto.toUpperCase()}] -> Tabla: ${tabla.remoto}`);

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
        /* ACA ES LO NUEVO: Se asegura la clave compuesta para normas de conducta / sanciones */
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

      for (const reg of registros) {
        const payload = { ...reg };
        delete payload.sincronizado;
        delete payload.hora_volcado;
        
        for (const colExcluida of (columnasExcluidasPorTabla[tabla.local] || [])) {
          delete payload[colExcluida];
        }

        /* ESTO LO MODIFIQUE: Garantizamos un ID numerico si la tabla requiere 'id' y viene nulo/vacio */
        if (pkColumnas.includes('id')) {
          if (payload.id === null || payload.id === undefined || payload.id === 0 || payload.id === '') {
            // Asignamos un ID entero positivo unico basado en timestamp para evitar violar NOT NULL
            const idGenerado = Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000);
            payload.id = idGenerado;
            reg.id = idGenerado; // Actualizamos la referencia para la clausula WHERE local
          }
        }

        const pkValores = pkColumnas.map(col => reg[col]);

        const { error } = await cliente
          .from(tabla.remoto)
          .upsert([payload], { onConflict: Array.isArray(pkColumna) ? pkColumnas.join(',') : pkColumna });

        if (!error) {
          db.prepare(`UPDATE ${tabla.local} SET sincronizado = 1 WHERE ${pkColumnas.map(col => `${col} = ?`).join(' AND ')}`).run(...pkValores);
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

module.exports = { subirCambiosLocales };