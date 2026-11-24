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

// Umbrales mínimos para publicar
const UMBRAL_BLUE = 5;   // $5 ARS
const UMBRAL_RIESGO = 5; // 5 puntos básicos

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

  // 1. Verificar Dólar Blue (primera vez o variación >= $5)
  if (nuevoBlue) {
    const difBlue = lastState.blueVenta !== null ? nuevoBlue - lastState.blueVenta : null;

    if (difBlue === null || Math.abs(difBlue) >= UMBRAL_BLUE) {
      let tendencia = '📊 Cotización actual';
      if (difBlue !== null) {
        const signo = difBlue > 0 ? '+' : '';
        tendencia = difBlue > 0
          ? `📈 Subió ${signo}$${difBlue} (antes $${lastState.blueVenta})`
          : `📉 Bajó $${Math.abs(difBlue)} (antes $${lastState.blueVenta})`;
      }

      const texto = `💵 Dólar Blue\n\nCompra: $${resBlue.compra}\nVenta: $${nuevoBlue}\n${tendencia}\n\n#DolarBlue #Argentina`;

      await client.v2.tweet(texto);
      console.log('✅ Tweet de Dólar Blue publicado:', nuevoBlue);
      lastState.blueVenta = nuevoBlue;
      huboCambios = true;
    } else {
      console.log(`ℹ️ Dólar Blue sin cambio suficiente ($${nuevoBlue}, dif: $${difBlue})`);
    }
  }

  // 2. Verificar Riesgo País (primera vez o variación >= 5 pb)
  if (nuevoRiesgo) {
    const difRiesgo = lastState.riesgoPais !== null ? nuevoRiesgo - lastState.riesgoPais : null;

    if (difRiesgo === null || Math.abs(difRiesgo) >= UMBRAL_RIESGO) {
      let tendencia = '📊 Índice actual';
      if (difRiesgo !== null) {
        const signo = difRiesgo > 0 ? '+' : '';
        tendencia = difRiesgo > 0
          ? `🔴 Subió ${signo}${difRiesgo} pb (antes ${lastState.riesgoPais} pb)`
          : `🟢 Bajó ${Math.abs(difRiesgo)} pb (antes ${lastState.riesgoPais} pb)`;
      }

      const texto = `🇦🇷 Riesgo País: ${nuevoRiesgo} puntos básicos\n${tendencia}\n\n#RiesgoPais #Economia`;

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