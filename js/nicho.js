// =====================================================================
// Separação dos produtos por nicho
// Cada produto pode ter um "segmento" (restaurante, materiais_construcao...).
// Na tela de um nicho só aparecem os produtos dele e os sem segmento (os da própria loja).
// Nada é apagado: ao trocar o nicho em Configurações, os produtos do outro nicho voltam a aparecer.
// =====================================================================
import { getBusinessConfig } from "./businessConfig.js?v=91";

let cache = null;
// O nicho da conta (o menu já grava em body.dataset.nicho; para funcionários, busca a configuração da loja)
export async function nichoAtual() {
  if (document.body.dataset.nicho) return document.body.dataset.nicho;
  if (cache !== null) return cache;
  try { cache = (await getBusinessConfig())?.business_type || ""; } catch (_) { cache = ""; }
  if (cache) document.body.dataset.nicho = cache;
  return cache;
}
export const nichoSync = () => document.body.dataset.nicho || cache || "";
// Produto de outro nicho (ex.: argamassa na conta de restaurante)
export const doOutroNicho = (p, nicho = nichoSync()) => !!p?.segmento && !!nicho && p.segmento !== nicho;
// Campos para gravar num produto novo, para ele já nascer no nicho certo
export const segmentoNovo = (nicho = nichoSync()) => (nicho ? { segmento: nicho } : {});
