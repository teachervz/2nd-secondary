/* =========================================================
   app.js — مشغّل العرض التفاعلي
   - يقرأ الدرس المطلوب من الرابط: presentation.html?lesson=u1l2
   - يبني الشرائح تلقائيًا من ملف data/lessons.js
   - التنقل بلوحة المفاتيح والماوس، شريط التحكم، التصفيق، القرعة
   - الأسئلة التفاعلية: اختيار من متعدد، صح أم خطأ، سحب وإفلات، ترتيب...
   ========================================================= */

(function () {
  'use strict';

  /* ---------- ثوابت المسرح ---------- */
  const STAGE_W = 1920;
  const STAGE_H = 1080;

  /* ---------- عناصر الصفحة ---------- */
  const $ = function (sel, root) { return (root || document).querySelector(sel); };
  const stage = $('#stage');
  const progressBar = $('#progress i');
  const counterLabel = $('#counter');
  const controls = $('#controls');
  const hint = $('#hint');
  const fx = $('#fx');

  /* ---------- حالة العرض ---------- */
  const params = new URLSearchParams(location.search);
  const lessonId = params.get('lesson') || '';
  const data = window.LESSONS_DATA || { units: [] };
  let classId = params.get('class') || Store.get().currentClassId || '';
  let lesson = null;       // الدرس الحالي
  let unit = null;         // الوحدة التي ينتمي إليها
  let slides = [];         // شرائح الدرس
  let index = 0;           // رقم الشريحة الحالية
  let scale = 1;           // معامل تكبير المسرح
  let cleanups = [];       // دوال تنظيف تُستدعى عند مغادرة الشريحة (مثل إيقاف العدّاد)

  /* =========================================================
     أدوات مساعدة
     ========================================================= */

  /* إنشاء عنصر HTML بسرعة */
  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'style') el.setAttribute('style', v);
        else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  /* تحويل النص إلى HTML آمن مع دعم **غامق** والأسطر الجديدة */
  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function rich(s) {
    return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  }

  /* تعيين ترتيب الظهور بالتتابع */
  function rv(el, i) {
    el.classList.add('rv');
    el.style.setProperty('--i', i);
    return el;
  }

  /* خلط مصفوفة عشوائيًا */
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* أرقام عربية للعرض */
  function arNum(n) {
    return String(n).replace(/\d/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; });
  }

  /* نص المدة: ٣٠ ثانية، ١ دقيقة، ١.٥ دقيقة */
  function durLabel(sec) {
    if (sec < 60) return arNum(sec) + ' ثانية';
    return arNum(Math.round(sec / 60 * 10) / 10).replace('.', '٫') + ' دقيقة';
  }

  /* البحث عن درس في البيانات */
  function findLesson(id) {
    for (let u = 0; u < data.units.length; u++) {
      const un = data.units[u];
      for (let l = 0; l < un.lessons.length; l++) {
        if (un.lessons[l].id === id) return { unit: un, lesson: un.lessons[l], u: u, l: l };
      }
    }
    return null;
  }
  function allLessons() {
    const list = [];
    data.units.forEach(function (un) { un.lessons.forEach(function (ls) { list.push(ls); }); });
    return list;
  }

  /* =========================================================
     الأصوات (Web Audio API) — بدون ملفات خارجية
     ========================================================= */
  let audioCtx = null;
  function ctx() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { audioCtx = null; }
    return audioCtx;
  }

  /* نغمة بسيطة */
  function tone(freq, start, dur, type, vol) {
    const ac = ctx(); if (!ac) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    const t0 = ac.currentTime + start;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.25, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ac.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  /* صوت النجاح: نغمات صاعدة مبهجة */
  function soundSuccess() {
    [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { tone(f, i * 0.09, 0.35, 'triangle', 0.22); });
  }
  /* صوت خفيف لإجابة جزئية صحيحة */
  function soundDing() { tone(880, 0, 0.25, 'sine', 0.2); tone(1318.5, 0.07, 0.3, 'sine', 0.14); }
  /* صوت الخطأ: نغمة هادئة غير مزعجة */
  function soundWrong() { tone(311, 0, 0.18, 'sine', 0.18); tone(233, 0.14, 0.28, 'sine', 0.16); }
  /* صوت انتهاء الوقت */
  function soundTimeUp() { [0, 0.3, 0.6].forEach(function (t) { tone(988, t, 0.2, 'square', 0.08); }); }
  /* نقرة خفيفة أثناء دوران القرعة */
  function soundTick() { tone(1200 + Math.random() * 300, 0, 0.04, 'square', 0.035); }

  /* صوت التصفيق: دفعات قصيرة من الضوضاء المفلترة بتوقيت عشوائي */
  function soundClap() {
    const ac = ctx(); if (!ac) return;
    const len = Math.floor(ac.sampleRate * 0.12);
    const buffer = ac.createBuffer(1, len, ac.sampleRate);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const claps = 26;
    for (let i = 0; i < claps; i++) {
      const t = ac.currentTime + Math.random() * 1.6;
      const src = ac.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = 0.85 + Math.random() * 0.35;
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1100 + Math.random() * 900;
      bp.Q.value = 0.9;
      const g = ac.createGain();
      const v = 0.35 + Math.random() * 0.4;
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      src.connect(bp).connect(g).connect(ac.destination);
      src.start(t);
    }
  }

  /* =========================================================
     المؤثرات البصرية
     ========================================================= */

  /* التصفيق 👏: صوت + أيقونات تطير للأعلى */
  function clap() {
    soundClap();
    for (let i = 0; i < 22; i++) {
      const e = h('span', { class: 'clap-emoji', text: i % 5 === 0 ? '💜' : '👏' });
      e.style.left = (5 + Math.random() * 90) + '%';
      e.style.fontSize = (32 + Math.random() * 34) + 'px';
      e.style.animationDelay = (Math.random() * 0.9) + 's';
      e.style.setProperty('--rot', (Math.random() * 60 - 30) + 'deg');
      fx.appendChild(e);
      setTimeout(function () { e.remove(); }, 3400);
    }
  }

  /* الاحتفال (Confetti) */
  function confetti() {
    const colors = ['#7c3aed', '#a78bfa', '#f59e0b', '#fcd34d', '#ec4899', '#10b981', '#ffffff'];
    for (let i = 0; i < 90; i++) {
      const c = h('i', { class: 'confetti' });
      c.style.left = Math.random() * 100 + '%';
      c.style.background = colors[i % colors.length];
      c.style.setProperty('--dx', (Math.random() * 300 - 150) + 'px');
      c.style.setProperty('--rot', (Math.random() * 900 - 450) + 'deg');
      c.style.setProperty('--dur', (1.8 + Math.random() * 1.4) + 's');
      c.style.animationDelay = (Math.random() * 0.35) + 's';
      if (i % 3 === 0) { c.style.width = '10px'; c.style.height = '10px'; c.style.borderRadius = '50%'; }
      fx.appendChild(c);
      setTimeout(function () { c.remove(); }, 3800);
    }
  }

  /* اهتزاز خفيف لعنصر */
  function shake(el) {
    // نستخدم Web Animations حتى لا تُلغى حركة الظهور (rv) فيختفي العنصر
    if (!el.animate) return;
    el.animate([
      { transform: 'translateX(0)' }, { transform: 'translateX(-14px)' }, { transform: 'translateX(12px)' },
      { transform: 'translateX(-8px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }
    ], { duration: 450, easing: 'ease' });
  }

  /* رسالة التقييم الفوري داخل الشريحة */
  function showFeedback(box, good, text) {
    box.innerHTML = '';
    box.appendChild(h('span', { class: 'fb ' + (good ? 'good' : 'bad'), text: text || (good ? 'أحسنتِ! 👏 إجابة صحيحة' : 'حاولي مرة أخرى 💜') }));
  }
  function celebrate(box, text) {
    confetti();
    soundSuccess();
    if (box) showFeedback(box, true, text);
  }

  /* =========================================================
     العدّاد التنازلي (يُستخدم في عدة شرائح)
     ========================================================= */
  function createTimer(seconds) {
    const R = 125;
    const C = 2 * Math.PI * R;
    let total = seconds;
    let left = seconds;
    let tid = null;

    const fg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 300 300');
    [bg, fg].forEach(function (c) { c.setAttribute('cx', 150); c.setAttribute('cy', 150); c.setAttribute('r', R); });
    bg.setAttribute('class', 'bg');
    fg.setAttribute('class', 'fg');
    fg.style.strokeDasharray = C;
    svg.appendChild(bg); svg.appendChild(fg);

    const num = h('div', { class: 't-num' });
    const ring = h('div', { class: 'timer-ring' }, [svg, num]);
    const startBtn = h('button', { class: 's-btn', type: 'button' });
    const resetBtn = h('button', { class: 's-btn ghost', type: 'button', text: '🔄', title: 'إعادة' });
    const el = h('div', { class: 'timer' }, [ring, h('div', { class: 'timer-btns' }, [startBtn, resetBtn])]);

    function fmt(s) {
      const m = Math.floor(s / 60);
      const r = s % 60;
      return m + ':' + String(r).padStart(2, '0');
    }
    function draw() {
      num.textContent = fmt(left);
      fg.style.strokeDashoffset = C * (1 - left / total);
      ring.classList.toggle('low', left <= 10 && left > 0);
      ring.classList.toggle('done', left === 0);
      startBtn.textContent = tid ? '⏸ إيقاف' : (left === 0 ? '⏱ انتهى الوقت' : '▶ ابدئي');
      startBtn.disabled = left === 0;
    }
    function tick() {
      left = Math.max(0, left - 1);
      if (left === 0) { stop(); soundTimeUp(); }
      draw();
    }
    function start() {
      if (tid || left === 0) return;
      ctx();
      tid = setInterval(tick, 1000);
      draw();
    }
    function stop() { clearInterval(tid); tid = null; draw(); }
    function reset(sec) {
      stop();
      if (sec) total = sec;
      left = total;
      draw();
    }
    startBtn.addEventListener('click', function () { tid ? stop() : start(); });
    resetBtn.addEventListener('click', function () { reset(); });
    cleanups.push(stop);
    draw();
    return { el: el, start: start, stop: stop, reset: reset };
  }

  /* =========================================================
     تلوين الكود (لدروس HTML و CSS و JavaScript)
     ========================================================= */
  function highlight(code, lang) {
    let re;
    let kinds;
    if (lang === 'css') {
      re = /(\/\*[\s\S]*?\*\/)|([.#]?[a-zA-Z][\w-]*(?:\s*,\s*[.#]?[a-zA-Z][\w-]*)*)(?=\s*\{)|([a-z-]+)(?=\s*:)|("[^"]*"|#[0-9a-fA-F]{3,6}\b)/g;
      kinds = ['tk-com', 'tk-tag', 'tk-attr', 'tk-str'];
    } else if (lang === 'js') {
      re = /(\/\/[^\n]*)|\b(function|let|const|var|if|else|return|document|alert|window)\b|("[^"]*"|'[^']*')/g;
      kinds = ['tk-com', 'tk-tag', 'tk-str'];
    } else {
      re = /(<!--[\s\S]*?-->)|(<\/?[a-zA-Z][\w-]*|\/?>)|([a-zA-Z-]+)(?==)|("[^"]*")/g;
      kinds = ['tk-com', 'tk-tag', 'tk-attr', 'tk-str'];
    }
    let out = '';
    let last = 0;
    code.replace(re, function () {
      const m = arguments[0];
      const pos = arguments[arguments.length - 2];
      out += esc(code.slice(last, pos));
      let k = '';
      for (let i = 0; i < kinds.length; i++) { if (arguments[i + 1] !== undefined) { k = kinds[i]; break; } }
      out += '<span class="' + k + '">' + esc(m) + '</span>';
      last = pos + m.length;
      return m;
    });
    out += esc(code.slice(last));
    return out;
  }

  /* =========================================================
     عناصر مشتركة في الشرائح
     ========================================================= */

  /* الوسوم الافتراضية لكل نوع شريحة (الاستراتيجية المستخدمة) */
  const TAGS = {
    warmup: '🎲 تحضير ومراجعة',
    objectives: '🎯 أهداف الدرس',
    hook: '🌟 تمهيد',
    story: '📖 قصة وموقف',
    predict: '🤔 ماذا تتوقعين؟',
    points: '🔍 لاحظي واكتشفي',
    flip: '🃏 بطاقات الاكتشاف',
    compare: '⚖️ قارني ولاحظي',
    steps: '🪜 خطوة بخطوة',
    code: '💻 جرّبي الكود',
    brainstorm: '💡 عصف ذهني',
    tps: '👭 فكّري – زاوجي – شاركي',
    coop: '🤝 تعلّم تعاوني',
    mcq: '✅ اختاري الإجابة الصحيحة',
    tf: '✔️ صح أم خطأ؟',
    sort: '🧩 صنّفي بالسحب والإفلات',
    order: '🔢 رتّبي الخطوات',
    challenge: '⏱️ تحدّي الدقيقة',
    review: '📝 مراجعة وتلخيص',
    match: '🔗 صِلي وطابقي',
    wheel: '🎡 عجلة الأسئلة',
    boxes: '🎁 الصناديق الغامضة',
    teams: '🏆 مسابقة الفريقين',
    fill: '🧩 أكملي الفراغ',
    exit: '🎫 بطاقة الخروج ٣-٢-١',
    vscode: '🧑‍💻 محاكي VS Code'
  };

  /* رأس الشريحة: الوسم + العنوان + عنوان فرعي */
  function head(s, defTitle) {
    const tag = s.tag || TAGS[s.type];
    const title = s.title || defTitle;
    const wrap = h('div', { class: 's-head' });
    if (tag) wrap.appendChild(rv(h('span', { class: 'tag', text: tag }), 0));
    if (title) wrap.appendChild(rv(h('h2', { class: 's-title', html: rich(title) }), 1));
    if (s.subtitle) wrap.appendChild(rv(h('p', { class: 's-sub', html: rich(s.subtitle) }), 2));
    return wrap;
  }

  /* زر يكشف إجابة مخفية */
  function revealButton(answer, label, onToggle) {
    const box = h('div', { class: 'answer-box', html: rich(answer) });
    const btn = h('button', { class: 's-btn gold', type: 'button', text: label || '👀 اكشفي الإجابة' });
    btn.addEventListener('click', function () {
      box.classList.toggle('show');
      btn.textContent = box.classList.contains('show') ? '🙈 إخفاء الإجابة' : (label || '👀 اكشفي الإجابة');
      if (onToggle) onToggle(box.classList.contains('show'));
    });
    return h('div', { class: 'reveal-zone' }, [btn, box]);
  }

  /* =========================================================
     أنواع الشرائح — كل دالة تبني شريحة من بياناتها
     ========================================================= */
  const R = {};

  /* ١) الشريحة الترحيبية */
  R.welcome = function (s) {
    const t = Store.get().teacher;
    const el = h('section', { class: 'slide dark' });
    const meta = h('div', { class: 'welcome-meta' });
    if (t.name) meta.appendChild(h('div', { class: 'wm' }, [h('small', { text: 'المعلمة' }), t.name]));
    if (t.school) meta.appendChild(h('div', { class: 'wm' }, [h('small', { text: 'المدرسة' }), t.school]));
    meta.appendChild(h('div', { class: 'wm' }, [h('small', { text: 'صفحة الكتاب' }), arNum(lesson.page)]));
    const cls = Store.getClass(classId);
    if (cls) meta.appendChild(h('div', { class: 'wm' }, [h('small', { text: 'الفصل' }), cls.name]));
    el.appendChild(h('div', { class: 'welcome-wrap' }, [
      rv(h('div', { class: 'w-emoji', text: s.emoji || unit.icon || '📘' }), 0),
      unit.themeName ? rv(h('div', { class: 'theme-pill', text: unit.themeName }), 1) : null,
      rv(h('div', { class: 'w-unit', text: unit.title }), 1),
      rv(h('h1', { class: 'w-title', html: rich(s.title || lesson.title) }), 2),
      rv(h('div', { class: 'w-unit', html: rich(s.subtitle || ('مرحبًا بكنّ يا مبدعات 💜 — ' + (data.book ? data.book.subject : ''))) }), 3),
      rv(meta, 4)
    ]));
    return el;
  };

  /* ٢) شريحة التحضير: قرعة + مراجعة الدرس السابق */
  R.warmup = function (s) {
    const el = h('section', { class: 'slide' });
    el.appendChild(head(s, 'هيا نستعد!'));
    const pickBtn = h('button', { class: 's-btn gold', type: 'button', text: '🎲 قرعة الأسماء' });
    pickBtn.addEventListener('click', openPicker);
    const left = rv(h('div', { class: 'picker-card' }, [
      h('div', { class: 'p-emoji', text: '🎲' }),
      h('p', { text: 'من ستجيب أولًا؟' }),
      pickBtn
    ]), 2);
    const qs = s.questions || [{ q: s.question, a: s.answer }];
    let qi = 0;
    const qLabel = h('div', { class: 'r-label', text: s.label || '🔁 مراجعة سريعة' });
    const qText = h('div', { class: 'r-q' });
    const ans = h('div', { class: 'answer-box' });
    const showBtn = h('button', { class: 's-btn', type: 'button', text: '👀 اكشفي الإجابة' });
    const nextBtn = h('button', { class: 's-btn ghost', type: 'button', text: 'سؤال آخر ⟵' });
    function drawQ() {
      qText.innerHTML = rich(qs[qi].q);
      ans.innerHTML = rich(qs[qi].a || '');
      ans.classList.remove('show');
      showBtn.style.display = qs[qi].a ? '' : 'none';
      nextBtn.style.display = qs.length > 1 ? '' : 'none';
    }
    showBtn.addEventListener('click', function () { ans.classList.toggle('show'); });
    nextBtn.addEventListener('click', function () { qi = (qi + 1) % qs.length; drawQ(); });
    drawQ();
    const right = rv(h('div', { class: 'review-card' }, [
      qLabel, qText, h('div', { style: 'display:flex;gap:20px;flex-wrap:wrap' }, [showBtn, nextBtn]), ans
    ]), 3);
    el.appendChild(h('div', { class: 'warm-grid' }, [left, right]));
    return el;
  };

  /* ٣) أهداف الدرس */
  R.objectives = function (s) {
    const el = h('section', { class: 'slide' });
    el.appendChild(head(s, 'في نهاية الدرس ستكونين قادرة على:'));
    const ul = h('ul', { class: 'obj-list' });
    (s.items || []).forEach(function (it, i) {
      ul.appendChild(rv(h('li', {}, [h('span', { class: 'o-num', text: arNum(i + 1) }), h('span', { html: rich(it) })]), i + 2));
    });
    el.appendChild(h('div', { class: 's-body', style: 'justify-content:center' }, [ul]));
    return el;
  };

  /* ٤) التمهيد / القصة / ماذا تتوقعين؟ */
  R.hook = function (s) {
    const el = h('section', { class: 'slide' });
    el.appendChild(head(s, ''));
    const text = h('div', { class: 'hook-text' });
    if (s.story) text.appendChild(rv(h('p', { class: 'story', html: rich(s.story) }), 2));
    if (s.question) text.appendChild(rv(h('p', { class: 'question', html: rich(s.question) }), 3));
    if (s.answer) text.appendChild(rv(revealButton(s.answer, s.revealLabel), 4));
    el.appendChild(h('div', { class: 'hook-wrap' }, [
      rv(h('div', { class: 'hook-emoji', text: s.emoji || '💭' }), 1),
      text
    ]));
    return el;
  };
  R.story = R.hook;
  R.predict = function (s) {
    s = Object.assign({ revealLabel: '💡 اكشفي ما حدث فعلًا' }, s);
    return R.hook(s);
  };

  /* ٥) نقاط الشرح (لاحظي واكتشفي) — يمكن إخفاؤها لتُكشف بالضغط */
  R.points = function (s) {
    const el = h('section', { class: 'slide' });
    el.appendChild(head(s, ''));
    const items = s.items || [];
    const cols = s.cols || (items.length === 4 ? 2 : Math.min(items.length, 3));
    const grid = h('div', { class: 'points-grid c' + cols });
    items.forEach(function (it, i) {
      const card = h('div', { class: 'point' });
      function fill() {
        card.className = 'point';
        card.innerHTML = '';
        if (it.icon) card.appendChild(h('div', { class: 'pt-ico', text: it.icon }));
        if (it.title) card.appendChild(h('h3', { html: rich(it.title) }));
        if (it.text) card.appendChild(h('p', { html: rich(it.text) }));
      }
      if (s.reveal) {
        card.className = 'point hidden-pt';
        card.appendChild(h('div', { class: 'pt-ico', text: '❓' }));
        card.appendChild(h('h3', { html: rich(it.hint || 'اضغطي للاكتشاف') }));
        card.addEventListener('click', function once() {
          card.removeEventListener('click', once);
          fill();
          card.animate([{ transform: 'scale(.9)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 350, easing: 'ease-out' });
        });
      } else {
        fill();
      }
      grid.appendChild(rv(card, i + 2));
    });
    el.appendChild(grid);
    return el;
  };

  /* ٦) البطاقات المقلوبة */
  R.flip = function (s) {
    const el = h('section', { class: 'slide' });
    el.appendChild(head(s, ''));
    const cards = s.cards || [];
    const cols = s.cols || (cards.length === 4 ? 4 : Math.min(cards.length, 3));
    const grid = h('div', { class: 'flip-grid c' + cols });
    cards.forEach(function (c, i) {
      const card = h('div', { class: 'flip' + (cards.length <= cols ? ' tall' : '') }, [
        h('div', { class: 'flip-in' }, [
          h('div', { class: 'flip-face flip-front' }, [
            h('div', { class: 'f-ico', text: c.icon || '✨' }),
            h('div', { class: 'f-t', html: rich(c.front) }),
            h('div', { class: 'f-tap', text: 'اضغطي لقلب البطاقة' })
          ]),
          h('div', { class: 'flip-face flip-back', html: rich(c.back) })
        ])
      ]);
      card.addEventListener('click', function () { card.classList.toggle('flipped'); });
      grid.appendChild(rv(card, i + 2));
    });
    el.appendChild(grid);
    return el;
  };

  /* ٧) جدول المقارنة */
  R.compare = function (s) {
    const el = h('section', { class: 'slide' });
    el.appendChild(head(s, ''));
    const table = h('table', { class: 'cmp' });
    const thr = h('tr');
    (s.headers || []).forEach(function (t) { thr.appendChild(h('th', { html: rich(t) })); });
    table.appendChild(h('thead', {}, [thr]));
    const tb = h('tbody');
    (s.rows || []).forEach(function (row, i) {
      const tr = h('tr');
      row.forEach(function (c) { tr.appendChild(h('td', { html: rich(c) })); });
      tb.appendChild(rv(tr, i + 2));
    });
    table.appendChild(tb);
    el.appendChild(h('div', { class: 's-body', style: 'justify-content:center' }, [rv(table, 1)]));
    if (s.note) el.appendChild(rv(h('p', { class: 'explain-note', html: rich(s.note) }), 8));
    return el;
  };

  /* ٨) خطوات متتابعة تُكشف واحدة تلو الأخرى */
  R.steps = function (s) {
    const el = h('section', { class: 'slide' });
    el.appendChild(head(s, ''));
    const items = s.items || [];
    const ol = h('ol', { class: 'steps' + (items.length >= 5 ? ' compact' : '') });
    const lis = items.map(function (it, i) {
      const li = h('li', {}, [h('span', { class: 'st-n', text: arNum(i + 1) }), h('span', { html: rich(it) })]);
      ol.appendChild(rv(li, i + 2));
      return li;
    });
    const body = h('div', { class: 's-body', style: 'justify-content:center' }, [ol]);
    if (s.reveal !== false) {
      let shown = 0;
      const btn = h('button', { class: 's-btn gold', type: 'button', text: 'اكشفي الخطوة التالية ⟵' });
      const lock = function () {
        lis.forEach(function (li, i) {
          const locked = i >= shown;
          li.classList.toggle('locked', locked);
          li.lastChild.style.visibility = locked ? 'hidden' : '';
        });
        btn.disabled = shown >= lis.length;
        if (shown >= lis.length) btn.textContent = '✔ اكتملت الخطوات';
      };
      const next = function () { if (shown < lis.length) { shown++; lock(); } };
      btn.addEventListener('click', next);
      lis.forEach(function (li) { li.addEventListener('click', function () { if (li.classList.contains('locked')) next(); }); });
      lock();
      body.appendChild(h('div', {}, [btn]));
    }
    el.appendChild(body);
    return el;
  };

  /* ٩) الكود مع المعاينة المباشرة */
  R.code = function (s) {
    const el = h('section', { class: 'slide' });
    el.appendChild(head(s, ''));
    const pre = h('pre', { class: 'code-box', html: highlight(s.code || '', s.lang || 'html') });
    if (s.codeSize) pre.style.fontSize = s.codeSize + 'px';
    const pv = h('div', { class: 'preview-box' });
    pv.appendChild(h('div', { class: 'pv-label', text: s.previewLabel || '🖥️ النتيجة في المتصفح' }));
    let doc = s.preview || (s.lang === 'css' ? '' : s.code) || '';
    if (doc && !/<html/i.test(doc)) {
      doc = '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>body{font-family:Tahoma,Arial,sans-serif;font-size:22px;margin:16px;}</style></head><body>' + doc + '</body></html>';
    }
    const frame = h('iframe', { title: 'معاينة', sandbox: 'allow-scripts allow-modals' });
    if (s.hidePreview === false) {
      frame.srcdoc = doc;
      pv.appendChild(frame);
    } else {
      const placeholder = h('div', { class: 'pv-hidden' }, [
        h('div', {}, [
          h('div', { text: '🤔 ماذا تتوقعين أن يظهر؟', style: 'margin-bottom:24px' }),
          h('button', { class: 's-btn', type: 'button', text: '▶ شغّلي الكود', onclick: function () {
            placeholder.replaceWith(frame);
            frame.srcdoc = doc;
          } })
        ])
      ]);
      pv.appendChild(placeholder);
    }
    el.appendChild(h('div', { class: 'code-wrap' }, [rv(pre, 2), rv(pv, 3)]));
    if (s.note) el.appendChild(rv(h('p', { class: 'explain-note', style: 'margin:24px 0 0', html: rich(s.note) }), 4));
    return el;
  };

  /* ١٠) العصف الذهني */
  R.brainstorm = function (s) {
    const el = h('section', { class: 'slide' });
    el.appendChild(head(s, 'هيا نفكر معًا'));
    const cloud = h('div', { class: 'bs-cloud' });
    const input = h('input', { type: 'text', placeholder: 'اكتبي فكرة طالبة ثم اضغطي Enter', 'aria-label': 'فكرة جديدة' });
    function addBubble(text, mine) {
      const b = h('span', { class: 'bubble' + (mine ? ' mine' : '') }, [text]);
      const x = h('button', { class: 'x', type: 'button', text: '✕', title: 'حذف' });
      x.addEventListener('click', function () { b.remove(); });
      b.appendChild(x);
      cloud.appendChild(b);
    }
    function addFromInput() {
      const v = input.value.trim();
      if (!v) return;
      addBubble(v, true);
      input.value = '';
      soundDing();
    }
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addFromInput(); } });
    const ideas = (s.ideas || []).slice();
    const ideaBtn = h('button', { class: 's-btn gold', type: 'button', text: '💡 فكرة مقترحة' });
    ideaBtn.addEventListener('click', function () {
      if (!ideas.length) return;
      addBubble(ideas.shift(), false);
      if (!ideas.length) ideaBtn.disabled = true;
    });
    if (!ideas.length) ideaBtn.style.display = 'none';
    el.appendChild(h('div', { class: 'bs-wrap' }, [
      rv(h('div', { class: 'bs-center', html: rich(s.question) }), 2),
      cloud,
      rv(h('div', { class: 'bs-input' }, [input, h('button', { class: 's-btn', type: 'button', text: '＋ أضيفي', onclick: addFromInput }), ideaBtn]), 3)
    ]));
    return el;
  };

  /* ١١) فكّري – زاوجي – شاركي (مع عدّاد) */
  R.tps = function (s) {
    const el = h('section', { class: 'slide' });
    el.appendChild(head(s, ''));
    const phases = [
      { ico: '🧠', name: 'فكّري', sec: s.think || 60, sub: 'وحدكِ' },
      { ico: '👭', name: 'زاوجي', sec: s.pair || 90, sub: 'مع زميلتك' },
      { ico: '📣', name: 'شاركي', sec: s.share || 120, sub: 'مع الفصل' }
    ];
    const timer = createTimer(phases[0].sec);
    const stepsEl = h('div', { class: 'tps-steps' });
    const stepEls = phases.map(function (p, i) {
      const st = h('div', { class: 'tps-step' + (i === 0 ? ' active' : '') }, [
        h('div', { class: 'ts-ico', text: p.ico }),
        h('b', { text: p.name }),
        h('span', { text: p.sub + ' | ' + durLabel(p.sec) })
      ]);
      st.addEventListener('click', function () {
        stepEls.forEach(function (x) { x.classList.remove('active'); });
        st.classList.add('active');
        timer.reset(p.sec);
      });
      stepsEl.appendChild(st);
      return st;
    });
    const left = h('div', { class: 'tps-left' }, [rv(h('div', { class: 'tps-q', html: rich(s.question) }), 2), rv(stepsEl, 3)]);
    // عند كشف الإجابة المقترحة تُطوى بطاقات المراحل لإفساح المكان لها
    if (s.answer) left.appendChild(rv(revealButton(s.answer, '💡 إجابة مقترحة', function (shown) { left.classList.toggle('answered', shown); }), 4));
    el.appendChild(h('div', { class: 'tps-wrap' }, [left, rv(h('div', { style: 'display:flex;align-items:center;justify-content:center' }, [timer.el]), 3)]));
    return el;
  };

  /* ١٢) التعلم التعاوني: مهام للمجموعات مع عدّاد */
  R.coop = function (s) {
    const el = h('section', { class: 'slide' });
    el.appendChild(head(s, 'نعمل معًا في مجموعات'));
    const timer = createTimer(s.seconds || 180);
    const grid = h('div', { class: 'points-grid c' + Math.min((s.groups || []).length, 2) + ((s.groups || []).length > 2 ? ' tight' : '') });
    (s.groups || []).forEach(function (g, i) {
      grid.appendChild(rv(h('div', { class: 'point' }, [
        h('div', { class: 'pt-ico', text: g.icon || ['🟣', '🟡', '🩷', '🔵'][i % 4] }),
        h('h3', { html: rich(g.name) }),
        h('p', { html: rich(g.task) })
      ]), i + 2));
    });
    el.appendChild(h('div', { class: 'tps-wrap' }, [grid, rv(h('div', { style: 'display:flex;align-items:center;justify-content:center' }, [timer.el]), 3)]));
    return el;
  };

  /* ١٣) سؤال اختيار من متعدد */
  R.mcq = function (s) {
    const el = h('section', { class: 'slide' });
    el.appendChild(head(Object.assign({}, s, { title: '' }), ''));
    const body = h('div', { class: 's-body', style: 'justify-content:center' });
    body.appendChild(rv(h('p', { class: 'mcq-q', html: rich(s.question) }), 1));
    const grid = h('div', { class: 'mcq-grid' });
    const fb = h('div', { class: 'feedback' });
    const letters = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];
    const correct = Number(s.answer) - 1;    // الإجابة تُكتب بترقيم يبدأ من ١
    let solved = false;
    (s.options || []).forEach(function (opt, i) {
      const b = h('button', { class: 'mcq-opt', type: 'button' }, [
        h('span', { class: 'o-ico', text: letters[i] }),
        h('span', { html: rich(opt) })
      ]);
      b.addEventListener('click', function () {
        if (solved) return;
        if (i === correct) {
          solved = true;
          b.classList.add('correct');
          celebrate(fb);
          if (s.explain) body.appendChild(h('p', { class: 'explain-note', html: '💡 ' + rich(s.explain) }));
        } else {
          b.classList.add('wrong');
          shake(b);
          soundWrong();
          showFeedback(fb, false);
        }
      });
      grid.appendChild(rv(b, i + 2));
    });
    body.appendChild(grid);
    body.appendChild(fb);
    el.appendChild(body);
    return el;
  };

  /* ١٤) صح أم خطأ */
  R.tf = function (s) {
    const el = h('section', { class: 'slide' });
    el.appendChild(head(s, ''));
    const list = h('div', { class: 'tf-list' });
    const fb = h('div', { class: 'feedback' });
    const items = s.items || [];
    let done = 0;
    items.forEach(function (it, i) {
      const truth = it.answer === true || it.answer === 'صح' || it.answer === 'صحيحة';
      const row = h('div', { class: 'tf-row' });
      const btns = h('div', { class: 'tf-btns' });
      function choose(val) {
        if (row.classList.contains('right')) return;
        if (val === truth) {
          row.classList.remove('wrong-ans');
          row.classList.add('right');
          done++;
          if (done === items.length) celebrate(fb, 'أحسنتِ! 👏 أجبتِ عن جميع العبارات');
          else { soundDing(); showFeedback(fb, true); }
        } else {
          row.classList.add('wrong-ans');
          shake(row);
          soundWrong();
          showFeedback(fb, false);
        }
      }
      btns.appendChild(h('button', { class: 'tf-btn t', type: 'button', text: '✔', title: 'صح', onclick: function () { choose(true); } }));
      btns.appendChild(h('button', { class: 'tf-btn f', type: 'button', text: '✘', title: 'خطأ', onclick: function () { choose(false); } }));
      row.appendChild(h('div', { class: 'tf-text', html: rich(it.text) }));
      row.appendChild(btns);
      row.appendChild(h('div', { class: 'tf-why', html: (truth ? '✔ صحيحة' : '✘ خاطئة') + (it.explain ? ' — ' + rich(it.explain) : '') }));
      list.appendChild(rv(row, i + 2));
    });
    el.appendChild(h('div', { class: 's-body' }, [list, fb]));
    return el;
  };

  /* سحب عنصر داخل المسرح المُكبَّر (يعمل بالماوس واللمس) */
  function makeDraggable(item, opts) {
    item.addEventListener('pointerdown', function (e) {
      if (opts.canDrag && !opts.canDrag()) return;
      e.preventDefault();
      ctx();
      const sx = e.clientX;
      const sy = e.clientY;
      let lastTarget = null;
      item.setPointerCapture(e.pointerId);
      item.classList.add('dragging');
      item.classList.remove('back');
      function targetAt(x, y) {
        item.style.pointerEvents = 'none';
        const under = document.elementFromPoint(x, y);
        item.style.pointerEvents = '';
        return under ? opts.findTarget(under) : null;
      }
      function move(ev) {
        item.style.transform = 'translate(' + (ev.clientX - sx) / (scale * fitZoom) + 'px,' + (ev.clientY - sy) / (scale * fitZoom) + 'px)';
        const t = targetAt(ev.clientX, ev.clientY);
        if (t !== lastTarget) {
          if (lastTarget) opts.leave(lastTarget);
          if (t) opts.enter(t);
          lastTarget = t;
        }
      }
      function up(ev) {
        item.removeEventListener('pointermove', move);
        item.removeEventListener('pointerup', up);
        item.removeEventListener('pointercancel', up);
        item.classList.remove('dragging');
        if (lastTarget) opts.leave(lastTarget);
        const t = ev.type === 'pointerup' ? targetAt(ev.clientX, ev.clientY) : null;
        item.classList.add('back');
        item.style.transform = '';
        opts.drop(t);
      }
      item.addEventListener('pointermove', move);
      item.addEventListener('pointerup', up);
      item.addEventListener('pointercancel', up);
    });
  }

  /* ١٥) التصنيف بالسحب والإفلات */
  R.sort = function (s) {
    const el = h('section', { class: 'slide' });
    el.appendChild(head(s, ''));
    const pool = h('div', { class: 'sort-pool' });
    const bins = h('div', { class: 'sort-bins', style: 'grid-template-columns:repeat(' + (s.categories || []).length + ',1fr)' });
    const fb = h('div', { class: 'feedback', style: 'min-height:70px' });
    const binEls = (s.categories || []).map(function (c, i) {
      const items = h('div', { class: 'bin-items' });
      const b = h('div', { class: 'bin', 'data-cat': c }, [h('h4', { html: rich(c) }), items]);
      b._items = items;
      bins.appendChild(rv(b, i + 3));
      return b;
    });
    const items = shuffle(s.items || []);
    let placed = 0;
    items.forEach(function (it) {
      const chip = h('div', { class: 'chip', html: rich(it.text) });
      makeDraggable(chip, {
        canDrag: function () { return !chip.classList.contains('placed'); },
        findTarget: function (node) { return node.closest('.bin'); },
        enter: function (b) { b.classList.add('over'); },
        leave: function (b) { b.classList.remove('over'); },
        drop: function (b) {
          if (!b) return;
          if (b.getAttribute('data-cat') === String(it.cat)) {
            chip.classList.add('placed');
            b._items.appendChild(chip);
            placed++;
            if (placed === items.length) celebrate(fb, 'أحسنتِ! 👏 صنّفتِ جميع العناصر');
            else { soundDing(); showFeedback(fb, true, 'صحيح ✓'); }
          } else {
            shake(chip);
            soundWrong();
            showFeedback(fb, false);
          }
        }
      });
      pool.appendChild(chip);
    });
    el.appendChild(h('div', { class: 'sort-wrap' }, [rv(pool, 2), bins, fb]));
    return el;
  };

  /* ١٦) ترتيب العناصر بالسحب */
  R.order = function (s) {
    const el = h('section', { class: 'slide' });
    el.appendChild(head(s, ''));
    const correctOrder = s.items || [];
    const list = h('ol', { class: 'order-list' + (correctOrder.length >= 5 ? ' compact' : '') });
    const fb = h('div', { class: 'feedback', style: 'min-height:70px' });
    function renumber() {
      Array.prototype.forEach.call(list.children, function (li, i) { li.querySelector('.o-n').textContent = arNum(i + 1); });
    }
    function build() {
      list.innerHTML = '';
      let order = shuffle(correctOrder.map(function (_, i) { return i; }));
      if (order.length > 1 && order.every(function (v, i) { return v === i; })) order = order.slice(1).concat(order[0]);
      order.forEach(function (k) {
        const li = h('li', { class: 'order-item', 'data-k': k }, [
          h('span', { class: 'o-n' }), h('span', { style: 'flex:1', html: rich(correctOrder[k]) }), h('span', { class: 'grip', text: '⠿' })
        ]);
        makeDraggable(li, {
          findTarget: function (node) { const t = node.closest('.order-item'); return t && t !== li && list.contains(t) ? t : null; },
          enter: function (t) { t.classList.add('drop-target'); },
          leave: function (t) { t.classList.remove('drop-target'); },
          drop: function (t) {
            if (!t) return;
            const items = Array.prototype.slice.call(list.children);
            if (items.indexOf(t) > items.indexOf(li)) t.after(li); else t.before(li);
            items.forEach(function (x) { x.classList.remove('ok', 'no'); });
            renumber();
          }
        });
        list.appendChild(li);
      });
      renumber();
      fb.innerHTML = '';
    }
    build();
    const check = h('button', { class: 's-btn', type: 'button', text: '✓ تحقّقي من الترتيب' });
    check.addEventListener('click', function () {
      let ok = true;
      Array.prototype.forEach.call(list.children, function (li, i) {
        const good = Number(li.getAttribute('data-k')) === i;
        li.classList.toggle('ok', good);
        li.classList.toggle('no', !good);
        if (!good) ok = false;
      });
      if (ok) celebrate(fb, 'أحسنتِ! 👏 الترتيب صحيح');
      else { soundWrong(); showFeedback(fb, false); }
    });
    const again = h('button', { class: 's-btn ghost', type: 'button', text: '🔀 خلط من جديد', onclick: build });
    el.appendChild(h('div', { class: 's-body', style: 'gap:22px' }, [
      rv(list, 2),
      rv(h('div', { style: 'display:flex;gap:20px;align-items:center' }, [check, again, fb]), 3)
    ]));
    return el;
  };

  /* ١٧) تحدّي الدقيقة */
  R.challenge = function (s) {
    const el = h('section', { class: 'slide' });
    el.appendChild(head(s, 'هل تستطيعين الإجابة قبل انتهاء الوقت؟'));
    const timer = createTimer(s.seconds || 60);
    const ul = h('ul', { class: 'ch-list' });
    (s.items || []).forEach(function (it, i) {
      const li = h('li');
      const btn = h('button', { class: 'ch-reveal', type: 'button', text: '👀 الإجابة' });
      btn.addEventListener('click', function () { li.classList.add('open'); btn.remove(); });
      li.appendChild(h('span', { class: 'ch-n', text: arNum(i + 1) }));
      li.appendChild(h('span', { class: 'ch-q', html: rich(it.q) }));
      li.appendChild(btn);
      li.appendChild(h('span', { class: 'ch-a', html: rich(it.a) }));
      ul.appendChild(rv(li, i + 2));
    });
    const allBtn = h('button', { class: 's-btn ghost', type: 'button', text: 'اكشفي كل الإجابات' });
    allBtn.addEventListener('click', function () {
      ul.querySelectorAll('li').forEach(function (li) { li.classList.add('open'); const b = li.querySelector('.ch-reveal'); if (b) b.remove(); });
    });
    const side = h('div', { style: 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px' }, [timer.el, allBtn]);
    el.appendChild(h('div', { class: 'ch-wrap' }, [ul, rv(side, 2)]));
    return el;
  };

  /* ١٨) المراجعة والتلخيص */
  R.review = function (s) {
    const el = h('section', { class: 'slide' });
    el.appendChild(head(s, 'ماذا تعلّمنا اليوم؟'));
    const grid = h('div', { class: 'review-grid' });
    (s.items || []).forEach(function (it, i) {
      grid.appendChild(rv(h('div', { class: 'review-item' }, [
        h('div', { class: 'ri-ico', text: it.icon || '⭐' }),
        h('div', {}, [h('b', { html: rich(it.title) }), it.text ? h('span', { html: rich(it.text) }) : null])
      ]), i + 2));
    });
    el.appendChild(grid);
    return el;
  };

  /* =========================================================
     الاستراتيجيات الإضافية
     ========================================================= */

  /* ٢٠) صِلي وطابقي: اختيار عنصر من القائمة الأولى ثم ما يناسبه من الثانية */
  R.match = function (s) {
    const el = h('section', { class: 'slide' });
    el.appendChild(head(s, 'صِلي كل عنصر بما يناسبه'));
    const pairs = s.pairs || [];
    const fb = h('div', { class: 'feedback', style: 'min-height:70px' });
    const colors = ['#7c3aed', '#f59e0b', '#ec4899', '#0ea5e9', '#10b981', '#ef4444', '#6366f1', '#84cc16'];
    const labels = s.labels || ['', ''];
    const colA = h('div', { class: 'match-col' }, labels[0] ? [h('h4', { html: rich(labels[0]) })] : []);
    const colB = h('div', { class: 'match-col' }, labels[1] ? [h('h4', { html: rich(labels[1]) })] : []);
    let sel = null;
    let done = 0;
    pairs.forEach(function (p, i) {
      const a = h('button', { class: 'match-item', type: 'button', 'data-k': i }, [h('span', { class: 'm-dot' }), h('span', { html: rich(p.a) })]);
      a.addEventListener('click', function () {
        if (a.classList.contains('done')) return;
        if (sel) sel.classList.remove('sel');
        sel = a;
        a.classList.add('sel');
      });
      colA.appendChild(rv(a, i + 2));
    });
    shuffle(pairs.map(function (_, i) { return i; })).forEach(function (k, j) {
      const b = h('button', { class: 'match-item', type: 'button' }, [h('span', { class: 'm-dot' }), h('span', { html: rich(pairs[k].b) })]);
      b.addEventListener('click', function () {
        if (b.classList.contains('done')) return;
        if (!sel) { shake(b); showFeedback(fb, false, 'اختاري أولًا عنصرًا من القائمة الأولى 👉'); return; }
        if (Number(sel.getAttribute('data-k')) === k) {
          const c = colors[done % colors.length];
          [sel, b].forEach(function (x) {
            x.classList.remove('sel');
            x.classList.add('done');
            x.style.setProperty('--mc', c);
            x.querySelector('.m-dot').textContent = arNum(done + 1);
          });
          sel = null;
          done++;
          if (done === pairs.length) celebrate(fb, 'أحسنتِ! 👏 طابقتِ جميع العناصر');
          else { soundDing(); showFeedback(fb, true, 'صحيح ✓'); }
        } else {
          shake(b);
          soundWrong();
          showFeedback(fb, false);
        }
      });
      colB.appendChild(rv(b, j + 2));
    });
    el.appendChild(h('div', { class: 's-body', style: 'gap:14px' }, [
      h('div', { class: 'match-wrap' }, [colA, h('div', { class: 'match-mid', text: '🔗' }), colB]), fb
    ]));
    return el;
  };

  /* ٢١) عجلة الأسئلة: تدور العجلة وتتوقف عند سؤال لم يُختر بعد */
  R.wheel = function (s) {
    const el = h('section', { class: 'slide' });
    el.appendChild(head(s, 'لِفّي العجلة… وأجيبي!'));
    const items = s.items || [];
    const n = items.length;
    const A = 360 / n;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 600 600');
    const fills = ['var(--p500)', 'var(--acc)', 'var(--p700)', 'var(--p300)', 'var(--p600)', 'var(--p400)', 'var(--p800)', 'var(--p200)'];
    const segs = [];
    function pt(deg, r) { const a = (deg - 90) * Math.PI / 180; return [300 + r * Math.cos(a), 300 + r * Math.sin(a)]; }
    items.forEach(function (_, i) {
      const p0 = pt(i * A, 290);
      const p1 = pt((i + 1) * A, 290);
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', 'M300 300 L' + p0[0] + ' ' + p0[1] + ' A290 290 0 ' + (A > 180 ? 1 : 0) + ' 1 ' + p1[0] + ' ' + p1[1] + ' Z');
      path.setAttribute('style', 'fill:' + fills[i % fills.length] + ';stroke:#fff;stroke-width:4;transition:opacity .3s');
      const tp = pt(i * A + A / 2, 200);
      const tx = document.createElementNS(NS, 'text');
      tx.setAttribute('x', tp[0]);
      tx.setAttribute('y', tp[1]);
      tx.setAttribute('text-anchor', 'middle');
      tx.setAttribute('dominant-baseline', 'central');
      tx.setAttribute('style', 'font:900 54px Tajawal,Tahoma,sans-serif;fill:#fff;paint-order:stroke;stroke:rgba(0,0,0,.25);stroke-width:3');
      tx.textContent = arNum(i + 1);
      svg.appendChild(path);
      svg.appendChild(tx);
      segs.push(path);
    });
    const box = h('div', { class: 'wheel-box' }, [h('div', { class: 'w-pointer' }), svg, h('div', { class: 'w-hub', text: s.icon || '🎡' })]);
    const cardN = h('div', { class: 'wc-n', text: 'جاهزات؟' });
    const cardQ = h('p', { class: 'wc-q', text: 'اضغطي «لِفّي العجلة» ليظهر السؤال 🎯' });
    const ans = h('div', { class: 'answer-box' });
    const showBtn = h('button', { class: 's-btn ghost', type: 'button', text: '👀 الإجابة', style: 'display:none' });
    showBtn.addEventListener('click', function () { ans.classList.toggle('show'); });
    const spinBtn = h('button', { class: 's-btn gold', type: 'button', text: '🎡 لِفّي العجلة' });
    const used = [];
    let rot = 0;
    let spinning = false;
    spinBtn.addEventListener('click', function () {
      if (spinning) return;
      const left = items.map(function (_, i) { return i; }).filter(function (i) { return used.indexOf(i) === -1; });
      if (!left.length) return;
      ctx();
      spinning = true;
      spinBtn.disabled = true;
      ans.classList.remove('show');
      showBtn.style.display = 'none';
      const k = left[Math.floor(Math.random() * left.length)];
      const target = 360 - (k * A + A / 2);
      const cur = ((rot % 360) + 360) % 360;
      rot += 360 * 5 + ((target - cur + 360) % 360);
      svg.style.transform = 'rotate(' + rot + 'deg)';
      // نقرات تتباطأ مع دوران العجلة
      let t = 0;
      let d = 60;
      while (t < 3900) { setTimeout(soundTick, t); t += d; d *= 1.12; }
      const tid = setTimeout(function () {
        spinning = false;
        used.push(k);
        segs[k].style.opacity = '.35';
        cardN.textContent = 'السؤال رقم ' + arNum(k + 1);
        cardQ.innerHTML = rich(items[k].q);
        ans.innerHTML = rich(items[k].a || '');
        showBtn.style.display = items[k].a ? '' : 'none';
        soundSuccess();
        const remain = n - used.length;
        spinBtn.disabled = remain === 0;
        spinBtn.textContent = remain ? '🎡 لِفّي مرة أخرى' : '🎉 انتهت الأسئلة';
        setTimeout(fitSlide, 40);
      }, 4300);
      cleanups.push(function () { clearTimeout(tid); });
    });
    const card = h('div', { class: 'wheel-card' }, [cardN, cardQ, h('div', { class: 'wc-actions' }, [spinBtn, showBtn]), ans]);
    el.appendChild(h('div', { class: 'wheel-wrap' }, [rv(box, 2), rv(card, 3)]));
    return el;
  };

  /* ٢٢) الصناديق الغامضة: كل صندوق يخفي سؤالًا أو مفاجأة */
  R.boxes = function (s) {
    const el = h('section', { class: 'slide' });
    el.appendChild(head(s, 'اختاري صندوقًا… واكتشفي ما بداخله!'));
    const items = s.items || [];
    const grid = h('div', { class: 'boxes-grid c' + (s.cols || (items.length > 6 ? 4 : 3)) });
    const overlay = h('div', { class: 'box-overlay' });
    const icon = s.icon || '🎁';
    function close() { overlay.classList.remove('open'); overlay.innerHTML = ''; }
    items.forEach(function (it, i) {
      const b = h('button', { class: 'mbox', type: 'button' }, [h('span', { class: 'mb-ico', text: icon }), h('span', { class: 'mb-n', text: arNum(i + 1) })]);
      b.addEventListener('click', function () {
        const card = h('div', { class: 'box-card' });
        card.appendChild(h('div', { class: 'bc-n', text: icon + ' الصندوق ' + arNum(i + 1) }));
        if (it.bonus) {
          card.appendChild(h('div', { class: 'bc-bonus', html: rich(it.bonus) }));
          setTimeout(function () { confetti(); clap(); }, 150);
        } else {
          card.appendChild(h('p', { class: 'bc-q', html: rich(it.q) }));
          if (it.a) card.appendChild(revealButton(it.a));
        }
        card.appendChild(h('div', { class: 'bc-actions' }, [h('button', { class: 's-btn', type: 'button', text: '✔ تم — أغلقي الصندوق', onclick: close })]));
        overlay.innerHTML = '';
        overlay.appendChild(card);
        overlay.classList.add('open');
        b.classList.add('opened');
        b.querySelector('.mb-ico').textContent = it.bonus ? '🌟' : '✔️';
        soundDing();
      });
      grid.appendChild(rv(b, i + 2));
    });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    el.appendChild(grid);
    el.appendChild(overlay);
    return el;
  };

  /* ٢٣) مسابقة الفريقين: لوحة نقاط وأسئلة متتابعة */
  R.teams = function (s) {
    const el = h('section', { class: 'slide' });
    el.appendChild(head(s, 'من سيفوز اليوم؟'));
    const names = s.teams || ['🟣 الفريق الأول', '🟡 الفريق الثاني'];
    const items = s.items || [];
    const scores = [0, 0];
    const cards = names.slice(0, 2).map(function (nm, t) {
      const sc = h('div', { class: 'tm-score', text: '0' });
      const card = h('div', { class: 'team-card t' + (t + 1) }, [
        h('div', { class: 'tm-name', html: rich(nm) }), sc,
        h('div', { class: 'tm-btns' }, [
          h('button', { type: 'button', text: '−', title: 'إنقاص نقطة', onclick: function () { add(t, -1); } }),
          h('button', { type: 'button', text: '+١', title: 'إضافة نقطة', onclick: function () { add(t, 1); } })
        ])
      ]);
      card._sc = sc;
      return card;
    });
    function add(t, d) {
      scores[t] = Math.max(0, scores[t] + d);
      cards[t]._sc.textContent = String(scores[t]);   // أرقام لاتينية: الصفر العربي يبدو كنقطة في الحجم الكبير
      cards[0].classList.toggle('lead', scores[0] > scores[1]);
      cards[1].classList.toggle('lead', scores[1] > scores[0]);
      if (d > 0) { soundDing(); cards[t].animate([{ transform: 'scale(1.06)' }, { transform: 'none' }], { duration: 300 }); }
    }
    let qi = 0;
    const qn = h('div', { class: 'tq-n' });
    const qq = h('p', { class: 'tq-q' });
    const ans = h('div', { class: 'answer-box' });
    const showBtn = h('button', { class: 's-btn ghost', type: 'button', text: '👀 الإجابة', onclick: function () { ans.classList.toggle('show'); } });
    const nextBtn = h('button', { class: 's-btn', type: 'button' });
    function draw() {
      if (qi >= items.length) {
        const w = scores[0] === scores[1] ? 'تعادل رائع! 🤝 الفريقان أبطال' : 'الفائز: ' + names[scores[0] > scores[1] ? 0 : 1] + ' 🏆';
        qn.textContent = 'انتهت المسابقة';
        qq.innerHTML = rich(w);
        ans.classList.remove('show');
        showBtn.style.display = 'none';
        nextBtn.style.display = 'none';
        celebrate(null);
        clap();
        return;
      }
      qn.textContent = 'السؤال ' + arNum(qi + 1) + ' من ' + arNum(items.length);
      qq.innerHTML = rich(items[qi].q);
      ans.innerHTML = rich(items[qi].a || '');
      ans.classList.remove('show');
      showBtn.style.display = items[qi].a ? '' : 'none';
      nextBtn.textContent = qi === items.length - 1 ? '🏁 إنهاء المسابقة' : 'السؤال التالي ⟵';
    }
    nextBtn.addEventListener('click', function () { qi++; draw(); });
    draw();
    const mid = h('div', { class: 'team-q' }, [qn, qq, h('div', { class: 'tq-actions' }, [showBtn, nextBtn]), ans]);
    el.appendChild(h('div', { class: 'teams-wrap' }, [rv(cards[0], 2), rv(mid, 3), rv(cards[1], 4)]));
    return el;
  };

  /* ٢٤) أكملي الفراغ: الكلمات المطلوبة تُكتب بين [[ ]] في النص */
  R.fill = function (s) {
    const el = h('section', { class: 'slide' });
    el.appendChild(head(s, 'أكملي الفراغات من بنك الكلمات'));
    const parts = String(s.text || '').split(/\[\[(.+?)\]\]/);
    const p = h('p', { class: 'fill-text' });
    const blanks = [];
    parts.forEach(function (part, i) {
      if (i % 2 === 0) { p.appendChild(document.createTextNode(part)); return; }
      const b = h('button', { class: 'blank', type: 'button', text: '؟' });
      b._ans = part;
      b.addEventListener('click', function () { if (!b.classList.contains('filled')) setActive(b); });
      blanks.push(b);
      p.appendChild(b);
    });
    let active = null;
    function setActive(b) {
      blanks.forEach(function (x) { x.classList.remove('active'); });
      active = b;
      if (b) b.classList.add('active');
    }
    setActive(blanks[0] || null);
    const fb = h('div', { class: 'feedback', style: 'min-height:70px' });
    const bank = h('div', { class: 'fill-bank' });
    const words = shuffle(blanks.map(function (b) { return b._ans; }).concat(s.extras || []));
    let filled = 0;
    words.forEach(function (w) {
      const chip = h('button', { class: 'chip', type: 'button', html: rich(w) });
      chip.addEventListener('click', function () {
        if (!active) return;
        if (w === active._ans) {
          active.textContent = w;
          active.classList.add('filled');
          active.classList.remove('active');
          chip.classList.add('used');
          filled++;
          const nextBlank = blanks.find(function (x) { return !x.classList.contains('filled'); });
          setActive(nextBlank || null);
          if (filled === blanks.length) celebrate(fb, 'أحسنتِ! 👏 أكملتِ جميع الفراغات');
          else { soundDing(); showFeedback(fb, true, 'صحيح ✓'); }
        } else {
          shake(chip);
          shake(active);
          soundWrong();
          showFeedback(fb, false);
        }
      });
      bank.appendChild(chip);
    });
    el.appendChild(h('div', { class: 's-body', style: 'justify-content:center;gap:26px' }, [rv(p, 2), rv(bank, 3), fb]));
    return el;
  };

  /* ٢٥) بطاقة الخروج 3-2-1 للتقييم الختامي */
  R.exit = function (s) {
    const el = h('section', { class: 'slide' });
    el.appendChild(head(s, 'قبل أن نغادر… اكتبي على بطاقتك'));
    const prompts = s.prompts || [
      { icon: '🧠', text: 'أشياء تعلّمتِها اليوم' },
      { icon: '💡', text: 'معلومتان أعجبتاكِ' },
      { icon: '❓', text: 'سؤال ما زال لديكِ' }
    ];
    const nums = ['٣', '٢', '١'];
    const timer = createTimer(s.seconds || 120);
    timer.el.classList.add('mini');
    const cards = prompts.slice(0, 3).map(function (pr, i) {
      return rv(h('div', { class: 'exit-card' }, [
        h('div', { class: 'ex-num', text: nums[i] }),
        h('div', { class: 'ex-ico', text: pr.icon || '✍️' }),
        h('p', { html: rich(pr.text) })
      ]), i + 2);
    });
    el.appendChild(h('div', { class: 'exit-wrap' }, cards.concat([rv(timer.el, 5)])));
    return el;
  };

  /* ٢٦) محاكي VS Code: محرر حقيقي قابل للكتابة + معاينة مباشرة + تحقق تلقائي */
  function langOf(name) {
    const ext = String(name).split('.').pop().toLowerCase();
    return ext === 'css' ? 'css' : (ext === 'js' ? 'js' : 'html');
  }
  function reEscape(str) { return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  /* دمج الملفات في صفحة واحدة للمعاينة: ملف CSS يُطبّق فقط إذا رُبط بوسم link، وملف JS إذا رُبط بوسم script */
  function buildDoc(files) {
    const main = files.find(function (f) { return langOf(f.name) === 'html'; });
    let doc = main ? main.code : '';
    files.forEach(function (f) {
      const lg = langOf(f.name);
      if (lg === 'css') {
        doc = doc.replace(new RegExp('<link[^>]*href=["\']' + reEscape(f.name) + '["\'][^>]*>', 'i'), function () { return '<style>' + f.code + '</style>'; });
      } else if (lg === 'js') {
        doc = doc.replace(new RegExp('<script[^>]*src=["\']' + reEscape(f.name) + '["\'][^>]*>\\s*</script>', 'i'), function () { return '<script>' + f.code + '<\/script>'; });
      }
    });
    if (!/<html/i.test(doc)) {
      doc = '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>body{font-family:Tahoma,Arial,sans-serif;font-size:20px;margin:14px;}</style></head><body>' + doc + '</body></html>';
    }
    return doc;
  }
  R.vscode = function (s) {
    const el = h('section', { class: 'slide', style: 'padding-top:56px' });
    el.appendChild(head(Object.assign({}, s, { subtitle: '' }), ''));
    const files = (s.files || [{ name: 'index.html', code: '' }]).map(function (f) { return { name: f.name, code: f.code || '' }; });
    const original = files.map(function (f) { return f.code; });
    let cur = 0;

    // شريط المهمة وأزرار التحكم
    const fb = h('div', { class: 'feedback vsc-feedback' });
    const runBtn = h('button', { class: 's-btn', type: 'button', text: '▶ تشغيل' });
    const checkBtn = h('button', { class: 's-btn gold', type: 'button', text: '✅ تحقّقي' });
    const hintBtn = h('button', { class: 's-btn ghost', type: 'button', text: '💡 تلميح' });
    const solBtn = h('button', { class: 's-btn ghost', type: 'button', text: '✨ الحل' });
    const resetBtn = h('button', { class: 's-btn ghost', type: 'button', text: '↺', title: 'إعادة الكود الأصلي' });
    if (!s.checks) checkBtn.style.display = 'none';
    if (!s.hint) hintBtn.style.display = 'none';
    if (!s.solution) solBtn.style.display = 'none';
    const top = h('div', { class: 'vsc-top' }, [
      h('div', { class: 'vsc-task', html: '🎯 ' + rich(s.task || 'جرّبي تعديل الكود وشاهدي النتيجة مباشرة') }),
      runBtn, checkBtn, hintBtn, solBtn, resetBtn
    ]);

    // نافذة المحرر
    const fileBtns = [];
    const tabs = h('div', { class: 'vsc-tabs' });
    const explorer = h('div', { class: 'vsc-explorer' }, [h('div', { class: 'ex-h', text: 'EXPLORER' }), h('div', { class: 'ex-folder', text: '⌄ ' + (s.folder || 'MY-SITE') })]);
    files.forEach(function (f, i) {
      const lg = langOf(f.name);
      const badge = lg === 'html' ? '<>' : (lg === 'css' ? '#' : 'JS');
      const fbtn = h('button', { class: 'vsc-file', type: 'button' }, [h('span', { class: 'fi ' + lg, text: badge }), f.name]);
      fbtn.addEventListener('click', function () { openFile(i); });
      explorer.appendChild(fbtn);
      fileBtns.push(fbtn);
    });
    const gutter = h('div', { class: 'vsc-gutter' });
    const hl = h('pre', { class: 'vsc-hl' });
    const ta = h('textarea', { class: 'vsc-ta', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', wrap: 'off', 'aria-label': 'محرر الكود', dir: 'ltr' });
    const area = h('div', { class: 'vsc-area' }, [hl, ta]);
    const posEl = h('span', { text: 'Ln 1, Col 1' });
    const langEl = h('span');
    const frame = h('iframe', { title: 'المعاينة', sandbox: 'allow-scripts allow-modals' });
    const pvFrame = h('div', { class: 'pv-frame' }, [frame]);
    const pvBar = h('div', { class: 'pv-bar' }, [
      h('span', { text: '⟳' }), h('span', { class: 'url', text: '🔒 127.0.0.1:5500/' + (files[0] ? files[0].name : 'index.html') })
    ]);
    // أزرار الأجهزة: تُعرض الصفحة بعرض الجهاز الحقيقي ثم تُصغَّر لتناسب لوحة المعاينة
    let device = 0;
    function applyDevice() {
      if (!device) { frame.style.width = ''; frame.style.height = ''; frame.style.transform = ''; return; }
      const W = pvFrame.clientWidth || 1;
      const H = pvFrame.clientHeight || 1;
      const sc = Math.min(1, W / device);
      frame.style.width = device + 'px';
      frame.style.height = (H / sc) + 'px';
      frame.style.transform = 'scale(' + sc + ')';
    }
    if (s.devices) {
      pvFrame.classList.add('devices');
      [['📱', 360], ['📟', 768], ['💻', 1100]].forEach(function (d, i) {
        const b = h('button', { type: 'button', text: d[0] + ' ' + d[1], class: i === 2 ? 'on' : '' });
        b.addEventListener('click', function () {
          device = d[1];
          applyDevice();
          pvBar.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on');
          posEl.textContent = 'Viewport: ' + d[1] + 'px';
        });
        pvBar.appendChild(b);
      });
      device = 1100;
      requestAnimationFrame(applyDevice);
    }
    const win = h('div', { class: 'vsc' }, [
      h('div', { class: 'vsc-title' }, [
        h('span', { class: 'dots' }, [h('i', { style: 'background:#ff5f57' }), h('i', { style: 'background:#febc2e' }), h('i', { style: 'background:#28c840' })]),
        h('span', { class: 'ttl', text: (s.folder || 'my-site') + ' — Visual Studio Code' })
      ]),
      h('div', { class: 'vsc-main' }, [
        h('div', { class: 'vsc-activity' }, [h('span', { class: 'on', text: '📄' }), h('span', { text: '🔍' }), h('span', { text: '⑂' }), h('span', { text: '🧩' })]),
        explorer,
        h('div', { class: 'vsc-editor' }, [tabs, h('div', { class: 'vsc-code allow-scroll' }, [gutter, area])]),
        h('div', { class: 'vsc-preview' }, [pvBar, pvFrame])
      ]),
      h('div', { class: 'vsc-status' }, [h('span', { text: '⑂ main' }), h('span', { text: '⊗ 0  ⚠ 0' }), h('span', { class: 'sp' }), posEl, h('span', { text: 'UTF-8' }), langEl, h('span', { text: '📡 Port : 5500' })])
    ]);

    function paint() {
      const f = files[cur];
      hl.innerHTML = highlight(f.code, langOf(f.name)) + '\n';
      const lines = f.code.split('\n').length;
      let g = '';
      for (let i = 1; i <= lines; i++) g += '<div>' + i + '</div>';
      gutter.innerHTML = g;
      syncScroll();
    }
    function syncScroll() {
      hl.style.transform = 'translate(' + (-ta.scrollLeft) + 'px,' + (-ta.scrollTop) + 'px)';
      gutter.style.transform = 'translateY(' + (-ta.scrollTop) + 'px)';
    }
    function updatePos() {
      const before = ta.value.slice(0, ta.selectionStart).split('\n');
      posEl.textContent = 'Ln ' + before.length + ', Col ' + (before[before.length - 1].length + 1);
    }
    function openFile(i) {
      cur = i;
      tabs.innerHTML = '';
      files.forEach(function (f, j) {
        const lg = langOf(f.name);
        const t = h('button', { class: 'vsc-tab' + (j === i ? ' on' : ''), type: 'button' }, [h('span', { class: 'fi ' + lg, text: lg === 'html' ? '<>' : (lg === 'css' ? '#' : 'JS') }), f.name]);
        t.addEventListener('click', function () { openFile(j); });
        tabs.appendChild(t);
      });
      fileBtns.forEach(function (b, j) { b.classList.toggle('on', j === i); });
      ta.value = files[i].code;
      ta.scrollTop = 0;
      ta.scrollLeft = 0;
      langEl.textContent = { html: 'HTML', css: 'CSS', js: 'JavaScript' }[langOf(files[i].name)];
      paint();
      updatePos();
    }
    function run() { frame.srcdoc = buildDoc(files); }
    let liveTimer = null;
    ta.addEventListener('input', function () {
      files[cur].code = ta.value;
      paint();
      updatePos();
      fb.innerHTML = '';
      if (s.live !== false) { clearTimeout(liveTimer); liveTimer = setTimeout(run, 600); }
    });
    ta.addEventListener('scroll', syncScroll);
    ta.addEventListener('click', updatePos);
    ta.addEventListener('keyup', updatePos);
    ta.addEventListener('keydown', function (e) {
      // Tab يضيف مسافتين، و Enter يحافظ على المسافة البادئة كما في VS Code
      if (e.key === 'Tab') {
        e.preventDefault();
        document.execCommand('insertText', false, '  ');
      } else if (e.key === 'Enter') {
        const line = ta.value.slice(0, ta.selectionStart).split('\n').pop();
        const indent = (line.match(/^\s*/) || [''])[0];
        e.preventDefault();
        document.execCommand('insertText', false, '\n' + indent);
      }
    });
    cleanups.push(function () { clearTimeout(liveTimer); });
    runBtn.addEventListener('click', function () { run(); soundDing(); });
    resetBtn.addEventListener('click', function () {
      files.forEach(function (f, i) { f.code = original[i]; });
      openFile(cur);
      run();
      fb.innerHTML = '';
    });
    hintBtn.addEventListener('click', function () { showFeedback(fb, true, '💡 ' + s.hint); });
    solBtn.addEventListener('click', function () {
      Object.keys(s.solution).forEach(function (name) {
        const f = files.find(function (x) { return x.name === name; });
        if (f) f.code = s.solution[name];
      });
      openFile(cur);
      run();
    });
    checkBtn.addEventListener('click', function () {
      run();
      const all = files.map(function (f) { return f.code; }).join('\n');
      const fail = (s.checks || []).find(function (c) {
        const src = c.file ? (files.find(function (f) { return f.name === c.file; }) || { code: '' }).code : all;
        const ok = new RegExp(c.test, 'i').test(src);
        return c.not ? ok : !ok;
      });
      if (fail) { soundWrong(); shake(win); showFeedback(fb, false, 'حاولي مرة أخرى 💜 — ' + fail.msg); }
      else celebrate(fb, s.success || 'أحسنتِ! 👏 الكود يعمل كما هو مطلوب');
    });
    openFile(0);
    run();
    el.appendChild(h('div', { class: 's-body', style: 'gap:0' }, [rv(top, 1), rv(win, 2), fb]));
    return el;
  };

  /* ١٩) الشريحة الختامية التحفيزية */
  R.closing = function (s) {
    const el = h('section', { class: 'slide dark' });
    const done = classId && Store.isCompleted(classId, lesson.id);
    const markBtn = h('button', { class: 's-btn light', type: 'button', text: done ? '✔ الدرس مسجّل كمنجز' : '✔ تسجيل الدرس كمنجز' });
    markBtn.addEventListener('click', function () {
      if (!classId || !Store.getClass(classId)) {
        Store.toast('اختاري فصلًا من الصفحة الرئيسية أولًا', true);
        return;
      }
      Store.markCompleted(classId, lesson.id);
      markBtn.textContent = '✔ الدرس مسجّل كمنجز';
      Store.toast('تم تسجيل الدرس كمنجز لفصل ' + Store.getClass(classId).name + ' ✓');
    });
    const list = allLessons();
    const pos = list.findIndex(function (x) { return x.id === lesson.id; });
    const nextL = list[pos + 1];
    const actions = h('div', { class: 'closing-actions' }, [
      h('button', { class: 's-btn gold', type: 'button', text: '👏 صفّقن لأنفسكن', onclick: clap }),
      markBtn,
      nextL ? h('button', { class: 's-btn ghost', type: 'button', text: 'الدرس التالي ⟵', onclick: function () { go('presentation.html?lesson=' + nextL.id + (classId ? '&class=' + encodeURIComponent(classId) : '')); } }) : null
    ]);
    el.appendChild(h('div', { class: 'closing-wrap' }, [
      rv(h('div', { class: 'c-emoji', text: s.emoji || '🌟' }), 0),
      rv(h('h2', { html: rich(s.title || 'أحسنتنّ يا مبدعات!') }), 1),
      rv(h('p', { html: rich(s.message || '') }), 2),
      rv(actions, 3)
    ]));
    return el;
  };

  /* =========================================================
     شبكة أمان: ملاءمة محتوى الشريحة لمساحة المسرح
     إذا تجاوز المحتوى أسفل الشريحة (مثلًا بعد كشف إجابة طويلة أو تعديل المعلمة للنصوص)
     يُصغَّر جسم الشريحة تدريجيًا حتى ٧٥٪ بدل أن يخرج عن الشاشة.
     القياس يتم على نسخة مخفية بدون حركات حتى لا تؤثر حركات الظهور على النتيجة.
     ========================================================= */
  const FIT_LIMIT = STAGE_H - 100;   // أقصى حد سفلي مسموح للمحتوى
  let fitZoom = 1;
  function contentBottom(root) {
    const top = root.getBoundingClientRect().top;
    let max = 0;
    root.querySelectorAll('*').forEach(function (el) {
      const cs = getComputedStyle(el);
      if (cs.position === 'absolute' || cs.position === 'fixed' || cs.display === 'none') return;
      const r = el.getBoundingClientRect();
      if (!r.height) return;
      max = Math.max(max, r.bottom - top);
    });
    return max / scale;
  }
  function fitSlide() {
    const el = stage.querySelector('.slide');
    if (!el) return;
    const kids = function (root) {
      return Array.prototype.filter.call(root.children, function (c) { return !c.classList.contains('s-head'); });
    };
    const probe = el.cloneNode(true);
    probe.className = probe.className.replace(/\bt-[\w-]+/g, '') + ' measuring';
    probe.querySelectorAll('iframe').forEach(function (f) { f.removeAttribute('srcdoc'); });
    kids(probe).forEach(function (k) { k.style.zoom = ''; });
    stage.appendChild(probe);
    let z = 1;
    for (let i = 0; i < 6 && contentBottom(probe) > FIT_LIMIT; i++) {
      z = Math.round((z - 0.05) * 100) / 100;
      kids(probe).forEach(function (k) { k.style.zoom = z; });
    }
    probe.remove();
    fitZoom = z;
    kids(el).forEach(function (k) { k.style.zoom = z < 1 ? z : ''; });
  }
  // إعادة الملاءمة بعد أي تفاعل داخل الشريحة (كشف إجابة، قلب بطاقة، إضافة فكرة...)
  stage.addEventListener('click', function () { setTimeout(fitSlide, 40); });
  stage.addEventListener('keyup', function (e) { if (e.key === 'Enter') setTimeout(fitSlide, 40); });

  /* =========================================================
     التنقل بين الشرائح
     ========================================================= */
  function render(dir) {
    cleanups.forEach(function (fn) { try { fn(); } catch (e) { /* تجاهل */ } });
    cleanups = [];
    const s = slides[index];
    const builder = R[s.type];
    let el;
    try {
      el = builder ? builder(s) : h('section', { class: 'slide' }, [h('h2', { class: 's-title', text: 'نوع شريحة غير معروف: ' + s.type })]);
    } catch (e) {
      console.error('خطأ في بناء الشريحة', index + 1, e);
      el = h('section', { class: 'slide' }, [h('h2', { class: 's-title', text: 'تعذّر عرض هذه الشريحة — راجعي بياناتها في lessons.js' })]);
    }
    let t = s.transition || (s.type === 'welcome' || s.type === 'closing' ? 'zoom' : (dir < 0 ? 'slide-back' : 'slide'));
    if (t === 'slide' && dir < 0) t = 'slide-back';
    el.classList.add('t-' + t);
    stage.innerHTML = '';
    stage.appendChild(el);
    fitSlide();
    counterLabel.textContent = (index + 1) + ' / ' + slides.length;
    progressBar.style.width = ((index + 1) / slides.length * 100) + '%';
    try { history.replaceState(null, '', '#' + (index + 1)); } catch (e) { /* تجاهل */ }
  }
  function next() { if (index < slides.length - 1) { index++; render(1); } }
  function prev() { if (index > 0) { index--; render(-1); } }
  function goTo(i) { const d = i > index ? 1 : -1; index = Math.max(0, Math.min(slides.length - 1, i)); render(d); }
  function go(url) { location.href = url; }
  function home() { go('index.html'); }

  /* ملء الشاشة */
  function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else document.exitFullscreen();
    } catch (e) { /* المتصفح لا يدعم */ }
  }

  /* ملاءمة المسرح لحجم الشاشة مع الحفاظ على نسبة 16:9 */
  function fit() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    scale = Math.min(W / STAGE_W, H / STAGE_H);
    const x = (W - STAGE_W * scale) / 2;
    const y = (H - STAGE_H * scale) / 2;
    stage.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')';
  }

  /* =========================================================
     قرعة الأسماء 🎲
     ========================================================= */
  const pk = {
    back: $('#picker'),
    name: $('#pkName'),
    cls: $('#pkClass'),
    stats: $('#pkStats'),
    result: $('#pkResult'),
    draw: $('#pkDraw'),
    point: $('#pkPoint'),
    correct: $('#pkCorrect'),
    reset: $('#pkReset'),
    close: $('#pkClose')
  };
  let current = null;     // الطالبة المختارة حاليًا
  let spinning = false;

  function pickerStats() {
    const c = Store.getClass(classId);
    if (!c) return;
    const rem = Store.pickerRemaining(classId);
    pk.stats.textContent = 'المتبقيات في هذه الجولة: ' + arNum(rem) + ' من ' + arNum(c.students.length);
  }
  function openPicker() {
    ctx();
    const c = Store.getClass(classId);
    pk.back.classList.add('open');
    current = null;
    pk.result.textContent = '';
    pk.point.disabled = true;
    pk.correct.disabled = true;
    pk.name.className = 'pk-name';
    if (!c || !c.students.length) {
      pk.cls.textContent = c ? c.name : 'لم يتم اختيار فصل';
      pk.name.innerHTML = '<span style="font-size:1.4rem;color:var(--muted);font-weight:700;line-height:1.8">' +
        (c ? 'لا توجد طالبات في هذا الفصل بعد.' : 'اختاري الفصل من الصفحة الرئيسية قبل بدء العرض.') +
        '<br><a href="dashboard.html" target="_blank">أضيفي الطالبات من لوحة التحكم ⟵</a></span>';
      pk.draw.disabled = true;
      pk.reset.disabled = true;
      pk.stats.textContent = '';
      return;
    }
    pk.draw.disabled = false;
    pk.reset.disabled = false;
    pk.cls.textContent = 'الفصل: ' + c.name;
    pk.name.textContent = '🎲';
    pickerStats();
    pk.draw.focus();
  }
  function closePicker() { pk.back.classList.remove('open'); }
  function drawName() {
    if (spinning) return;
    const c = Store.getClass(classId);
    if (!c || !c.students.length) return;
    const res = Store.drawStudent(classId);
    if (!res) return;
    spinning = true;
    current = res.student;
    pk.draw.disabled = true;
    pk.point.disabled = true;
    pk.correct.disabled = true;
    pk.point.textContent = '+١ نقطة';
    pk.correct.textContent = 'إجابة صحيحة ✓';
    pk.result.textContent = res.restarted ? '🔄 بدأت جولة جديدة — اختيرت جميع الطالبات' : '';
    pk.name.className = 'pk-name spinning';
    // تبديل سريع للأسماء ثم تباطؤ تدريجي حتى يظهر الاسم النهائي
    const names = c.students.map(function (s) { return s.name; });
    let delay = 40;
    let steps = 0;
    (function spin() {
      pk.name.textContent = names[Math.floor(Math.random() * names.length)];
      soundTick();
      steps++;
      delay *= 1.1;
      if (steps < 22) setTimeout(spin, delay);
      else {
        pk.name.className = 'pk-name final';
        pk.name.textContent = '🌟 ' + current.name;
        soundSuccess();
        spinning = false;
        pk.draw.disabled = false;
        pk.draw.textContent = '🎲 اسم آخر';
        pk.point.disabled = false;
        pk.correct.disabled = false;
        pickerStats();
      }
    })();
  }
  pk.draw.addEventListener('click', drawName);
  pk.point.addEventListener('click', function () {
    if (!current) return;
    Store.bumpStudent(classId, current.id, 'points', 1);
    pk.point.disabled = true;
    pk.point.textContent = '✓ أُضيفت نقطة';
    pk.result.textContent = 'رصيد ' + current.name + ': ' + arNum(Store.findStudent(classId, current.id).points) + ' نقطة';
    soundDing();
  });
  pk.correct.addEventListener('click', function () {
    if (!current) return;
    Store.bumpStudent(classId, current.id, 'correct', 1);
    pk.correct.disabled = true;
    pk.correct.textContent = '✓ سُجّلت';
    pk.result.textContent = 'إجابات ' + current.name + ' الصحيحة: ' + arNum(Store.findStudent(classId, current.id).correct);
    confetti();
    soundSuccess();
  });
  pk.reset.addEventListener('click', function () {
    Store.resetPicker(classId);
    pk.name.className = 'pk-name';
    pk.name.textContent = '🎲';
    pk.draw.textContent = '🎲 اسحبي اسمًا';
    pk.result.textContent = '🔄 بدأت جولة جديدة';
    current = null;
    pk.point.disabled = true;
    pk.correct.disabled = true;
    pickerStats();
  });
  pk.close.addEventListener('click', closePicker);
  pk.back.addEventListener('click', function (e) { if (e.target === pk.back) closePicker(); });

  /* =========================================================
     لوحة المفاتيح والماوس
     ========================================================= */
  function isTyping(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTyping(e)) {
      if (e.key === 'Escape') e.target.blur();
      return;
    }
    const pickerOpen = pk.back.classList.contains('open');
    const k = e.key;
    if (k === 'Escape') {
      e.preventDefault();
      const ov = stage.querySelector('.box-overlay.open');
      if (pickerOpen) closePicker();
      else if (ov) { ov.classList.remove('open'); ov.innerHTML = ''; }
      else home();
      return;
    }
    if (k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'Spacebar') {
      e.preventDefault();
      if (pickerOpen) { if (k === ' ') drawName(); return; }
      next();
    } else if (k === 'ArrowLeft' || k === 'PageUp') {
      e.preventDefault();
      if (!pickerOpen) prev();
    } else if (k === 'ArrowUp' || k === 'ArrowDown') {
      e.preventDefault();      // منع تمرير الصفحة
    } else if (k === 'Home') {
      e.preventDefault(); goTo(0);
    } else if (k === 'End') {
      e.preventDefault(); goTo(slides.length - 1);
    } else if (e.code === 'KeyF' || k === 'f' || k === 'F') {
      e.preventDefault(); toggleFullscreen();
    } else if (k === 'ت' || k === 't' || k === 'T') {
      e.preventDefault(); clap();
    } else if (k === 'ق' || k === 'q' || k === 'Q') {
      e.preventDefault();
      if (pickerOpen) closePicker(); else openPicker();
    }
  });

  /* إخفاء شريط التحكم والمؤشر عند عدم تحريك الماوس */
  let idleTimer = null;
  function wake() {
    controls.classList.remove('hidden');
    hint.classList.remove('hidden');
    document.body.classList.remove('hide-cursor');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () {
      if (controls.matches(':hover')) return wake();
      controls.classList.add('hidden');
      hint.classList.add('hidden');
      document.body.classList.add('hide-cursor');
    }, 2600);
  }
  document.addEventListener('mousemove', wake);
  document.addEventListener('pointerdown', wake);

  /* بعد الضغط داخل معاينة الكود (iframe) يبقى التركيز فيها فتتوقف اختصارات لوحة المفاتيح؛
     لذلك نعيد التركيز إلى العرض بعد لحظة قصيرة (تكون نقرة المعاينة قد نُفّذت) */
  window.addEventListener('blur', function () {
    setTimeout(function () {
      const a = document.activeElement;
      if (a && a.tagName === 'IFRAME') { a.blur(); window.focus(); }
    }, 350);
  });

  /* منع تمرير الصفحة بعجلة الماوس */
  document.addEventListener('wheel', function (e) {
    if (isTyping(e) || (e.target.closest && e.target.closest('.allow-scroll'))) return;
    e.preventDefault();
  }, { passive: false });

  /* أزرار شريط التحكم */
  $('#btnPrev').addEventListener('click', prev);
  $('#btnNext').addEventListener('click', next);
  $('#btnClap').addEventListener('click', clap);
  $('#btnPick').addEventListener('click', openPicker);
  $('#btnHome').addEventListener('click', home);
  $('#btnFull').addEventListener('click', toggleFullscreen);

  window.addEventListener('resize', fit);

  /* الانتقال لشريحة برقمها عند تعديل الرابط يدويًا (مثل ‎#9) */
  window.addEventListener('hashchange', function () {
    const n = parseInt((location.hash || '').slice(1), 10);
    if (n > 0 && n <= slides.length && n - 1 !== index) goTo(n - 1);
  });

  /* =========================================================
     بدء التشغيل
     ========================================================= */
  function init() {
    fit();
    const found = findLesson(lessonId);
    if (!found) {
      stage.style.display = 'none';
      controls.style.display = 'none';
      hint.style.display = 'none';
      document.body.appendChild(h('div', { class: 'not-found' }, [
        h('div', {}, [
          h('div', { text: '📚', style: 'font-size:4rem' }),
          h('h1', { text: 'لم يتم العثور على الدرس' }),
          h('a', { class: 'btn gold', href: 'index.html', text: 'العودة إلى مكتبة الدروس' })
        ])
      ]));
      return;
    }
    lesson = found.lesson;
    unit = found.unit;
    stage.classList.add('theme-' + (unit.theme || unit.id));   // ثيم الوحدة
    slides = (lesson.slides || []).slice();
    if (!slides.length || slides[0].type !== 'welcome') slides.unshift({ type: 'welcome' });
    if (slides[slides.length - 1].type !== 'closing') slides.push({ type: 'closing' });
    document.title = lesson.title + ' — ' + (data.book ? data.book.subject : 'عرض تفاعلي');
    const fromHash = parseInt((location.hash || '').slice(1), 10);
    index = fromHash > 0 && fromHash <= slides.length ? fromHash - 1 : 0;
    render(1);
    wake();
  }
  init();
})();
