/* =========================================================
   dashboard.js — منطق لوحة تحكم المعلمة
   - بيانات المعلمة، الفصول، الطالبات، الدروس المنجزة، الإحصائيات
   - كل تعديل يُحفظ تلقائيًا وتظهر رسالة "تم الحفظ ✓"
   ========================================================= */

(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };
  const data = window.LESSONS_DATA || { units: [] };
  const esc = function (s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  const arNum = function (n) { return String(n).replace(/\d/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }); };

  // الفصل المفتوح حاليًا في قسم الطالبات
  let activeClassId = '';

  Store.enableSaveToast();

  /* قائمة جميع الدروس مسطّحة */
  function allLessons() {
    const list = [];
    data.units.forEach(function (u, ui) {
      u.lessons.forEach(function (l, li) {
        list.push({ id: l.id, title: l.title, label: 'الوحدة ' + arNum(ui + 1) + ' • الدرس ' + arNum(li + 1) + ': ' + l.title });
      });
    });
    return list;
  }
  function lessonLabel(id) {
    const l = allLessons().find(function (x) { return x.id === id; });
    return l ? l.label : id;
  }

  /* =========================================================
     نافذة التأكيد داخل الصفحة
     ========================================================= */
  let confirmCb = null;
  function confirmBox(opts, cb) {
    $('confirmIcon').textContent = opts.icon || '⚠️';
    $('confirmTitle').textContent = opts.title || 'تأكيد';
    $('confirmText').textContent = opts.text || '';
    $('confirmYes').textContent = opts.yes || 'نعم، متأكدة';
    $('confirmYes').className = 'btn ' + (opts.yesClass || 'danger');
    $('confirmNo').style.display = opts.noCancel ? 'none' : '';
    confirmCb = cb || null;
    $('confirmBack').classList.add('open');
    $('confirmNo').focus();
  }
  function closeConfirm() { $('confirmBack').classList.remove('open'); confirmCb = null; }
  $('confirmYes').addEventListener('click', function () { const cb = confirmCb; closeConfirm(); if (cb) cb(); });
  $('confirmNo').addEventListener('click', closeConfirm);
  $('confirmBack').addEventListener('click', function (e) { if (e.target === $('confirmBack')) closeConfirm(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeConfirm(); });
  function info(title, text, icon) {
    confirmBox({ title: title, text: text, icon: icon || 'ℹ️', yes: 'حسنًا', yesClass: '', noCancel: true });
  }

  /* =========================================================
     التبويبات
     ========================================================= */
  function openTab(name) {
    document.querySelectorAll('#dashNav button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === name); });
    document.querySelectorAll('.tab-section').forEach(function (s) { s.classList.toggle('active', s.id === 'tab-' + name); });
    if (name === 'stats') renderStats();
    if (name === 'lessons') renderDone();
    try { history.replaceState(null, '', '#' + name); } catch (e) { /* تجاهل */ }
  }
  document.querySelectorAll('#dashNav button').forEach(function (b) {
    b.addEventListener('click', function () { openTab(b.getAttribute('data-tab')); });
  });

  /* =========================================================
     ١) بيانات المعلمة — حفظ تلقائي أثناء الكتابة
     ========================================================= */
  function renderTeacher() {
    const t = Store.get().teacher;
    document.querySelectorAll('#teacherForm [data-k]').forEach(function (inp) {
      inp.value = t[inp.getAttribute('data-k')] || '';
    });
  }
  // تُحفظ جميع الحقول معًا بعد التوقف عن الكتابة، حتى لا يضيع أي حقل عند التنقل السريع بينها
  let teacherTimer = null;
  function saveTeacher() {
    clearTimeout(teacherTimer);
    teacherTimer = null;
    Store.update(function (d) {
      document.querySelectorAll('#teacherForm [data-k]').forEach(function (inp) {
        d.teacher[inp.getAttribute('data-k')] = inp.value.trim();
      });
    });
  }
  document.querySelectorAll('#teacherForm [data-k]').forEach(function (inp) {
    inp.addEventListener('input', function () {
      clearTimeout(teacherTimer);
      teacherTimer = setTimeout(saveTeacher, 500);
    });
    inp.addEventListener('change', function () { if (teacherTimer) saveTeacher(); });
  });
  // حفظ أي تعديل معلّق قبل مغادرة الصفحة
  window.addEventListener('beforeunload', function () { if (teacherTimer) saveTeacher(); });

  /* =========================================================
     ٢) الفصول
     ========================================================= */
  $('addClassForm').addEventListener('submit', function (e) {
    e.preventDefault();
    const name = $('newClass').value.trim();
    if (!name) return;
    const c = Store.addClass(name);
    $('newClass').value = '';
    activeClassId = c.id;
    renderClasses();
  });

  function renderClasses() {
    const st = Store.get();
    const list = $('classList');
    list.innerHTML = '';
    if (!st.classes.length) {
      list.innerHTML = '<div class="empty" style="grid-column:1/-1"><span class="big">🏫</span>لا توجد فصول بعد. أضيفي أول فصل من الأعلى.</div>';
      activeClassId = '';
      renderStudents();
      return;
    }
    if (!Store.getClass(activeClassId)) activeClassId = st.classes[0].id;
    st.classes.forEach(function (c) {
      const item = document.createElement('div');
      item.className = 'class-item' + (c.id === activeClassId ? ' active' : '');
      item.innerHTML =
        '<div class="c-top"><span class="c-name">' + esc(c.name) + '</span>' +
        '<button class="icon-btn" type="button" data-act="edit" title="تعديل الاسم">✏️</button>' +
        '<button class="icon-btn del" type="button" data-act="del" title="حذف الفصل">🗑️</button></div>' +
        '<div class="c-count">👩‍🎓 ' + arNum(c.students.length) + ' طالبة • ✔️ ' +
        arNum(st.completed.filter(function (x) { return x.classId === c.id; }).length) + ' دروس منجزة</div>';
      item.addEventListener('click', function (e) {
        const act = e.target.closest('[data-act]');
        if (act && act.getAttribute('data-act') === 'del') {
          confirmBox({ title: 'حذف الفصل «' + c.name + '»؟', text: 'سيتم حذف الفصل وجميع طالباته (' + arNum(c.students.length) + ') وسجل دروسه المنجزة. لا يمكن التراجع.' }, function () {
            Store.deleteClass(c.id);
            renderClasses();
          });
          return;
        }
        if (act && act.getAttribute('data-act') === 'edit') {
          const top = item.querySelector('.c-top');
          top.innerHTML = '';
          const inp = document.createElement('input');
          inp.className = 'input';
          inp.value = c.name;
          top.appendChild(inp);
          inp.focus();
          inp.select();
          const finish = function () {
            const v = inp.value.trim();
            if (v && v !== c.name) Store.renameClass(c.id, v);
            renderClasses();
          };
          inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') inp.blur(); if (ev.key === 'Escape') { inp.value = c.name; inp.blur(); } });
          inp.addEventListener('blur', finish);
          inp.addEventListener('click', function (ev) { ev.stopPropagation(); });
          return;
        }
        activeClassId = c.id;
        renderClasses();
      });
      list.appendChild(item);
    });
    renderStudents();
  }

  /* =========================================================
     ٣) الطالبات داخل الفصل
     ========================================================= */
  function renderStudents() {
    const body = $('studentsBody');
    const c = Store.getClass(activeClassId);
    if (!c) {
      $('studentsTitle').textContent = '👩‍🎓 الطالبات';
      body.innerHTML = '<div class="empty"><span class="big">👩‍🎓</span>أضيفي فصلًا أولًا لتتمكني من إضافة الطالبات.</div>';
      return;
    }
    $('studentsTitle').textContent = '👩‍🎓 طالبات فصل «' + c.name + '» (' + arNum(c.students.length) + ')';
    body.innerHTML =
      '<div class="row" style="margin-bottom:14px">' +
        '<div class="field"><label for="oneName">إضافة طالبة واحدة</label><input class="input" id="oneName" placeholder="اسم الطالبة"></div>' +
        '<button class="btn" type="button" id="addOne">＋ إضافة</button>' +
      '</div>' +
      '<details style="margin-bottom:18px"><summary style="cursor:pointer;font-weight:800;color:var(--p700);padding:6px 0">📋 إضافة مجموعة أسماء دفعة واحدة</summary>' +
        '<div class="field" style="margin-top:10px"><label for="bulkNames">الصقي الأسماء (كل اسم في سطر)</label>' +
        '<textarea class="input" id="bulkNames" placeholder="سارة محمد&#10;ريم عبدالله&#10;لمى خالد"></textarea></div>' +
        '<button class="btn" type="button" id="addBulk" style="margin-top:10px">＋ إضافة الأسماء</button>' +
      '</details>';

    if (!c.students.length) {
      body.insertAdjacentHTML('beforeend', '<div class="empty"><span class="big">📝</span>لا توجد طالبات في هذا الفصل بعد.</div>');
    } else {
      let rows = '';
      c.students.forEach(function (s, i) {
        rows += '<tr data-id="' + s.id + '">' +
          '<td>' + arNum(i + 1) + '</td>' +
          '<td><input class="input" data-f="name" value="' + esc(s.name) + '" aria-label="اسم الطالبة"></td>' +
          '<td>' + counter('points', s.points) + '</td>' +
          '<td>' + counter('correct', s.correct) + '</td>' +
          '<td>' + counter('picked', s.picked) + '</td>' +
          '<td><input class="input" data-f="notes" value="' + esc(s.notes) + '" placeholder="—" aria-label="ملاحظات"></td>' +
          '<td><button class="icon-btn del" type="button" data-act="del" title="حذف الطالبة">🗑️</button></td>' +
          '</tr>';
      });
      body.insertAdjacentHTML('beforeend',
        '<div class="table-wrap"><table class="data"><thead><tr>' +
        '<th>#</th><th>الاسم</th><th>نقاط المشاركة</th><th>الإجابات الصحيحة</th><th>مرات القرعة</th><th>ملاحظات</th><th></th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>');
    }

    // إضافة طالبة واحدة
    const addOne = function () {
      const v = $('oneName').value.trim();
      if (!v) return;
      Store.addStudents(c.id, [v]);
      renderClasses();
      const inp = $('oneName');
      if (inp) inp.focus();
    };
    $('addOne').addEventListener('click', addOne);
    $('oneName').addEventListener('keydown', function (e) { if (e.key === 'Enter') addOne(); });

    // إضافة مجموعة أسماء
    $('addBulk').addEventListener('click', function () {
      const names = $('bulkNames').value.split(/\r?\n/).map(function (x) { return x.replace(/^[\s\d\-–.)•]+/, '').trim(); }).filter(Boolean);
      if (!names.length) return;
      const n = Store.addStudents(c.id, names);
      renderClasses();
      Store.toast('تمت إضافة ' + arNum(n) + ' طالبة ✓');
    });

    // التعديل المباشر داخل الجدول
    body.querySelectorAll('tbody tr').forEach(function (tr) {
      const sid = tr.getAttribute('data-id');
      tr.querySelectorAll('input[data-f]').forEach(function (inp) {
        inp.addEventListener('change', function () {
          const f = inp.getAttribute('data-f');
          const v = inp.value.trim();
          if (f === 'name' && !v) { inp.value = Store.findStudent(c.id, sid).name; return; }
          const ch = {}; ch[f] = v;
          Store.updateStudent(c.id, sid, ch);
        });
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') inp.blur(); });
      });
      tr.addEventListener('click', function (e) {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const act = b.getAttribute('data-act');
        if (act === 'del') {
          const s = Store.findStudent(c.id, sid);
          confirmBox({ title: 'حذف الطالبة؟', text: 'سيتم حذف «' + s.name + '» ونقاطها وملاحظاتها نهائيًا.' }, function () {
            Store.deleteStudent(c.id, sid);
            renderClasses();
          });
        } else {
          const f = b.getAttribute('data-f');
          Store.bumpStudent(c.id, sid, f, act === 'inc' ? 1 : -1);
          b.parentNode.querySelector('b').textContent = arNum(Store.findStudent(c.id, sid)[f]);
        }
      });
    });
  }
  function counter(field, val) {
    return '<span class="counter">' +
      '<button class="icon-btn" type="button" data-act="dec" data-f="' + field + '" title="إنقاص">−</button>' +
      '<b>' + arNum(val || 0) + '</b>' +
      '<button class="icon-btn" type="button" data-act="inc" data-f="' + field + '" title="زيادة">+</button></span>';
  }

  /* =========================================================
     ٤) متابعة الدروس المنجزة
     ========================================================= */
  function fillDoneForm() {
    const st = Store.get();
    const cs = $('doneClass');
    const prev = cs.value;
    cs.innerHTML = '';
    st.classes.forEach(function (c) { cs.appendChild(new Option(c.name, c.id)); });
    if (prev && Store.getClass(prev)) cs.value = prev;
    const ls = $('doneLesson');
    if (!ls.options.length) allLessons().forEach(function (l) { ls.appendChild(new Option(l.label, l.id)); });
    if (!$('doneDate').value) $('doneDate').value = Store.today();
  }
  $('doneForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!$('doneClass').value) { info('لا توجد فصول', 'أضيفي فصلًا أولًا من قسم «الفصول والطالبات».'); return; }
    Store.markCompleted($('doneClass').value, $('doneLesson').value, $('doneDate').value);
    renderDone();
  });
  function renderDone() {
    fillDoneForm();
    const st = Store.get();
    const ul = $('doneList');
    const order = allLessons().map(function (l) { return l.id; });
    const items = st.completed.slice().sort(function (a, b) {
      return (b.date || '').localeCompare(a.date || '') || order.indexOf(a.lessonId) - order.indexOf(b.lessonId);
    });
    if (!items.length) {
      ul.innerHTML = '<li class="empty" style="display:block"><span class="big">📒</span>لم يُسجَّل أي درس بعد.</li>';
      return;
    }
    ul.innerHTML = '';
    items.forEach(function (x) {
      const c = Store.getClass(x.classId);
      const li = document.createElement('li');
      li.innerHTML = '<span class="d-class">' + esc(c ? c.name : '—') + '</span>' +
        '<span class="d-title">' + esc(lessonLabel(x.lessonId)) + '</span>' +
        '<span class="d-date">📅 ' + esc(x.date) + '</span>' +
        '<button class="icon-btn del" type="button" title="إلغاء التسجيل">🗑️</button>';
      li.querySelector('button').addEventListener('click', function () {
        Store.unmarkCompleted(x.id);
        renderDone();
      });
      ul.appendChild(li);
    });
  }

  /* =========================================================
     ٥) الإحصائيات
     ========================================================= */
  function renderStats() {
    const st = Store.get();
    const students = st.classes.reduce(function (n, c) { return n + c.students.length; }, 0);
    const uniqueDone = {};
    st.completed.forEach(function (x) { uniqueDone[x.lessonId] = true; });
    const totalLessons = allLessons().length;
    const kpis = [
      ['🏫', st.classes.length, 'عدد الفصول'],
      ['👩‍🎓', students, 'إجمالي الطالبات'],
      ['✔️', st.completed.length, 'دروس منجزة (لكل الفصول)'],
      ['📚', Object.keys(uniqueDone).length + ' / ' + totalLessons, 'دروس مختلفة شُرحت']
    ];
    $('kpis').innerHTML = kpis.map(function (k) {
      return '<div class="kpi"><div class="k-ico">' + k[0] + '</div><b>' + arNum(k[1]) + '</b><span>' + k[2] + '</span></div>';
    }).join('');
    const top = $('topList');
    if (!st.classes.length) { top.innerHTML = ''; return; }
    top.innerHTML = st.classes.map(function (c) {
      const best = c.students.slice().sort(function (a, b) { return b.points - a.points || b.correct - a.correct; })
        .filter(function (s) { return s.points > 0 || s.correct > 0; }).slice(0, 5);
      const done = st.completed.filter(function (x) { return x.classId === c.id; }).length;
      return '<div class="top-card"><h4>🏆 ' + esc(c.name) + ' <small style="color:var(--muted);font-weight:700">• ' + arNum(done) + ' دروس منجزة</small></h4>' +
        (best.length ? '<ol>' + best.map(function (s) {
          return '<li>' + esc(s.name) + ' — <span class="pts">' + arNum(s.points) + ' نقطة</span> • ' + arNum(s.correct) + ' صحيحة</li>';
        }).join('') + '</ol>' : '<p style="color:var(--muted);margin:0">لا توجد نقاط بعد.</p>') + '</div>';
    }).join('');
  }

  /* =========================================================
     ٦) التصدير والنسخ الاحتياطي
     ========================================================= */
  $('btnExcel').addEventListener('click', function () {
    try {
      const kind = Exporter.exportExcel(Store.get(), allLessons());
      Store.toast(kind === 'xlsx' ? 'تم تصدير ملف Excel ✓' : 'لا يتوفر إنترنت — تم تصدير ملف CSV ✓');
    } catch (e) {
      console.error(e);
      info('تعذّر التصدير', 'حدث خطأ أثناء إنشاء الملف. جرّبي مرة أخرى.', '⚠️');
    }
  });
  $('btnBackup').addEventListener('click', function () {
    Exporter.download('نسخة-احتياطية-' + Store.today() + '.json', Store.exportJSON(), 'application/json');
    Store.toast('تم تنزيل النسخة الاحتياطية ✓');
  });
  $('btnRestore').addEventListener('click', function () { $('restoreFile').click(); });
  $('restoreFile').addEventListener('change', function () {
    const file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      confirmBox({ title: 'استعادة البيانات؟', text: 'ستُستبدل جميع البيانات الحالية ببيانات الملف «' + file.name + '».', yes: 'نعم، استعيدي', yesClass: '' }, function () {
        try {
          Store.importJSON(String(reader.result));
          renderAll();
          info('تمت الاستعادة', 'تم إرجاع البيانات بنجاح ✓', '✅');
        } catch (e) {
          info('ملف غير صالح', e.message && /[؀-ۿ]/.test(e.message) ? e.message : 'تعذّر قراءة الملف. تأكدي أنه نسخة احتياطية من هذا المشروع.', '⚠️');
        }
      });
    };
    reader.readAsText(file, 'utf-8');
  });
  $('btnClear').addEventListener('click', function () {
    confirmBox({
      icon: '🗑️',
      title: 'مسح جميع البيانات نهائيًا؟',
      text: 'سيتم حذف بيانات المعلمة وجميع الفصول والطالبات والنقاط والدروس المنجزة من هذا المتصفح. ننصح بتنزيل نسخة احتياطية أولًا. لا يمكن التراجع.',
      yes: 'نعم، امسحي كل شيء'
    }, function () {
      Store.clearAll();
      activeClassId = '';
      renderAll();
    });
  });

  /* =========================================================
     التشغيل
     ========================================================= */
  function renderAll() {
    renderTeacher();
    renderClasses();
    renderDone();
    renderStats();
  }
  renderAll();
  if (!Store.isAvailable()) {
    info('التخزين غير متاح', 'المتصفح يمنع حفظ البيانات (ربما وضع التصفح الخاص). ستعمل اللوحة لكن البيانات لن تبقى بعد الإغلاق — استخدمي النسخة الاحتياطية.', '⚠️');
  }
  const tab = (location.hash || '').slice(1);
  if (['teacher', 'classes', 'lessons', 'stats', 'backup'].indexOf(tab) !== -1) openTab(tab);
})();
