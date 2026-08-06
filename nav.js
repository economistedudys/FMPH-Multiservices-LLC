// Shared across all pages: footer year, mobile nav toggle, scroll reveal
document.addEventListener('DOMContentLoaded', () => {
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const navToggle = document.getElementById('navToggle');
  const mobileNav = document.getElementById('mobileNav');
  if (navToggle && mobileNav) {
    navToggle.addEventListener('click', () => {
      const isOpen = mobileNav.style.display === 'flex';
      mobileNav.style.display = isOpen ? 'none' : 'flex';
      navToggle.setAttribute('aria-expanded', String(!isOpen));
    });
    mobileNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => { mobileNav.style.display = 'none'; }));
  }

  const revealEls = document.querySelectorAll('.reveal');
  if (revealEls.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    revealEls.forEach(el => io.observe(el));
  }
});
