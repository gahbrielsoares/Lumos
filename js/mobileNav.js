export function initMobileNav() {
  const toggle = document.getElementById("mobile-nav-toggle");
  const backdrop = document.getElementById("mobile-nav-backdrop");
  const side = document.querySelector(".dash-side");
  if (!toggle || !side) return;

  function open() {
    side.classList.add("open");
    backdrop?.classList.add("open");
  }
  function close() {
    side.classList.remove("open");
    backdrop?.classList.remove("open");
  }

  toggle.addEventListener("click", open);
  backdrop?.addEventListener("click", close);

  // Navegação explícita: fecha o menu e SÓ DEPOIS manda pra página nova.
  // Evita um problema comum em navegadores mobile, onde clicar num link
  // ao mesmo tempo que uma animação CSS roda (o menu deslizando) cancela
  // a navegação no meio do caminho.
  side.querySelectorAll("a").forEach((a) => {
    const href = a.getAttribute("href");
    if (!href || href === "#") return; // deixa o link de Sair com seu próprio handler
    a.addEventListener("click", (e) => {
      e.preventDefault();
      alert("DIAGNÓSTICO: cliquei em " + href); // temporário, vamos remover depois
      close();
      window.location.href = href;
    });
  });
}
