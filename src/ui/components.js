/** components.js — Reusable high-end UI components for Dream Kick (vanilla JS + CSS properties). */

/** SpotlightCard: background radial glow following the cursor */
export function initSpotlight(el) {
  if (!el) return;
  el.classList.add('spotlight-card');
  el.addEventListener('mousemove', e => {
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    el.style.setProperty('--mx', `${x}px`);
    el.style.setProperty('--my', `${y}px`);
  });
}

/** TiltCard: 3D tilt following cursor */
export function initTilt(el, maxRotate = 10) {
  if (!el) return;
  el.classList.add('tilt-card');
  el.addEventListener('mousemove', e => {
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const xc = rect.width / 2;
    const yc = rect.height / 2;
    const rotateY = ((x - xc) / xc) * maxRotate; 
    const rotateX = -((y - yc) / yc) * maxRotate; 
    el.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-3px)`;
  });
  el.addEventListener('mouseleave', () => {
    el.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) translateY(0px)';
  });
}

/** MagneticButton: attracted to pointer */
export function initMagnetic(el, strength = 0.3) {
  if (!el) return;
  el.classList.add('magnetic-btn');
  el.addEventListener('mousemove', e => {
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const xc = rect.width / 2;
    const yc = rect.height / 2;
    const dx = (x - xc) * strength;
    const dy = (y - yc) * strength;
    el.style.transform = `translate(${dx}px, ${dy}px) scale(1.02)`;
  });
  el.addEventListener('mouseleave', () => {
    el.style.transform = 'translate(0px, 0px) scale(1)';
  });
  el.addEventListener('mousedown', () => {
    el.style.transform += ' scale(0.95)';
  });
  el.addEventListener('mouseup', () => {
    el.style.transform = 'translate(0px, 0px) scale(1)';
  });
}

/** GlowOrb: fixed ambient background orbs */
export function createGlowOrbs(container = document.body) {
  container.querySelectorAll('.glow-orb').forEach(orb => orb.remove());
  
  const orbs = [
    { top: '5%', left: '8%', size: '360px', color: 'rgba(0, 212, 163, 0.15)' },
    { bottom: '8%', right: '5%', size: '440px', color: 'rgba(61, 107, 255, 0.12)' }
  ];
  
  orbs.forEach(conf => {
    const orb = document.createElement('div');
    orb.className = 'glow-orb';
    orb.style.position = 'fixed';
    if (conf.top) orb.style.top = conf.top;
    if (conf.bottom) orb.style.bottom = conf.bottom;
    if (conf.left) orb.style.left = conf.left;
    if (conf.right) orb.style.right = conf.right;
    orb.style.width = conf.size;
    orb.style.height = conf.size;
    orb.style.borderRadius = '50%';
    orb.style.background = conf.color;
    orb.style.filter = 'blur(180px)';
    orb.style.pointerEvents = 'none';
    orb.style.zIndex = '-1';
    container.appendChild(orb);
  });
}

/** TubelightNav: tab bar with active indicator */
export function initTubelightNav(navContainer, onSelect) {
  if (!navContainer) return;
  const items = navContainer.querySelectorAll('.nav-item');
  let activePill = navContainer.querySelector('.nav-pill');
  if (!activePill) {
    activePill = document.createElement('div');
    activePill.className = 'nav-pill';
    navContainer.appendChild(activePill);
  }
  
  function updatePill(el) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const parentRect = navContainer.getBoundingClientRect();
    activePill.style.width = `${rect.width}px`;
    activePill.style.height = `${rect.height}px`;
    activePill.style.left = `${rect.left - parentRect.left}px`;
    activePill.style.top = `${rect.top - parentRect.top}px`;
  }
  
  items.forEach(item => {
    item.addEventListener('click', () => {
      items.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      updatePill(item);
      if (onSelect) onSelect(item.dataset.value || item.textContent.trim());
    });
  });
  
  const activeItem = navContainer.querySelector('.nav-item.active') || items[0];
  if (activeItem) {
    activeItem.classList.add('active');
    setTimeout(() => updatePill(activeItem), 50);
  }
  
  window.addEventListener('resize', () => {
    const currActive = navContainer.querySelector('.nav-item.active');
    if (currActive) updatePill(currActive);
  });
}

/** TextScramble: scramble random characters into the final heading text */
const GLYPHS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ0123456789#@$%&*+-=?';
export function scramble(el, text, duration = 800) {
  if (!el) return;
  let frame = 0;
  const totalFrames = Math.floor(duration / 16);
  const len = text.length;
  
  const interval = setInterval(() => {
    let current = '';
    const progress = frame / totalFrames;
    
    for (let i = 0; i < len; i++) {
      if (text[i] === ' ' || text[i] === '<' || text[i] === '>' || text[i] === '/' || text[i] === 'b') {
        current += text[i];
        continue;
      }
      if (i < progress * len) {
        current += text[i];
      } else {
        current += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }
    }
    
    el.innerHTML = current;
    frame++;
    
    if (frame >= totalFrames) {
      clearInterval(interval);
      el.innerHTML = text;
    }
  }, 16);
}

/** ScrollProgressBar: fixed top gradient scroll indicator */
export function initScrollProgressBar() {
  let bar = document.getElementById('scroll-progress');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'scroll-progress';
    bar.style.position = 'fixed';
    bar.style.top = '0';
    bar.style.left = '0';
    bar.style.height = '3px';
    bar.style.width = '0%';
    bar.style.background = 'linear-gradient(90deg, var(--accent), var(--accent2))';
    bar.style.zIndex = '9999';
    bar.style.pointerEvents = 'none';
    document.body.appendChild(bar);
  }
  
  const updateBar = () => {
    const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
    const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const scrolled = height > 0 ? (winScroll / height) * 100 : 0;
    bar.style.width = `${scrolled}%`;
  };
  
  window.addEventListener('scroll', updateBar);
  updateBar();
}

/** AnimatedCounter: counts numbers up from 0 when in viewport */
export function initCounters() {
  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  
  document.querySelectorAll('[data-counter]').forEach(el => {
    observer.observe(el);
  });
}

export function animateCounter(el) {
  const target = parseInt(el.dataset.counter) || 0;
  let start = 0;
  const duration = 1000;
  const startTime = performance.now();
  
  function update(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = progress * (2 - progress); // easeOutQuad
    const val = Math.floor(ease * target);
    el.textContent = val;
    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      el.textContent = target;
    }
  }
  requestAnimationFrame(update);
}

/** ProgressRing: Draw an SVG circular progress ring */
export function createProgressRing(svgEl, percent, size = 80, stroke = 8) {
  const radius = (size / 2) - stroke;
  const circumference = radius * 2 * Math.PI;
  
  svgEl.setAttribute('width', size);
  svgEl.setAttribute('height', size);
  svgEl.innerHTML = `
    <defs>
      <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="var(--accent)"/>
        <stop offset="100%" stop-color="var(--accent2)"/>
      </linearGradient>
    </defs>
    <circle class="ring-bg" stroke="rgba(255,255,255,0.06)" fill="transparent" stroke-width="${stroke}" r="${radius}" cx="${size/2}" cy="${size/2}"/>
    <circle class="ring-fg" stroke="url(#ringGrad)" fill="transparent" stroke-width="${stroke}" stroke-dasharray="${circumference} ${circumference}" stroke-dashoffset="${circumference}" stroke-linecap="round" r="${radius}" cx="${size/2}" cy="${size/2}"/>
  `;
  
  const fg = svgEl.querySelector('.ring-fg');
  fg.style.transition = 'stroke-dashoffset 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
  
  setTimeout(() => {
    const offset = circumference - (percent / 100) * circumference;
    fg.style.strokeDashoffset = `${offset}`;
  }, 50);
}

/** Toast system: slide-in stacked toast notifications */
class ToastSystem {
  constructor() {
    this.container = null;
    this.toasts = [];
  }
  
  init() {
    if (!this.container) {
      this.container = document.getElementById('toast-container');
      if (!this.container) {
        this.container = document.createElement('div');
        this.container.id = 'toast-container';
        document.body.appendChild(this.container);
      }
    }
  }
  
  show(message, type = 'info') {
    this.init();
    if (this.toasts.length >= 3) {
      const old = this.toasts.shift();
      if (old) {
        old.classList.remove('in');
        setTimeout(() => old.remove(), 300);
      }
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5" stroke-linecap="round"/></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6" stroke-linecap="round"/></svg>`;
    } else {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01" stroke-linecap="round"/></svg>`;
    }
    
    toast.innerHTML = `
      <div class="toast-icon">${iconSvg}</div>
      <div class="toast-body">${message}</div>
      <div class="toast-progress"></div>
    `;
    
    this.container.appendChild(toast);
    this.toasts.push(toast);
    
    setTimeout(() => toast.classList.add('in'), 10);
    
    const progress = toast.querySelector('.toast-progress');
    setTimeout(() => {
      progress.style.width = '0%';
    }, 50);
    
    setTimeout(() => {
      toast.classList.remove('in');
      setTimeout(() => {
        toast.remove();
        this.toasts = this.toasts.filter(t => t !== toast);
      }, 300);
    }, 3500);
  }
}
export const Toast = new ToastSystem();

