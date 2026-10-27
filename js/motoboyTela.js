// =====================================================================
// Tela do entregador: usada pelo link de rastreio (entregador.html, sem login)
// e pela aba Minhas entregas (motoboy.html, entregador com login no Lumos)
// =====================================================================
import { supabase } from "./supabaseClient.js?v=96";

export const MARCACAO = `    <div class="mb-topo"><img src="img/logo.png" alt="" /><div><b id="mb-ola">Entregas</b><div style="font-size:12.5px; opacity:.7;" id="mb-validade"></div></div></div>
    <div class="mb-card" id="mb-gps-card">
      <div class="mb-gps" id="mb-gps"><i></i><span>Localização desligada</span></div>
      <p>Para o restaurante e o cliente acompanharem a entrega, permita a localização e deixe esta tela aberta durante as entregas.</p>
      <button class="mb-btn mb-ok" id="mb-ativar">Ativar localização</button>
    </div>
    <div id="mb-lista"><p class="mb-vazio">Carregando...</p></div>`;

export function iniciarMotoboy({ token = "" } = {}) {
    const t = token;
    const $ = (id) => document.getElementById(id);
    const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    async function chamar(body) {
      const { data, error } = await supabase.functions.invoke("entregas", { body: t ? { ...body, t } : body });
      if (error || data?.error) { let m = data?.error || "Sem conexão. Tente de novo."; try { m = (await error.context.json()).error || m; } catch (_) { /* sem detalhe */ } throw new Error(m); }
      return data;
    }
    // ---------- Localização ----------
    let ultimoEnvio = 0, travaTela = null, vigia = null;
    function ligarGps() {
      if (!navigator.geolocation) { $("mb-gps").querySelector("span").textContent = "Este celular não tem localização"; return; }
      if (vigia !== null) return;
      vigia = navigator.geolocation.watchPosition(async (p) => {
        $("mb-gps").className = "mb-gps on"; $("mb-gps").querySelector("span").textContent = "Localização ligada"; $("mb-ativar").style.display = "none";
        if (Date.now() - ultimoEnvio < 15000) return;
        ultimoEnvio = Date.now();
        try { await chamar({ action: "motoboy_posicao", lat: p.coords.latitude, lng: p.coords.longitude, precisao: p.coords.accuracy }); } catch (_) { /* tenta de novo na próxima */ }
      }, () => { $("mb-gps").className = "mb-gps"; $("mb-gps").querySelector("span").textContent = "Localização bloqueada: libere nas configurações do navegador"; vigia = null; },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 });
      // Pede ao celular para não apagar a tela (o rastreio para quando a tela apaga)
      try { navigator.wakeLock?.request("screen").then((w) => (travaTela = w)).catch(() => {}); } catch (_) { /* sem suporte */ }
    }
    $("mb-ativar").addEventListener("click", ligarGps);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && vigia !== null && !travaTela) try { navigator.wakeLock?.request("screen").then((w) => (travaTela = w)); } catch (_) { /* sem suporte */ } });

    // ---------- Entregas ----------
    async function carregar() {
      let d;
      try { d = await chamar({ action: "motoboy_estado" }); }
      catch (e) { $("mb-lista").innerHTML = `<div class="mb-card"><h3>${t ? "Link expirado" : "Acesso de entregador não configurado"}</h3><p>${esc(e.message)}</p></div>`; $("mb-gps-card").style.display = "none"; return; }
      $("mb-ola").textContent = `Olá, ${d.entregador.nome.split(" ")[0]}!`;
      $("mb-validade").textContent = d.expira_em ? `Rastreio ativo até ${new Date(d.expira_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "";
      // Logado sem o link do dia: a localização só é guardada depois que ele abre o link de rastreio
      if (!d.rastreio_ativo) $("mb-gps-card").innerHTML = `<div class="mb-gps"><i></i><span>Rastreio desligado</span></div><p>Peça ao estabelecimento o link de rastreio de hoje. Ele chega no seu WhatsApp e vale 8 horas. Abra, permita a localização e volte para esta tela.</p>`;
      if (d.autorizado && vigia === null) ligarGps();
      $("mb-lista").innerHTML = d.entregas.map((e) => `<div class="mb-card" data-id="${e.id}">
          <span class="mb-tag">${e.etapa === "oferecida" ? "Nova entrega" : e.etapa === "chegou" ? "No local" : "A caminho"}</span>
          <h3 style="margin-top:8px;">Pedido #${e.numero} · ${esc(e.cliente)}</h3>
          <p>📍 ${esc(e.endereco || "Endereço não informado")}${e.referencia ? `<br><small>Referência: ${esc(e.referencia)}</small>` : ""}</p>
          <p style="opacity:.8;">${e.itens.map(esc).join(" · ")}</p>
          ${e.cobrar ? `<div class="mb-cobrar">💵 Cobrar na entrega: ${brl(e.cobrar)}${e.troco ? `<br><small>Troco para ${esc(e.troco)}</small>` : ""}${e.forma ? `<br><small>${esc(e.forma)}</small>` : ""}</div>` : `<p>✅ Pedido já pago</p>`}
          ${e.etapa === "oferecida" ? `<div class="mb-dois"><button class="mb-btn mb-nao" data-a="recusar">Recusar</button><button class="mb-btn mb-ok" data-a="aceitar">Aceitar entrega</button></div>` : `
            <a class="mb-btn mb-sec" href="${esc(e.mapa)}" target="_blank" rel="noopener">🗺️ Abrir o caminho no mapa</a>
            ${e.telefone ? `<a class="mb-btn mb-sec" href="tel:+${String(e.telefone).replace(/\D/g, "")}">📞 Ligar para o cliente</a>` : ""}
            ${e.etapa === "em_rota" ? `<button class="mb-btn mb-ok" data-a="cheguei">Cheguei</button>` : `
              ${e.cobrar ? `<select class="mb-sel" id="f-${e.id}"><option value="dinheiro">Recebi em dinheiro</option><option value="pix">Recebi no Pix</option><option value="cartao">Recebi no cartão de crédito</option><option value="debito">Recebi no cartão de débito</option></select>` : ""}
              <button class="mb-btn mb-ok" data-a="entregue">${e.cobrar ? `Entreguei e recebi ${brl(e.cobrar)}` : "Entreguei"}</button>`}`}
        </div>`).join("") || `<div class="mb-card mb-vazio">Nenhuma entrega agora. Quando o restaurante enviar um pedido, ele aparece aqui.</div>`;
    }
    $("mb-lista").addEventListener("click", async (ev) => {
      const b = ev.target.closest("[data-a]"); if (!b) return;
      const card = b.closest("[data-id]"), id = card.dataset.id, a = b.dataset.a;
      if (a === "recusar" && !confirm("Recusar esta entrega? Ela volta para o restaurante escolher outro entregador.")) return;
      b.disabled = true;
      try {
        await chamar({ action: `motoboy_${a === "aceitar" ? "aceitar" : a === "recusar" ? "recusar" : a === "cheguei" ? "cheguei" : "entregue"}`, entrega_id: id,
          ...(a === "entregue" ? { recebido: true, forma: document.getElementById(`f-${id}`)?.value || "dinheiro" } : {}) });
        if (a === "aceitar") ligarGps();
        await carregar();
        if (a === "aceitar") { const mapa = document.querySelector(`[data-id="${id}"] a[href*="google.com/maps"]`); if (mapa) window.open(mapa.href, "_blank"); }
      } catch (e) { alert(e.message); b.disabled = false; }
    });
    carregar();
    setInterval(carregar, 15000);
}
