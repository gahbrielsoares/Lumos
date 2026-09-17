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
  side.querySelectorAll("a").forEach((a) => a.addEventListener("click", close));
}