/** EmptyState: renders an premium empty area card */
export function renderEmptyState(container, title, message, ctaText, ctaCallback) {
  if (!container) return;
  container.innerHTML = `
    <div class="empty-state">
      <svg class="empty-illustration" width="120" height="120" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" stroke="var(--accent)" stroke-width="2" stroke-dasharray="6,6" fill="none" opacity="0.3"/>
        <circle cx="50" cy="50" r="28" stroke="var(--accent)" stroke-width="3" fill="none"/>
        <path d="M40 45l8 8 16-16" stroke="var(--accent)" stroke-width="4" fill="none" stroke-linecap="round"/>
      </svg>
      <h3>${title}</h3>
      <p>${message}</p>
      <button class="btn primary magnetic-btn">${ctaText}</button>
    </div>
  `;
  const btn = container.querySelector('button');
  initMagnetic(btn);
  if (ctaCallback) btn.onclick = ctaCallback;
}

/** Modal/Drawer: backdrop blurred overlay */
export function showModal(title, htmlContent, onConfirm) {
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <div class="modal-panel">
      <div class="modal-header">
        <h2>${title}</h2>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-content">${htmlContent}</div>
      <div class="modal-actions">
        <button class="btn modal-cancel">CANCEL</button>
        <button class="btn primary modal-ok">CONFIRM</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  setTimeout(() => modal.classList.add('in'), 10);
  
  const closeBtn = modal.querySelector('.modal-close');
  const cancelBtn = modal.querySelector('.modal-cancel');
  const okBtn = modal.querySelector('.modal-ok');
  
  const focusable = modal.querySelectorAll('button, input, select, textarea');
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (first) first.focus();
  
  function handleKey(e) {
    if (e.key === 'Escape') dismiss();
    if (e.key === 'Tab') {
      if (e.shiftKey && document.activeElement === first) {
        last.focus(); e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first.focus(); e.preventDefault();
      }
    }
  }
  window.addEventListener('keydown', handleKey);
  
  function dismiss() {
    modal.classList.remove('in');
    window.removeEventListener('keydown', handleKey);
    setTimeout(() => modal.remove(), 250);
  }
  
  closeBtn.onclick = dismiss;
  cancelBtn.onclick = dismiss;
  modal.onclick = (e) => { if (e.target === modal) dismiss(); };
  okBtn.onclick = () => {
    if (onConfirm) onConfirm();
    dismiss();
  };
  
  initMagnetic(okBtn);
  initMagnetic(cancelBtn);
}
