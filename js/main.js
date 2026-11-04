/* ==========================================================================
   туманчик — інтерактив сторінки. Без залежностей і збирання.
   ========================================================================== */
(() => {
  'use strict';

  window.__tumanchyk = true;

  const doc = document.documentElement;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduceMotion = () => reduceQuery.matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* приватний режим */ } },
  };

  /* Один rAF-обробник прокрутки на всю сторінку */
  const scrollHandlers = [];
  const onScroll = (fn) => scrollHandlers.push(fn);
  let scrollScheduled = false;
  const runScroll = () => { scrollScheduled = false; scrollHandlers.forEach((fn) => fn()); };
  window.addEventListener('scroll', () => {
    if (scrollScheduled) return;
    scrollScheduled = true;
    requestAnimationFrame(runScroll);
  }, { passive: true });
  window.addEventListener('resize', runScroll);

  /* ---------- Старт анімацій першого екрана ---------- */
  let readyStarted = false;
  function startHero() {
    if (readyStarted) return;
    readyStarted = true;
    const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    const timeout = new Promise((resolve) => setTimeout(resolve, 1200));
    Promise.race([fontsReady, timeout]).then(() => {
      requestAnimationFrame(() => doc.classList.add('is-ready'));
    });
  }

  /* ---------- Логотип-напис: розбиваємо на літери ---------- */
  function splitWordmark() {
    const el = $('[data-wordmark]');
    if (!el) return;
    const text = el.textContent.trim();
    el.textContent = '';
    Array.from(text).forEach((char, i) => {
      const span = document.createElement('span');
      span.className = 'ch';
      span.textContent = char;
      span.style.setProperty('--i', i);
      el.appendChild(span);
    });
    el.classList.add('is-split');

    if (reduceMotion()) return;
    const hero = el.closest('.hero');
    onScroll(() => {
      const y = window.scrollY;
      if (!hero || y > hero.offsetHeight) return;
      el.style.transform = `translate3d(0, ${(y * 0.18).toFixed(1)}px, 0)`;
    });
  }

  /* ---------- Перевірка віку ---------- */
  function initAgeGate() {
    const gate = $('#age-gate');
    if (!gate || doc.classList.contains('age-ok') || doc.classList.contains('js-failed')) {
      startHero();
      return;
    }

    const yes = $('[data-age="yes"]', gate);
    const no = $('[data-age="no"]', gate);
    const deny = $('[data-age-deny]', gate);
    const page = [$('#header'), $('#main'), $('.footer'), $('.dock')].filter(Boolean);

    page.forEach((el) => el.setAttribute('inert', ''));
    setTimeout(() => yes.focus({ preventScroll: true }), 350);

    yes.addEventListener('click', () => {
      store.set('tumanchyk-age', 'ok');
      page.forEach((el) => el.removeAttribute('inert'));
      gate.classList.add('is-leaving');
      startHero();
      setTimeout(() => doc.classList.add('age-ok'), reduceMotion() ? 0 : 900);
    });

    no.addEventListener('click', () => {
      deny.hidden = false;
      no.disabled = true;
      yes.focus();
    });

    // тримаємо фокус усередині діалогу
    gate.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const focusable = $$('button:not([disabled])', gate);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  /* ---------- Шапка: фон, приховування, прогрес ---------- */
  function initHeader() {
    const header = $('#header');
    if (!header) return;
    let lastY = window.scrollY;

    onScroll(() => {
      const y = Math.max(0, window.scrollY);
      header.classList.toggle('is-scrolled', y > 16);

      const delta = y - lastY;
      if (Math.abs(delta) > 6) {
        const hide = delta > 0 && y > 520 && !doc.classList.contains('menu-open');
        header.classList.toggle('is-hidden', hide);
        lastY = y;
      }

      const max = doc.scrollHeight - window.innerHeight;
      header.style.setProperty('--progress', max > 0 ? (y / max).toFixed(4) : '0');
    });
    runScroll();

    // будь-який фокус у шапці повертає її на екран
    header.addEventListener('focusin', () => header.classList.remove('is-hidden'));
  }

  /* ---------- Мобільне меню ---------- */
  function initMenu() {
    const burger = $('.burger');
    const menu = $('#menu');
    if (!burger || !menu) return;

    $$('.menu__list li', menu).forEach((li, i) => li.style.setProperty('--i', i));

    const setOpen = (open) => {
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Закрити меню' : 'Відкрити меню');
      menu.classList.toggle('is-open', open);
      menu.setAttribute('aria-hidden', String(!open));
      if (open) menu.removeAttribute('inert'); else menu.setAttribute('inert', '');
      doc.classList.toggle('menu-open', open);
      document.body.classList.toggle('is-locked', open);
    };

    burger.addEventListener('click', () => setOpen(burger.getAttribute('aria-expanded') !== 'true'));
    $$('a', menu).forEach((a) => a.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menu.classList.contains('is-open')) {
        setOpen(false);
        burger.focus();
      }
    });
    window.matchMedia('(min-width: 1100px)').addEventListener('change', (e) => { if (e.matches) setOpen(false); });
  }

  /* ---------- Активний пункт навігації ---------- */
  function initActiveNav() {
    const links = $$('.nav__link');
    if (!links.length || !('IntersectionObserver' in window)) return;
    const byId = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((l) => l.classList.remove('is-active'));
        const link = byId.get(entry.target.id);
        if (link) link.classList.add('is-active');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });

    $$('main section[id]').forEach((s) => io.observe(s));
  }

  /* ---------- Поява елементів під час прокрутки ---------- */
  function initReveal() {
    const items = $$('[data-reveal]');
    if (!('IntersectionObserver' in window) || reduceMotion()) {
      items.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    // у горизонтальних стрічках показуємо всі картки разом, а не по одній під час гортання
    const groupOf = (el) => el.closest('.reviews__track, .gallery__track');

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const group = groupOf(entry.target);
        const targets = group ? $$('[data-reveal]', group) : [entry.target];
        targets.forEach((el) => {
          el.classList.add('is-visible');
          io.unobserve(el);
        });
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });

    items.forEach((el) => io.observe(el));
  }

  /* ---------- Паралакс зображень усередині рамок ---------- */
  function initParallax() {
    if (reduceMotion()) return;
    const items = $$('[data-parallax]');
    if (!items.length) return;

    onScroll(() => {
      const vh = window.innerHeight;
      items.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.bottom < -100 || rect.top > vh + 100) return;
        const factor = parseFloat(el.dataset.parallax) || 0;
        const offset = rect.top + rect.height / 2 - vh / 2;
        const limit = rect.height * 0.055;
        const y = Math.max(-limit, Math.min(limit, -offset * factor));
        el.style.setProperty('--py', `${y.toFixed(1)}px`);
      });
    });
    runScroll();
  }

  /* ---------- Туман на першому екрані (canvas) ---------- */
  function initFog() {
    const canvas = $('.hero__fog');
    const ctx = canvas && canvas.getContext('2d');
    if (!ctx) return;

    const hero = canvas.parentElement;
    const SCALE = 0.5; // туман розмитий, тож рендеримо в половинній роздільності
    const palette = [[196, 181, 255], [168, 213, 200], [236, 230, 220]];
    const sprites = palette.map(([r, g, b]) => {
      const s = document.createElement('canvas');
      s.width = s.height = 256;
      const c = s.getContext('2d');
      const grad = c.createRadialGradient(128, 128, 0, 128, 128, 128);
      grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
      grad.addColorStop(0.35, `rgba(${r},${g},${b},0.55)`);
      grad.addColorStop(0.7, `rgba(${r},${g},${b},0.14)`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      c.fillStyle = grad;
      c.fillRect(0, 0, 256, 256);
      return s;
    });

    const rand = (a, b) => a + Math.random() * (b - a);
    const makePuff = (i) => ({
      x: Math.random() * 1.4 - 0.2,
      y: rand(0.1, 1.05),
      r: rand(0.22, 0.5),
      sprite: sprites[i % 5 === 0 ? 2 : i % 2],
      alpha: rand(0.08, 0.19),
      vx: rand(0.004, 0.014) * (Math.random() < 0.5 ? -1 : 1),
      phase: Math.random() * Math.PI * 2,
      speed: rand(0.6, 1.4),
      ox: 0,
      oy: 0,
    });

    let w = 0;
    let h = 0;
    let puffs = [];
    let raf = 0;
    let last = 0;
    let inView = true;
    const t0 = performance.now();
    const pointer = { x: 0, y: 0, tx: 0, ty: 0, active: false };

    const resize = () => {
      const cw = hero.clientWidth;
      const ch = hero.clientHeight;
      w = canvas.width = Math.max(1, Math.round(cw * SCALE));
      h = canvas.height = Math.max(1, Math.round(ch * SCALE));
      const count = cw < 700 ? 11 : 18;
      while (puffs.length < count) puffs.push(makePuff(puffs.length));
      puffs = puffs.slice(0, count);
    };

    const draw = (now, animate) => {
      const dt = animate ? Math.min(64, now - (last || now)) : 0;
      last = now;
      const t = (now - t0) / 1000;
      const m = Math.max(w, h);

      pointer.x += (pointer.tx - pointer.x) * 0.08;
      pointer.y += (pointer.ty - pointer.y) * 0.08;

      ctx.clearRect(0, 0, w, h);
      for (const p of puffs) {
        p.x += (p.vx * dt) / 1000;
        if (p.x < -0.5) p.x = 1.5;
        else if (p.x > 1.5) p.x = -0.5;

        const size = p.r * m * 2;
        const px = p.x * w + Math.sin(t * 0.25 * p.speed + p.phase) * m * 0.03;
        const py = p.y * h + Math.cos(t * 0.2 * p.speed + p.phase) * m * 0.025;

        if (pointer.active) {
          const dx = px + p.ox - pointer.x;
          const dy = py + p.oy - pointer.y;
          const dist = Math.hypot(dx, dy) || 1;
          const radius = m * 0.28;
          if (dist < radius) {
            const force = (1 - dist / radius) * m * 0.004;
            p.ox += (dx / dist) * force;
            p.oy += (dy / dist) * force;
          }
        }
        p.ox *= 0.965;
        p.oy *= 0.965;

        ctx.globalAlpha = p.alpha * (0.8 + 0.2 * Math.sin(t * 0.5 * p.speed + p.phase));
        ctx.drawImage(p.sprite, px + p.ox - size / 2, py + p.oy - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
    };

    const loop = (now) => {
      draw(now, true);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (raf || !inView || document.hidden || reduceMotion()) return;
      last = 0;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    resize();
    draw(performance.now(), false);

    if ('ResizeObserver' in window) {
      new ResizeObserver(() => { resize(); if (!raf) draw(performance.now(), false); }).observe(hero);
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        inView = entry.isIntersecting;
        if (inView) start(); else stop();
      }).observe(hero);
    }
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

    if (finePointer) {
      hero.addEventListener('pointermove', (e) => {
        const rect = hero.getBoundingClientRect();
        pointer.tx = (e.clientX - rect.left) * SCALE;
        pointer.ty = (e.clientY - rect.top) * SCALE;
        if (!pointer.active) {
          pointer.x = pointer.tx;
          pointer.y = pointer.ty;
          pointer.active = true;
        }
      });
      hero.addEventListener('pointerleave', () => { pointer.active = false; });
    }

    start();
  }

  /* ---------- Статус «відчинено / зачинено» за київським часом ---------- */
  function initStatus() {
    const items = $$('[data-status]');
    if (!items.length || !window.Intl) return;

    const OPEN = 10 * 60;
    const CLOSE = 21 * 60;
    let fmt;
    try {
      fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    } catch (e) {
      return;
    }

    const update = () => {
      const parts = fmt.formatToParts(new Date());
      const hour = Number(parts.find((p) => p.type === 'hour').value) % 24;
      const minute = Number(parts.find((p) => p.type === 'minute').value);
      const now = hour * 60 + minute;

      let classes;
      let text;
      if (now >= OPEN && now < CLOSE) {
        if (CLOSE - now <= 60) {
          classes = ['is-open', 'is-soon'];
          text = 'Зачиняємося о 21:00';
        } else {
          classes = ['is-open'];
          text = 'Відчинено до 21:00';
        }
      } else {
        classes = ['is-closed'];
        text = 'Зачинено, відчинимося о 10:00';
      }

      items.forEach((el) => {
        el.classList.remove('is-open', 'is-soon', 'is-closed');
        el.classList.add(...classes);
        const label = $('.status__text', el);
        if (label) label.textContent = text;
      });
    };

    update();
    setInterval(update, 60 * 1000);
  }

  /* ---------- Фільтр каталогу ---------- */
  function initFilter() {
    const chips = $$('[data-filter]');
    const cards = $$('.product');
    if (!chips.length) return;

    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        if (chip.classList.contains('is-active')) return;
        const filter = chip.dataset.filter;

        chips.forEach((c) => {
          const active = c === chip;
          c.classList.toggle('is-active', active);
          c.setAttribute('aria-pressed', String(active));
        });

        let k = 0;
        cards.forEach((card) => {
          const show = filter === 'all' || card.dataset.cat === filter;
          card.hidden = !show;
          card.classList.remove('is-filtered-in');
          if (show) {
            card.classList.add('is-visible');
            void card.offsetWidth; // перезапуск анімації
            card.style.setProperty('--fd', `${k++ * 70}ms`);
            if (!reduceMotion()) card.classList.add('is-filtered-in');
          }
        });
      });
    });
  }

  /* ---------- Лічильники ---------- */
  function initCounters() {
    const items = $$('[data-count]');
    if (!items.length) return;

    const render = (el, value) => {
      const decimals = Number(el.dataset.decimals || 0);
      el.textContent = value.toLocaleString('uk-UA', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + (el.dataset.suffix || '');
    };

    const run = (el) => {
      const target = parseFloat(el.dataset.count);
      if (reduceMotion()) { render(el, target); return; }
      const duration = 1800;
      const startTime = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - startTime) / duration);
        const eased = 1 - Math.pow(1 - p, 4);
        render(el, target * eased);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        run(entry.target);
      });
    }, { threshold: 0.6 });
    items.forEach((el) => io.observe(el));
  }

  /* ---------- Слайдер відгуків ---------- */
  function initSlider() {
    const track = $('[data-slider]');
    if (!track) return;
    const prev = $('[data-slider-prev]');
    const next = $('[data-slider-next]');
    const bar = $('[data-slider-bar]');
    const slides = $$('.review', track);
    const behavior = () => (reduceMotion() ? 'auto' : 'smooth');

    const stepSize = () => {
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return slides[0].getBoundingClientRect().width + gap;
    };

    prev.addEventListener('click', () => track.scrollBy({ left: -stepSize(), behavior: behavior() }));
    next.addEventListener('click', () => track.scrollBy({ left: stepSize(), behavior: behavior() }));

    const update = () => {
      const max = track.scrollWidth - track.clientWidth;
      const ratio = Math.min(1, track.clientWidth / track.scrollWidth);
      const progress = max > 0 ? track.scrollLeft / max : 0;
      bar.style.setProperty('--w', `${(ratio * 100).toFixed(2)}%`);
      bar.style.setProperty('--x', `${(progress * (1 / ratio - 1) * 100).toFixed(2)}%`);
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= max - 2;
    };

    let pending = false;
    track.addEventListener('scroll', () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; update(); });
    }, { passive: true });
    window.addEventListener('resize', update);
    update();

    track.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); next.click(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev.click(); }
    });

    // перетягування мишею на десктопі
    if (finePointer) {
      let dragging = false;
      let startX = 0;
      let startLeft = 0;
      track.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        dragging = true;
        startX = e.clientX;
        startLeft = track.scrollLeft;
        track.classList.add('is-dragging');
      });
      window.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        track.scrollLeft = startLeft - (e.clientX - startX);
      });
      window.addEventListener('pointerup', () => {
        if (!dragging) return;
        dragging = false;
        track.classList.remove('is-dragging');
      });
    }
  }

  /* ---------- Нахил клубної картки ---------- */
  function initTilt() {
    const card = $('[data-tilt]');
    if (!card || !finePointer || reduceMotion()) return;
    const inner = $('.club-card__inner', card);
    const area = card.closest('.club__visual') || card;
    const clamp = (v) => Math.max(0, Math.min(1, v));

    area.addEventListener('pointermove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = clamp((e.clientX - rect.left) / rect.width);
      const y = clamp((e.clientY - rect.top) / rect.height);
      card.classList.add('is-tilting');
      inner.style.setProperty('--ry', `${((x - 0.5) * 16).toFixed(2)}deg`);
      inner.style.setProperty('--rx', `${((0.5 - y) * 12).toFixed(2)}deg`);
      inner.style.setProperty('--px', `${(x * 100).toFixed(1)}%`);
      inner.style.setProperty('--py', `${(y * 100).toFixed(1)}%`);
    });
    area.addEventListener('pointerleave', () => {
      card.classList.remove('is-tilting');
      inner.style.setProperty('--rx', '0deg');
      inner.style.setProperty('--ry', '0deg');
    });
  }

  /* ---------- Підсвітка карток за курсором ---------- */
  function initSpotlight() {
    if (!finePointer) return;
    $$('[data-spotlight]').forEach((group) => {
      group.addEventListener('pointermove', (e) => {
        const item = e.target.closest('[data-spotlight] > *');
        if (!item || item.parentElement !== group) return;
        const rect = item.getBoundingClientRect();
        item.style.setProperty('--mx', `${e.clientX - rect.left}px`);
        item.style.setProperty('--my', `${e.clientY - rect.top}px`);
      });
    });
  }

  /* ---------- FAQ: плавне розкриття ---------- */
  function initFaq() {
    $$('.faq__item').forEach((item) => {
      const summary = $('summary', item);
      const body = $('.faq__a', item);
      let anim = null;

      summary.addEventListener('click', (e) => {
        if (reduceMotion() || !body.animate) return; // стандартна поведінка details
        e.preventDefault();
        if (anim) anim.cancel();

        if (item.open) {
          item.classList.add('is-closing');
          anim = body.animate(
            [{ height: `${body.offsetHeight}px`, opacity: 1 }, { height: '0px', opacity: 0 }],
            { duration: 450, easing: 'cubic-bezier(.16,1,.3,1)' }
          );
          anim.onfinish = () => { item.open = false; item.classList.remove('is-closing'); anim = null; };
        } else {
          item.classList.remove('is-closing');
          item.open = true;
          const height = body.offsetHeight;
          anim = body.animate(
            [{ height: '0px', opacity: 0 }, { height: `${height}px`, opacity: 1 }],
            { duration: 600, easing: 'cubic-bezier(.16,1,.3,1)' }
          );
          anim.onfinish = () => { anim = null; };
        }
      });
    });
  }

  /* ---------- Повідомлення ---------- */
  let toastTimer = 0;
  function toast(message) {
    const el = $('.toast');
    if (!el) return;
    $('.toast__text', el).textContent = message;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), 4500);
  }

  /* ---------- Форма зворотного дзвінка ---------- */
  function initForm() {
    const form = $('#callback');
    if (!form) return;
    const { name, phone, adult } = form.elements;
    const phoneField = phone.closest('.field');
    const phoneError = $('.field__error', phoneField);
    const submit = $('.callback__submit', form);

    const digits = (v) => v.replace(/\D/g, '');
    // 9 цифр після +380; код оператора ніколи не починається з 0
    const localPart = (d) => {
      if ('380'.startsWith(d)) return '';
      if (d.startsWith('380')) d = d.slice(3);
      else if (d.startsWith('80')) d = d.slice(2);
      d = d.replace(/^0+/, '');
      // код країни набрали ще раз поверх префікса «+380 »
      while (d.length > 9 && /^3?80/.test(d)) d = d.replace(/^3?80/, '').replace(/^0+/, '');
      return d;
    };
    const format = (value) => {
      const l = localPart(digits(value)).slice(0, 9);
      let out = '+380';
      if (l.length) out += ` (${l.slice(0, 2)}`;
      if (l.length >= 2) out += ')';
      if (l.length > 2) out += ` ${l.slice(2, 5)}`;
      if (l.length > 5) out += `-${l.slice(5, 7)}`;
      if (l.length > 7) out += `-${l.slice(7, 9)}`;
      return out;
    };

    const setInvalid = (input, state, message = '') => {
      const wrap = input.closest('.field, .check');
      if (wrap) wrap.classList.toggle('is-invalid', state);
      input.setAttribute('aria-invalid', String(state));
      if (input === phone) phoneError.textContent = message;
    };

    phone.addEventListener('focus', () => { if (!phone.value) phone.value = '+380 '; });
    phone.addEventListener('blur', () => { if (localPart(digits(phone.value)).length === 0) phone.value = ''; });
    phone.addEventListener('input', (e) => {
      setInvalid(phone, false);
      if (e.inputType && e.inputType.startsWith('delete')) return;
      phone.value = format(phone.value);
    });
    name.addEventListener('input', () => setInvalid(name, false));
    adult.addEventListener('change', () => setInvalid(adult, false));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const invalid = [];

      if (!name.value.trim()) { setInvalid(name, true); invalid.push(name); }
      if (localPart(digits(phone.value)).length !== 9) {
        setInvalid(phone, true, 'Вкажи номер у форматі +380 (99) 000-00-00');
        invalid.push(phone);
      }
      if (!adult.checked) { setInvalid(adult, true); invalid.push(adult); }

      if (invalid.length) {
        invalid[0].focus();
        return;
      }

      submit.classList.add('is-loading');
      const firstName = name.value.trim();

      /* ДЕМО. Щоб заявки справді надходили, надішліть дані на свій сервіс, наприклад:
         fetch('https://formspree.io/f/ВАШ_ID', { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
         або на webhook Telegram-бота. */
      setTimeout(() => {
        submit.classList.remove('is-loading');
        form.reset();
        toast(`Дякуємо, ${firstName}! Передзвонимо протягом 15 хвилин.`);
      }, 700);
    });
  }

  /* ---------- Нижня панель дій на мобільному ---------- */
  function initDock() {
    const dock = $('.dock');
    const hero = $('.hero');
    if (!dock || !hero) return;
    let footerVisible = false;

    const update = () => {
      const past = window.scrollY > hero.offsetHeight * 0.6;
      dock.classList.toggle('is-visible', past && !footerVisible);
    };

    const cta = $('.footer__cta');
    if (cta && 'IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        footerVisible = entry.isIntersecting;
        update();
      }).observe(cta);
    }
    onScroll(update);
    update();
  }

  /* ---------- Запуск ---------- */
  splitWordmark();
  initAgeGate();
  initHeader();
  initMenu();
  initActiveNav();
  initReveal();
  initParallax();
  initFog();
  initStatus();
  initFilter();
  initCounters();
  initSlider();
  initTilt();
  initSpotlight();
  initFaq();
  initForm();
  initDock();

  $$('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });
})();
