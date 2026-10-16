/* =========================================================
   storage.js — الحفظ في المتصفح (localStorage)
   - جميع بيانات المعلمة والفصول والطالبات والدروس المنجزة
   - كل عمليات القراءة والكتابة داخل try/catch
     حتى لا يتعطل الموقع إذا كان التخزين غير متاح
   - عند تعذّر التخزين تُحفظ البيانات مؤقتًا في الذاكرة فقط
   ========================================================= */

const Store = (function () {
  'use strict';

  // مفتاح الحفظ في المتصفح
  const KEY = 'dt2_classroom_v1';
  const VERSION = 1;

  // هل التخزين متاح؟ (يُحدَّد عند أول قراءة)
  let available = true;

  // البيانات الحالية في الذاكرة
  let data = null;

  // المستمعون لحدث الحفظ (لعرض رسالة "تم الحفظ ✓")
  const listeners = [];

  /* الشكل الافتراضي للبيانات */
  function defaults() {
    return {
      version: VERSION,
      teacher: {
        name: '',
        school: '',
        subject: 'التقنية الرقمية ٢',
        grade: 'الثاني الثانوي',
        term: '',
        year: '1448 هـ'
      },
      classes: [],          // [{id, name, students:[{id,name,points,correct,picked,notes}]}]
      completed: [],        // [{id, classId, lessonId, date}]
      picker: {},           // { classId: [معرّفات الطالبات اللاتي اخترن في الدورة الحالية] }
      currentClassId: '',   // الفصل المختار في الصفحة الرئيسية
      updatedAt: null
    };
  }

  /* معرّف فريد بسيط */
  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* التأكد من سلامة البيانات المحمّلة وإكمال الحقول الناقصة */
  function normalize(raw) {
    const d = defaults();
    if (!raw || typeof raw !== 'object') return d;
    d.teacher = Object.assign(d.teacher, raw.teacher || {});
    d.classes = Array.isArray(raw.classes) ? raw.classes.map(function (c) {
      return {
        id: c.id || uid('c'),
        name: String(c.name || 'فصل'),
        students: Array.isArray(c.students) ? c.students.map(function (s) {
          return {
            id: s.id || uid('s'),
            name: String(s.name || ''),
            points: Number(s.points) || 0,
            correct: Number(s.correct) || 0,
            picked: Number(s.picked) || 0,
            notes: String(s.notes || '')
          };
        }) : []
      };
    }) : [];
    d.completed = Array.isArray(raw.completed) ? raw.completed.filter(function (x) {
      return x && x.classId && x.lessonId;
    }).map(function (x) {
      return { id: x.id || uid('d'), classId: x.classId, lessonId: x.lessonId, date: x.date || today() };
    }) : [];
    d.picker = (raw.picker && typeof raw.picker === 'object') ? raw.picker : {};
    d.currentClassId = raw.currentClassId || '';
    d.updatedAt = raw.updatedAt || null;
    return d;
  }

  /* تاريخ اليوم بصيغة YYYY-MM-DD */
  function today() {
    const t = new Date();
    const m = String(t.getMonth() + 1).padStart(2, '0');
    const day = String(t.getDate()).padStart(2, '0');
    return t.getFullYear() + '-' + m + '-' + day;
  }

  /* قراءة البيانات من المتصفح */
  function load() {
    try {
      const txt = window.localStorage.getItem(KEY);
      data = normalize(txt ? JSON.parse(txt) : null);
    } catch (e) {
      available = false;
      data = data || defaults();
      console.warn('التخزين غير متاح، ستُحفظ البيانات مؤقتًا فقط.', e);
    }
    return data;
  }

  /* كتابة البيانات في المتصفح */
  function save(silent) {
    if (!data) load();
    data.updatedAt = new Date().toISOString();
    let ok = true;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(data));
      available = true;
    } catch (e) {
      ok = false;
      available = false;
      console.warn('تعذّر الحفظ في المتصفح.', e);
    }
    if (!silent) listeners.forEach(function (fn) { try { fn(ok); } catch (e) { /* تجاهل */ } });
    return ok;
  }

  /* الحصول على البيانات الحالية */
  function get() {
    if (!data) load();
    return data;
  }

  /* تعديل البيانات ثم الحفظ تلقائيًا */
  function update(fn, silent) {
    const d = get();
    fn(d);
    return save(silent);
  }

  /* الاشتراك في حدث الحفظ */
  function onSave(fn) { listeners.push(fn); }

  /* ---------- الفصول ---------- */
  function getClass(id) {
    return get().classes.find(function (c) { return c.id === id; }) || null;
  }
  function addClass(name) {
    const c = { id: uid('c'), name: name, students: [] };
    update(function (d) {
      d.classes.push(c);
      if (!d.currentClassId) d.currentClassId = c.id;
    });
    return c;
  }
  function renameClass(id, name) {
    update(function () { const c = getClass(id); if (c) c.name = name; });
  }
  function deleteClass(id) {
    update(function (d) {
      d.classes = d.classes.filter(function (c) { return c.id !== id; });
      d.completed = d.completed.filter(function (x) { return x.classId !== id; });
      delete d.picker[id];
      if (d.currentClassId === id) d.currentClassId = d.classes[0] ? d.classes[0].id : '';
    });
  }

  /* ---------- الطالبات ---------- */
  function addStudents(classId, names) {
    const c = getClass(classId);
    if (!c) return 0;
    const clean = names.map(function (n) { return String(n).trim(); }).filter(Boolean);
    update(function () {
      clean.forEach(function (n) {
        c.students.push({ id: uid('s'), name: n, points: 0, correct: 0, picked: 0, notes: '' });
      });
    });
    return clean.length;
  }
  function findStudent(classId, studentId) {
    const c = getClass(classId);
    return c ? c.students.find(function (s) { return s.id === studentId; }) || null : null;
  }
  function updateStudent(classId, studentId, changes, silent) {
    update(function () {
      const s = findStudent(classId, studentId);
      if (s) Object.assign(s, changes);
    }, silent);
  }
  function bumpStudent(classId, studentId, field, delta) {
    update(function () {
      const s = findStudent(classId, studentId);
      if (s) s[field] = Math.max(0, (Number(s[field]) || 0) + delta);
    });
  }
  function deleteStudent(classId, studentId) {
    update(function (d) {
      const c = getClass(classId);
      if (c) c.students = c.students.filter(function (s) { return s.id !== studentId; });
      if (d.picker[classId]) d.picker[classId] = d.picker[classId].filter(function (x) { return x !== studentId; });
    });
  }

  /* ---------- الدروس المنجزة ---------- */
  function isCompleted(classId, lessonId) {
    return get().completed.some(function (x) { return x.classId === classId && x.lessonId === lessonId; });
  }
  function markCompleted(classId, lessonId, date) {
    update(function (d) {
      const found = d.completed.find(function (x) { return x.classId === classId && x.lessonId === lessonId; });
      if (found) found.date = date || today();
      else d.completed.push({ id: uid('d'), classId: classId, lessonId: lessonId, date: date || today() });
    });
  }
  function unmarkCompleted(id) {
    update(function (d) { d.completed = d.completed.filter(function (x) { return x.id !== id; }); });
  }

  /* ---------- القرعة: سحب اسم دون تكرار حتى تُختار الجميع ---------- */
  function drawStudent(classId) {
    const c = getClass(classId);
    if (!c || !c.students.length) return null;
    const d = get();
    let used = (d.picker[classId] || []).filter(function (id) {
      return c.students.some(function (s) { return s.id === id; });
    });
    let pool = c.students.filter(function (s) { return used.indexOf(s.id) === -1; });
    let restarted = false;
    if (!pool.length) { used = []; pool = c.students.slice(); restarted = true; }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    used.push(pick.id);
    update(function (dd) {
      dd.picker[classId] = used;
      pick.picked = (pick.picked || 0) + 1;
    });
    return { student: pick, remaining: pool.length - 1, total: c.students.length, restarted: restarted };
  }
  function pickerRemaining(classId) {
    const c = getClass(classId);
    if (!c) return 0;
    const used = get().picker[classId] || [];
    return c.students.filter(function (s) { return used.indexOf(s.id) === -1; }).length;
  }
  function resetPicker(classId) {
    update(function (d) { d.picker[classId] = []; });
  }

  /* ---------- النسخ الاحتياطي والاستعادة ---------- */
  function exportJSON() {
    return JSON.stringify(Object.assign({ app: 'dt2-interactive', exportedAt: new Date().toISOString() }, get()), null, 2);
  }
  function importJSON(text) {
    const raw = JSON.parse(text);        // يرمي خطأ إذا كان الملف غير صالح
    if (!raw || typeof raw !== 'object' || !raw.teacher || !Array.isArray(raw.classes)) {
      throw new Error('الملف لا يحتوي على بيانات صالحة لهذا المشروع.');
    }
    data = normalize(raw);
    save();
    return data;
  }
  function clearAll() {
    data = defaults();
    try { window.localStorage.removeItem(KEY); } catch (e) { /* تجاهل */ }
    save();
  }

  /* ---------- أداة مساعدة لرسالة "تم الحفظ ✓" ---------- */
  let toastEl = null;
  let toastTimer = null;
  function toast(msg, isError) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.toggle('err', !!isError);
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1600);
  }
  function enableSaveToast() {
    onSave(function (ok) {
      toast(ok ? 'تم الحفظ ✓' : 'تعذّر الحفظ في المتصفح — استخدمي النسخة الاحتياطية', !ok);
    });
  }

  load();

  return {
    get: get, save: save, update: update, onSave: onSave, uid: uid, today: today,
    isAvailable: function () { return available; },
    getClass: getClass, addClass: addClass, renameClass: renameClass, deleteClass: deleteClass,
    addStudents: addStudents, updateStudent: updateStudent, bumpStudent: bumpStudent, deleteStudent: deleteStudent,
    findStudent: findStudent,
    isCompleted: isCompleted, markCompleted: markCompleted, unmarkCompleted: unmarkCompleted,
    drawStudent: drawStudent, pickerRemaining: pickerRemaining, resetPicker: resetPicker,
    exportJSON: exportJSON, importJSON: importJSON, clearAll: clearAll,
    toast: toast, enableSaveToast: enableSaveToast
  };
})();
