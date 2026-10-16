/* =========================================================
   export.js — التصدير إلى Excel وتنزيل الملفات
   - يستخدم مكتبة SheetJS (XLSX) إذا كانت محمّلة من الإنترنت
   - إذا لم تتوفر: يُصدَّر ملف CSV بترميز UTF-8 مع BOM
     حتى يظهر النص العربي سليمًا عند فتحه في Excel
   ========================================================= */

const Exporter = (function () {
  'use strict';

  /* تنزيل نص كملف */
  function download(filename, content, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: (mime || 'text/plain') + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  /* تجهيز الجداول (صفوف) لكل ورقة */
  function buildSheets(store, lessons) {
    const t = store.teacher;
    const sheets = [];

    // ورقة بيانات المعلمة
    sheets.push({
      name: 'بيانات المعلمة',
      rows: [
        ['البيان', 'القيمة'],
        ['اسم المعلمة', t.name],
        ['اسم المدرسة', t.school],
        ['المادة', t.subject],
        ['الصف', t.grade],
        ['الفصل الدراسي', t.term],
        ['العام الدراسي', t.year],
        ['عدد الفصول', store.classes.length],
        ['إجمالي الطالبات', store.classes.reduce(function (n, c) { return n + c.students.length; }, 0)],
        ['تاريخ التصدير', new Date().toLocaleString('ar-SA')]
      ],
      cols: [22, 40]
    });

    // ورقة لكل فصل
    store.classes.forEach(function (c) {
      const rows = [['#', 'اسم الطالبة', 'نقاط المشاركة', 'الإجابات الصحيحة', 'مرات الاختيار في القرعة', 'ملاحظات']];
      c.students.forEach(function (s, i) {
        rows.push([i + 1, s.name, s.points, s.correct, s.picked, s.notes]);
      });
      sheets.push({ name: c.name, rows: rows, cols: [6, 30, 16, 18, 22, 40] });
    });

    // ورقة الدروس المنجزة
    const title = function (id) {
      const l = lessons.find(function (x) { return x.id === id; });
      return l ? l.label : id;
    };
    const cname = function (id) {
      const c = store.classes.find(function (x) { return x.id === id; });
      return c ? c.name : '—';
    };
    const done = [['الفصل', 'الدرس', 'التاريخ']];
    store.completed.slice().sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); }).forEach(function (x) {
      done.push([cname(x.classId), title(x.lessonId), x.date]);
    });
    sheets.push({ name: 'الدروس المنجزة', rows: done, cols: [20, 60, 14] });

    return sheets;
  }

  /* اسم ورقة صالح لـ Excel: بلا رموز ممنوعة، ٣١ حرفًا كحد أقصى، وغير مكرر */
  function safeSheetName(name, used) {
    let base = String(name || 'ورقة').replace(/[\[\]:*?\/\\]/g, '-').trim().slice(0, 28) || 'ورقة';
    let n = base;
    let i = 2;
    while (used[n]) { n = base.slice(0, 26) + ' ' + i; i++; }
    used[n] = true;
    return n;
  }

  /* التصدير: يُرجع 'xlsx' أو 'csv' حسب ما تم */
  function exportExcel(store, lessons) {
    const sheets = buildSheets(store, lessons);
    const stamp = new Date().toISOString().slice(0, 10);

    if (window.XLSX && window.XLSX.utils) {
      const wb = XLSX.utils.book_new();
      const used = {};
      sheets.forEach(function (sh) {
        const ws = XLSX.utils.aoa_to_sheet(sh.rows);
        ws['!cols'] = sh.cols.map(function (w) { return { wch: w }; });
        XLSX.utils.book_append_sheet(wb, ws, safeSheetName(sh.name, used));
      });
      // عرض الأوراق من اليمين إلى اليسار
      wb.Workbook = { Views: [{ RTL: true }] };
      XLSX.writeFile(wb, 'بيانات-الفصول-' + stamp + '.xlsx');
      return 'xlsx';
    }

    // البديل بدون إنترنت: ملف CSV واحد يضم جميع الأقسام
    const cell = function (v) {
      const s = String(v === undefined || v === null ? '' : v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [];
    sheets.forEach(function (sh) {
      lines.push(cell('【 ' + sh.name + ' 】'));
      sh.rows.forEach(function (r) { lines.push(r.map(cell).join(',')); });
      lines.push('');
    });
    download('بيانات-الفصول-' + stamp + '.csv', '﻿' + lines.join('\r\n'), 'text/csv');
    return 'csv';
  }

  return { download: download, exportExcel: exportExcel };
})();
