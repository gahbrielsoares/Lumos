// Testa cada formato de logo, na ordem, e usa o primeiro que existir de verdade.
// Assim, subir logo.webp ou logo.jpg no lugar de logo.png funciona sem editar HTML.
document.addEventListener("DOMContentLoaded", () => {
  // Um carimbo por carregamento de página, pra nunca servir uma versão antiga em cache.
  const cacheBust = `?t=${Date.now()}`;
  const candidates = ["img/logo.webp", "img/logo.png", "img/logo.jpg", "img/logo.jpeg"];

  function findLogo(i = 0) {
    if (i >= candidates.length) return;
    const test = new Image();
    test.onload = () => applyLogo(candidates[i] + cacheBust);
    test.onerror = () => findLogo(i + 1);
    test.src = candidates[i] + cacheBust;
  }

  function applyLogo(src) {
    document.querySelectorAll("img.logo-mark").forEach((img) => {
      img.src = src;
    });
    const favicon = document.querySelector("link[rel='icon']");
    if (favicon) favicon.href = src;
  }

  findLogo();
});
