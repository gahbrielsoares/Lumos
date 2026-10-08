// =====================================================================
// Janelas de aviso e confirmação no visual do Lumos
// (substituem alert/confirm do navegador, que mostram "site.com diz...")
//   await lumosAlert("Mensagem")
//   if (await lumosConfirm("Tem certeza?")) { ... }
// =====================================================================
(function () {
  function abrir(msg, comCancelar, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var back = document.createElement("div");
      back.className = "lumos-dialog-back";
      back.innerHTML =
        '<div class="lumos-dialog" role="' + (comCancelar ? "alertdialog" : "dialog") + '" aria-modal="true">' +
          '<div class="lumos-dialog-msg"></div>' +
          '<div class="lumos-dialog-actions">' +
            (comCancelar ? '<button type="button" class="lumos-dialog-btn ghost" data-v="0">' + (opts.cancelar || "Cancelar") + '</button>' : "") +
            '<button type="button" class="lumos-dialog-btn primary" data-v="1">' + (opts.ok || (comCancelar ? "Confirmar" : "Entendi")) + '</button>' +
          '</div>' +
        '</div>';
      back.querySelector(".lumos-dialog-msg").textContent = String(msg == null ? "" : msg);
      document.body.appendChild(back);
      var fechar = function (v) {
        document.removeEventListener("keydown", tecla);
        back.remove();
        resolve(v);
      };
      var tecla = function (e) {
        if (e.key === "Escape") fechar(comCancelar ? false : true);
        if (e.key === "Enter") { e.preventDefault(); fechar(true); }
      };
      back.addEventListener("click", function (e) {
        var b = e.target.closest("[data-v]");
        if (b) fechar(b.getAttribute("data-v") === "1");
        else if (e.target === back && comCancelar) fechar(false);
      });
      document.addEventListener("keydown", tecla);
      setTimeout(function () { var p = back.querySelector(".primary"); if (p) p.focus(); }, 30);
    });
  }
  window.lumosAlert = function (msg, opts) { return abrir(msg, false, opts); };
  window.lumosConfirm = function (msg, opts) { return abrir(msg, true, opts); };

  var css = document.createElement("style");
  css.textContent =
    ".lumos-dialog-back{position:fixed;inset:0;z-index:3000;background:rgba(15,15,20,.5);display:flex;align-items:center;justify-content:center;padding:18px;}" +
    ".lumos-dialog{background:var(--panel-card-solid,#fff);color:var(--panel-text,#1C2B3A);border:1px solid var(--panel-border,#E8E2D9);border-radius:18px;padding:22px 22px 16px;width:min(440px,100%);box-shadow:0 24px 60px rgba(0,0,0,.35);font-family:var(--panel-font-body,inherit);}" +
    ".lumos-dialog-msg{font-size:15px;line-height:1.55;white-space:pre-line;}" +
    ".lumos-dialog-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px;}" +
    ".lumos-dialog-btn{font:inherit;font-weight:700;font-size:14px;border-radius:12px;padding:10px 18px;cursor:pointer;border:1px solid transparent;}" +
    ".lumos-dialog-btn.primary{background:var(--panel-accent,#C9A84C);color:#1C2B3A;}" +
    ".lumos-dialog-btn.ghost{background:transparent;border-color:var(--panel-border,#E8E2D9);color:var(--panel-text,#1C2B3A);}" +
    ":root.dark .lumos-dialog{background:#1A1920;color:#EDEAE4;border-color:rgba(255,255,255,.12);}" +
    ":root.dark .lumos-dialog-btn.ghost{color:#EDEAE4;border-color:rgba(255,255,255,.2);}";
  document.head.appendChild(css);
})();
