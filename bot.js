import 'dotenv/config';
import { TwitterApi } from 'twitter-api-v2';
import fs from 'fs';

const client = new TwitterApi({
  appKey: process.env.X_API_KEY,
  appSecret: process.env.X_API_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_SECRET,
});

const STATE_FILE = './ultimo_estado.json';

// Umbrales mínimos para publicar y para alerta fuerte
const UMBRAL_BLUE = 5;          // $5 ARS
const UMBRAL_BLUE_FUERTE = 15;  // $15 ARS
const UMBRAL_RIESGO = 5;        // 5 puntos básicos
const UMBRAL_RIESGO_FUERTE = 15;// 15 puntos básicos

// Pools de hashtags rotativos
const HASHTAGS_BLUE = ['#DolarBlue', '#DolarHoy', '#Dolar', '#EconomiaArgentina'];
const HASHTAGS_RIESGO = ['#RiesgoPais', '#Mercados', '#Bonos', '#EconomiaArgentina'];

function elegirHashtags(lista, cantidad = 2) {
  return [...lista]
    .sort(() => Math.random() - 0.5)
    .slice(0, cantidad)
    .join(' ');
}

async function checkAndTweet() {
  let lastState = { blueVenta: null, riesgoPais: null };
  if (fs.existsSync(STATE_FILE)) {
    lastState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  }

  // Consultar APIs en paralelo
  const [resBlue, resRiesgo] = await Promise.all([
    fetch('https://dolarapi.com/v1/dolares/blue').then(r => r.json()),
    fetch('https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo').then(r => r.json())
  ]);

  const nuevoBlue = resBlue.venta;
  const nuevoRiesgo = resRiesgo.valor;
  let huboCambios = false;

  // 1. Verificar Dólar Blue
  if (nuevoBlue) {
    const difBlue = lastState.blueVenta !== null ? nuevoBlue - lastState.blueVenta : null;

    if (difBlue === null || Math.abs(difBlue) >= UMBRAL_BLUE) {
      let encabezado = '💵 Dólar Blue hoy';
      let tendencia = '📊 Cotización actual';

      if (difBlue !== null) {
        const esFuerte = Math.abs(difBlue) >= UMBRAL_BLUE_FUERTE;
        if (esFuerte) {
          encabezado = difBlue > 0
            ? '🚨 FUERTE SUBA DEL DÓLAR BLUE HOY'
            : '📉 FUERTE BAJA DEL DÓLAR BLUE HOY';
        }
        tendencia = difBlue > 0
          ? `📈 Subió +$${difBlue} (antes $${lastState.blueVenta})`
          : `📉 Bajó $${Math.abs(difBlue)} (antes $${lastState.blueVenta})`;
      }

      const tags = elegirHashtags(HASHTAGS_BLUE, 2);
      const texto = `${encabezado}\n\nCompra: $${resBlue.compra}\nVenta: $${nuevoBlue}\n${tendencia}\n\n${tags}`;

      await client.v2.tweet(texto);
      console.log('✅ Tweet de Dólar Blue publicado:', nuevoBlue);
      lastState.blueVenta = nuevoBlue;
      huboCambios = true;
    } else {
      console.log(`ℹ️ Dólar Blue sin cambio suficiente ($${nuevoBlue}, dif: $${difBlue})`);
    }
  }

  // 2. Verificar Riesgo País
  if (nuevoRiesgo) {
    const difRiesgo = lastState.riesgoPais !== null ? nuevoRiesgo - lastState.riesgoPais : null;

    if (difRiesgo === null || Math.abs(difRiesgo) >= UMBRAL_RIESGO) {
      let encabezado = `🇦🇷 Riesgo País hoy: ${nuevoRiesgo} puntos básicos`;
      let tendencia = '📊 Índice actual';

      if (difRiesgo !== null) {
        const esFuerte = Math.abs(difRiesgo) >= UMBRAL_RIESGO_FUERTE;
        if (esFuerte) {
          encabezado = difRiesgo > 0
            ? `🚨 FUERTE SUBA DEL RIESGO PAÍS HOY: ${nuevoRiesgo} pb`
            : `🟢 FUERTE BAJA DEL RIESGO PAÍS HOY: ${nuevoRiesgo} pb`;
        }
        tendencia = difRiesgo > 0
          ? `🔴 Subió +${difRiesgo} pb (antes ${lastState.riesgoPais} pb)`
          : `🟢 Bajó ${Math.abs(difRiesgo)} pb (antes ${lastState.riesgoPais} pb)`;
      }

      const tags = elegirHashtags(HASHTAGS_RIESGO, 2);
      const texto = `${encabezado}\n${tendencia}\n\n${tags}`;

      await client.v2.tweet(texto);
      console.log('✅ Tweet de Riesgo País publicado:', nuevoRiesgo);
      lastState.riesgoPais = nuevoRiesgo;
      huboCambios = true;
    } else {
      console.log(`ℹ️ Riesgo País sin cambio suficiente (${nuevoRiesgo} pb, dif: ${difRiesgo} pb)`);
    }
  }

  if (huboCambios) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(lastState, null, 2));
    console.log('💾 Estado actualizado en ultimo_estado.json');
  }
}

checkAndTweet().catch(err => {
  console.error('❌ Error ejecutando el bot:', err);
  process.exit(1);
});