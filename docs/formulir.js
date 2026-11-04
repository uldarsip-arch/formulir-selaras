/* ============================================================
 *  FORMULIR PUBLIK — tampilan, alur langkah, dan unggah berkas.
 *  Aturan percabangan & validasi berasal dari window.Logika
 *  (sumber yang sama dengan validasi di server: Logika.gs).
 * ============================================================ */
(function () {
  'use strict';
  var C = window.CONFIG_PUBLIK, L = window.Logika, A = window.ASET || {};
  var app = document.getElementById('app');
  var CTX = { tanggalAcuan: C.TANGGAL_HARI_INI };

  /** ID unik per pengisian — server memakainya agar klik ganda / kirim ulang tidak tersimpan dua kali. */
  function idBaru() {
    var a = new Uint8Array(16);
    try { crypto.getRandomValues(a); } catch (e) { for (var i = 0; i < 16; i++) a[i] = Math.random() * 256; }
    return 'f-' + Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  }
  var D = { mulaiPada: Date.now(), website: '', idKirim: idBaru() };   // seluruh jawaban (tetap tersimpan saat Kembali/Lanjutkan)
  var FILE = null;                                 // {nama, tipe, ukuran, base64, untuk}
  var langkah = -1;                                // -1 = halaman pengumuman
  var galat = {};
  var sekolah = { status: '', npsn: '' };          // status: '', 'mencari', 'ditemukan', 'tidak', 'galat'
  var hasilKirim = null;
  var timerNpsn = null;

  // ---------------- Utilitas ----------------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function api(fn) {
    // Versi GitHub Pages: panggil Apps Script lewat fetch (text/plain → tanpa preflight CORS)
    var args = Array.prototype.slice.call(arguments, 1);
    return fetch(window.SELARAS_API, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ fn: fn, args: args })
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  function urlWA(teks) {
    var n = L.normalisasiHP(C.whatsapp);
    return 'https://wa.me/' + n + (teks ? '?text=' + encodeURIComponent(teks) : '');
  }
  function ukuranTeks(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function formatTanggal(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); if (!m) return iso || '';
    var bln = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return (+m[3]) + ' ' + bln[+m[2] - 1] + ' ' + m[1];
  }

  // ---------------- Komponen bidang ----------------
  function pesanGalat(k) { return galat[k] ? '<p class="galat" id="e-' + k + '">' + esc(galat[k]) + '</p>' : ''; }
  function tandaWajib(w) { return w === false ? ' <span class="opsional">(opsional)</span>' : '<span class="wajib" aria-hidden="true">*</span>'; }
  function aria(k, adaPetunjuk) {
    var ids = []; if (adaPetunjuk) ids.push('p-' + k); if (galat[k]) ids.push('e-' + k);
    return (ids.length ? ' aria-describedby="' + ids.join(' ') + '"' : '') + (galat[k] ? ' aria-invalid="true"' : '');
  }
  function kelasBidang(k) { return 'bidang' + (galat[k] ? ' ada-galat' : ''); }

  function fRadio(k, label, opsi, o) {
    o = o || {};
    var h = '<fieldset class="' + kelasBidang(k) + '" id="b-' + k + '"><legend>' + label + tandaWajib(o.wajib) + '</legend>';
    if (o.petunjuk) h += '<p class="petunjuk" id="p-' + k + '">' + o.petunjuk + '</p>';
    h += '<div class="pilihan-grup' + (opsi.length <= 2 ? ' dua' : '') + (o.kelas ? ' ' + o.kelas : '') + '" role="radiogroup"' + aria(k, o.petunjuk) + '>';
    opsi.forEach(function (v, i) {
      var tampil = esc(v);
      if (o.pecah) { var p = v.indexOf(' ('); if (p > 0) tampil = esc(v.slice(0, p)) + '<small>' + esc(v.slice(p + 1)) + '</small>'; }
      h += '<label class="pilihan"><input type="radio" name="' + k + '" id="' + k + '-' + i + '" value="' + esc(v) + '"' +
        (D[k] === v ? ' checked' : '') + '><span>' + '<span class="teks-pilihan">' + (o.nomor ? (i + 1) + '. ' : '') + tampil + '</span></span></label>';
    });
    return h + '</div>' + pesanGalat(k) + '</fieldset>';
  }
  function fTeks(k, label, o) {
    o = o || {};
    var h = '<div class="' + kelasBidang(k) + '" id="b-' + k + '"><label for="' + k + '">' + label + tandaWajib(o.wajib) + '</label>';
    if (o.petunjuk) h += '<p class="petunjuk" id="p-' + k + '">' + o.petunjuk + '</p>';
    h += '<input type="' + (o.tipe || 'text') + '" id="' + k + '" name="' + k + '" value="' + esc(D[k] || '') + '"' +
      (o.ac ? ' autocomplete="' + o.ac + '"' : '') + (o.im ? ' inputmode="' + o.im + '"' : '') +
      (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + (o.maks ? ' maxlength="' + o.maks + '"' : '') +
      (o.max ? ' max="' + o.max + '"' : '') + (o.list ? ' list="' + o.list + '"' : '') + (o.readonly ? ' readonly' : '') + aria(k, o.petunjuk) + '>';
    return h + pesanGalat(k) + '</div>';
  }
  function fArea(k, label, o) {
    o = o || {};
    var h = '<div class="' + kelasBidang(k) + '" id="b-' + k + '"><label for="' + k + '">' + label + tandaWajib(o.wajib) + '</label>';
    if (o.petunjuk) h += '<p class="petunjuk" id="p-' + k + '">' + o.petunjuk + '</p>';
    h += '<textarea id="' + k + '" name="' + k + '"' + (o.kelas ? ' class="' + o.kelas + '"' : '') + (o.maks ? ' maxlength="' + o.maks + '"' : '') +
      (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + aria(k, o.petunjuk) + '>' + esc(D[k] || '') + '</textarea>';
    if (o.maks) h += '<div class="hitung" id="h-' + k + '">' + String(D[k] || '').length + ' / ' + o.maks + '</div>';
    return h + pesanGalat(k) + '</div>';
  }
  function fPilih(k, label, opsi, o) {
    o = o || {};
    var h = '<div class="' + kelasBidang(k) + '" id="b-' + k + '"><label for="' + k + '">' + label + tandaWajib(o.wajib) + '</label>';
    if (o.petunjuk) h += '<p class="petunjuk" id="p-' + k + '">' + o.petunjuk + '</p>';
    h += '<select id="' + k + '" name="' + k + '"' + aria(k, o.petunjuk) + '><option value="">— Pilih —</option>';
    opsi.forEach(function (v) { h += '<option' + (D[k] === v ? ' selected' : '') + '>' + esc(v) + '</option>'; });
    return h + '</select>' + pesanGalat(k) + '</div>';
  }

  // ---------------- Modal ----------------
  var fokusSebelum = null;
  function modal(o) {
    tutupModal();
    fokusSebelum = document.activeElement;
    var el = document.createElement('div');
    el.className = 'modal-latar'; el.id = 'modal';
    var tombol = o.tombol.map(function (t, i) {
      return t.href
        ? '<a class="tombol ' + t.kelas + '" href="' + esc(t.href) + '" target="_blank" rel="noopener noreferrer">' + t.teks + '</a>'
        : '<button type="button" class="tombol ' + t.kelas + '" data-modal="' + i + '">' + t.teks + '</button>';
    }).join('');
    el.innerHTML = '<div class="modal ' + (o.jenis || '') + '" role="alertdialog" aria-modal="true" aria-labelledby="modal-judul" aria-describedby="modal-isi">' +
      '<div class="modal-ikon" aria-hidden="true">' + (o.ikon || '') + '</div><h2 id="modal-judul">' + o.judul + '</h2>' +
      '<div id="modal-isi">' + o.isi + '</div><div class="baris-tombol">' + tombol + '</div></div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-modal]');
      if (b) { var t = o.tombol[+b.getAttribute('data-modal')]; if (t.aksi) t.aksi(); }
    });
    el.addEventListener('keydown', function (ev) { // jebak fokus di dalam modal
      if (ev.key !== 'Tab') return;
      var f = el.querySelectorAll('a,button'); if (!f.length) return;
      var awal = f[0], akhir = f[f.length - 1];
      if (ev.shiftKey && document.activeElement === awal) { ev.preventDefault(); akhir.focus(); }
      else if (!ev.shiftKey && document.activeElement === akhir) { ev.preventDefault(); awal.focus(); }
    });
    var pertama = el.querySelector('a,button'); if (pertama) pertama.focus();
  }
  function tutupModal() {
    var m = document.getElementById('modal'); if (m) m.remove();
    if (fokusSebelum && document.body.contains(fokusSebelum)) { try { fokusSebelum.focus(); } catch (e) { } }
  }
  function ulangDariAwal() {
    D = { mulaiPada: Date.now(), website: '', idKirim: idBaru() }; FILE = null; galat = {}; sekolah = { status: '', npsn: '' }; hasilKirim = null;
    tutupModal(); langkah = -1; render();
  }

  function modalScreening() {
    modal({
      ikon: '📋', judul: 'Halo Sobat SELARAS ^^',
      isi: '<p>Dikarenakan kamu belum mempunyai hasil diagnosa dari dokter atau psikolog, dan juga belum ada dokumen screening identifikasi indikasi disabilitas dari ULD Kota, terapis, maupun guru. Maka <strong>mohon maaf kamu belum dapat melanjutkan pendaftaran.</strong></p>' +
        '<p>Silahkan kunjungi ULD Kota terdekat yang berada di kantor walikota, atau meminta guru melakukan screening apakah ada tanda indikasi disabilitas atau tidak.</p>' +
        '<p><strong>Jika hasil menunjukkan adanya dugaan disabilitas, silahkan kembali ke form ini untuk mendaftar.</strong></p>',
      tombol: [
        { teks: 'Hubungi Kami', kelas: 'tombol-wa', href: urlWA('Halo Admin ULD, saya ingin bertanya tentang screening identifikasi disabilitas sebelum mendaftar konsultasi SELARAS.') },
        { teks: 'Tutup', kelas: 'tombol-garis', aksi: ulangDariAwal }
      ]
    });
  }
  function modalSekolah() {
    modal({
      jenis: 'tolak', ikon: '🙏', judul: 'Mohon Maaf.',
      isi: '<p>Program Layanan Konsultasi di ULD Dinas Pendidikan Provinsi DKI Jakarta diperuntukkan bagi anak/murid yang sudah bersekolah di wilayah DKI Jakarta.</p>' +
        '<p>Jika ingin mengetahui program kami lainnya, silakan kunjungi Instagram <strong>' + esc(C.instagramHandle) + '</strong>.</p>',
      tombol: [
        { teks: 'WhatsApp ULD', kelas: 'tombol-utama', href: urlWA('Halo Admin ULD, saya ingin bertanya tentang program layanan ULD Dinas Pendidikan Provinsi DKI Jakarta.') },
        { teks: 'Kembali ke Awal', kelas: 'tombol-garis', aksi: ulangDariAwal }
      ]
    });
  }

  // ---------------- Halaman ----------------
  function kepalaLangkah() {
    var l = L.LANGKAH, h = '<div class="progres" aria-label="Kemajuan pengisian"><div class="progres-teks"><span>Langkah <b>' + (langkah + 1) +
      '</b> dari ' + l.length + '</span><span>' + esc(l[langkah].judul) + '</span></div><div class="progres-batang">';
    for (var i = 0; i < l.length; i++) h += '<span class="' + (i < langkah ? 'selesai' : i === langkah ? 'aktif' : '') + '"></span>';
    return h + '</div></div>';
  }
  function navigasi(teksLanjut) {
    return '<div class="baris-tombol antara"><button type="button" class="tombol tombol-garis" data-aksi="kembali">← Kembali</button>' +
      '<button type="button" class="tombol tombol-utama" data-aksi="lanjut">' + (teksLanjut || 'Lanjutkan →') + '</button></div>';
  }

  function hBeranda() {
    var p = C.pengumuman;
    var h = '<div class="kartu"><div class="beranda-logo"><img src="' + esc(C.LOGO_URL || A.logo || '') + '" alt="Logo SELARAS">' +
      '<div><h1 style="margin:0">' + esc(p.judul) + '</h1><small>' + esc(C.SINGKATAN + ' — ' + C.KEPANJANGAN) + '</small></div></div>';
    if (!C.formulirDibuka) {
      h += '<div class="info peringatan"><span class="ikon" aria-hidden="true">⏸️</span><div>' + esc(C.pesanDitutup) + '</div></div>' +
        '<div class="baris-tombol"><a class="tombol tombol-wa" href="' + urlWA() + '" target="_blank" rel="noopener noreferrer">Hubungi Kami</a></div></div>';
      return h;
    }
    h += '<p>' + esc(p.isi).replace(/\n/g, '<br>') + '</p>';
    if (p.penekanan) h += '<div class="penekanan">' + esc(p.penekanan) + '</div>';
    h += '<div class="catatan"><strong>Sebelum mulai:</strong><ul><li>' + esc(p.catatan) + '</li>' +
      '<li>Siapkan NPSN sekolah anak dan dokumen hasil diagnosa/screening dalam satu file PDF (maks. ' + C.UKURAN_MAKS_MB + ' MB).</li>' +
      '<li>Pengisian membutuhkan sekitar 10 menit.</li></ul></div>' +
      '<div class="baris-tombol"><button type="button" class="tombol tombol-utama" data-aksi="mulai">Mulai Pendaftaran</button>' +
      '<a class="tombol tombol-wa" href="' + urlWA('Halo Admin ULD, saya ingin bertanya tentang layanan konsultasi SELARAS.') + '" target="_blank" rel="noopener noreferrer">Hubungi Kami</a></div></div>';
    return h;
  }

  var LABEL_B = {
    sudahSekolah: 'Apakah anak Anda sudah bersekolah?',
    sekolahJakarta: 'Apakah anak bersekolah di Jakarta?',
    ktpJakarta: 'Apakah Anda ber-KTP Jakarta?'
  };

  function hPembuka() {
    var h = '<div class="bagian-label">Bagian A</div><h2>Pertanyaan Pembuka</h2><p class="petunjuk">Jawab pertanyaan berikut sebelum mengisi data identitas.</p>';
    h += fRadio('pernahKonsultasi', 'Apakah Anda sebelumnya pernah melakukan konsultasi di ULD Dinas Pendidikan Provinsi DKI Jakarta?', L.OPSI.yaTidak);
    h += fRadio('punyaScreening', 'Sudah punya hasil screening atau diagnosa disabilitas?', L.OPSI.yaTidak);
    return h;
  }

  function hKelayakan() {
    var k = L.alurKelayakan(D);
    var h = '<div class="bagian-label">Bagian B</div><h2>Validasi Kelayakan Pendaftaran</h2>' +
      '<p class="petunjuk">Layanan konsultasi ULD diperuntukkan bagi anak/murid yang bersekolah di wilayah DKI Jakarta.</p>';
    k.tampil.forEach(function (q) { h += fRadio(q, LABEL_B[q], q === 'sudahSekolah' ? L.OPSI.sudahBelum : L.OPSI.yaTidak); });
    if (k.status === 'lanjut' && k.prioritas === false) h += '<div class="info peringatan" role="status" id="catatan-ktp"><span class="ikon" aria-hidden="true">📌</span><div>' +
      '<strong>Catatan:</strong><br>Pendaftar dengan KTP non-DKI yang anaknya bersekolah di wilayah DKI Jakarta <strong>tetap dapat mengisi formulir pendaftaran</strong>, ' +
      'tetapi <strong>tidak termasuk dalam daftar prioritas layanan</strong> ULD Dinas Pendidikan Provinsi DKI Jakarta.</div></div>';
    else if (k.status === 'lanjut') h += '<div class="info ok" role="status"><span class="ikon" aria-hidden="true">✅</span><div>Anda memenuhi syarat layanan. Silakan lanjutkan ke pengisian data pendaftar.</div></div>';
    return h;
  }

  function hPendaftar() {
    var h = '<div class="bagian-label">Bagian C</div><h2>Data Pendaftar</h2>';
    h += fTeks('namaPendaftar', 'NAMA PENDAFTAR', { petunjuk: '<strong>Tuliskan nama lengkap Anda (BUKAN NAMA ANAK ANDA YAA).</strong>', ac: 'name', maks: 100 });
    h += fRadio('peran', 'Peran', L.OPSI.peran, { petunjuk: 'Pilih peran Anda terhadap anak/murid yang didaftarkan.' });
    h += '<div class="grid-2">' + fTeks('hp', 'Nomor HP', { tipe: 'tel', ac: 'tel', im: 'tel', ph: '0812-3456-7890', petunjuk: 'Nomor aktif WhatsApp.' }) +
      fTeks('email', 'Email Aktif', { tipe: 'email', ac: 'email', im: 'email', ph: 'nama@gmail.com', petunjuk: 'Untuk informasi jadwal.' }) + '</div>';
    return h;
  }

  function hKontak() {
    var dl = '<datalist id="daftar-hubungan">' + L.OPSI.hubungan.map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>';
    var h = '<div class="bagian-label">Bagian D</div><h2>Kontak Lainnya</h2>';
    /** Catatan di atas, lalu kolom read-only (grid = 2 kolom berdampingan di layar lebar). */
    function otomatis(idInfo, teksInfo, kolom, grid) {
      return '<p class="petunjuk" id="' + idInfo + '">ℹ️ ' + teksInfo + '</p>' + (grid ? '<div class="grid-2">' : '') + kolom.map(function (k) {
        return '<div class="bidang"><label for="' + k[0] + '">' + k[1] + '</label><input type="' + (k[3] || 'text') + '" id="' + k[0] + '" value="' + esc(k[2]) +
          '" readonly aria-readonly="true" aria-describedby="' + idInfo + '"></div>';
      }).join('') + (grid ? '</div>' : '');
    }
    var guruManual = '<div class="grid-2">' + fTeks('namaGuru', 'Nama Guru', { maks: 100 }) +
      fTeks('hpGuru', 'Nomor HP Guru', { tipe: 'tel', im: 'tel', ph: '0812-xxxx-xxxx' }) + '</div>';
    function waliManual(sebutan) {
      return fTeks('namaWali', 'Nama ' + sebutan, { maks: 100 }) +
        fTeks('hubunganWali', 'Peran/Hubungan dengan Anak', { petunjuk: 'Contoh: Ayah, Ibu, Wali, Tante, Kakak, dan lainnya.', maks: 60, list: 'daftar-hubungan' }) +
        fTeks('hpWali', 'Nomor HP ' + sebutan, { tipe: 'tel', im: 'tel', ph: '0812-xxxx-xxxx' });
    }
    if (L.pendaftarSekolah(D)) {
      // Guru / Kepala Sekolah: data guru otomatis, kontak orang tua/wali diisi manual
      var g = L.kontakGuru(D);
      h += '<div class="sub"><h3>1. Identitas Guru/Pihak Sekolah</h3>' +
        otomatis('info-guru-otomatis', 'Data kontak guru diambil otomatis dari identitas pendaftar.',
          [['namaGuruOtomatis', 'Nama Guru', g.nama], ['hpGuruOtomatis', 'Nomor HP Guru', L.tampilHP(g.hp), 'tel']], true) + '</div>';
      h += '<div class="sub"><h3>2. Kontak Orang Tua/Wali Murid</h3><p class="petunjuk">Agar ULD dapat menghubungi orang tua atau wali murid secara langsung.</p>' +
        waliManual('Orang Tua/Wali Murid') + '</div>';
    } else if (L.pendaftarOrangTua(D)) {
      // Orang Tua: kontak orang tua otomatis dari pendaftar, kontak guru diisi manual
      h += '<div class="sub"><h3>1. Kontak Guru</h3><p class="petunjuk">Wajib diisi agar ULD dapat berkoordinasi dengan sekolah.</p>' + guruManual + '</div>';
      var w = L.kontakWali(D);
      h += '<div class="sub"><h3>2. Kontak Orang Tua/Wali</h3>' +
        otomatis('info-wali-otomatis', 'Data orang tua diambil otomatis dari identitas pendaftar.',
          [['namaWaliOtomatis', 'Nama Orang Tua/Wali', w.nama], ['hubunganWaliOtomatis', 'Peran/Hubungan dengan Anak', w.hubungan],
           ['hpWaliOtomatis', 'Nomor HP Orang Tua/Wali', L.tampilHP(w.hp), 'tel']]) + '</div>';
    } else {
      // Anggota Keluarga Lainnya: semua kontak wajib diisi manual
      h += '<div class="sub"><h3>1. Kontak Guru</h3>' + guruManual + '</div>';
      h += '<div class="sub"><h3>2. Kontak Orang Tua/Wali Lainnya</h3>' + waliManual('Orang Tua/Wali Lainnya') + '</div>';
    }
    return h + dl;
  }

  function hNpsn() {
    var h = '<div class="' + kelasBidang('npsn') + '" id="b-npsn"><label for="npsn">NPSN Sekolah' + tandaWajib() + '</label>' +
      '<p class="petunjuk" id="p-npsn">Masukkan 8 digit Nomor Pokok Sekolah Nasional. Nama sekolah akan muncul otomatis.</p>' +
      '<div class="npsn-baris"><input type="text" id="npsn" name="npsn" inputmode="numeric" maxlength="8" autocomplete="off" placeholder="Contoh: 20100123" value="' + esc(D.npsn || '') + '"' + aria('npsn', true) + '>' +
      '<button type="button" class="tombol tombol-garis" data-aksi="cari-npsn">Cari</button></div>' +
      '<div id="npsn-hasil" aria-live="polite">' + hHasilNpsn() + '</div>' + pesanGalat('npsn') + '</div>';
    if (D.sekolahManual === true) h += fTeks('namaSekolahManual', 'Nama Sekolah (isi manual)', { maks: 150, petunjuk: 'Data ini akan <strong>diverifikasi</strong> oleh petugas ULD.' });
    return h;
  }
  function hHasilNpsn() {
    if (sekolah.status === 'mencari') return '<p class="petunjuk" style="margin-top:8px">Mencari sekolah…</p>';
    if (sekolah.status === 'ditemukan') {
      var s = sekolah.data;
      return '<div class="sekolah-kartu"><b>✓ Sekolah ditemukan</b><label for="namaSekolah" class="sr">Nama Sekolah</label>' +
        '<input type="text" id="namaSekolah" value="' + esc(s.nama) + '" readonly style="margin-top:6px">' +
        (s.jenjang || s.kota ? '<small>' + esc([s.jenjang, s.status, s.kecamatan, s.kota].filter(Boolean).join(' · ')) + '</small>' : '') + '</div>';
    }
    if (sekolah.status === 'tidak' || D.sekolahManual === true) {
      return '<div class="info peringatan" style="margin:10px 0 0"><span class="ikon" aria-hidden="true">🔎</span><div>' +
        (sekolah.status === 'tidak' ? 'Sekolah tidak ditemukan. Mohon periksa kembali NPSN yang dimasukkan.' : '') +
        '<label class="pilihan" style="margin-top:8px"><input type="checkbox" name="sekolahManual"' + (D.sekolahManual === true ? ' checked' : '') +
        '><span>NPSN sudah benar, tetapi sekolah tidak ada di daftar — isi nama sekolah manual (akan diverifikasi petugas)</span></label></div></div>';
    }
    if (sekolah.status === 'galat') return '<p class="galat">Gagal memeriksa NPSN. Periksa koneksi lalu tekan Cari.</p>';
    return '';
  }

  /** Tanggal lahir dalam urutan Tanggal – Bulan – Tahun (tidak bergantung format tanggal peramban). */
  var NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  function bagianTanggalLahir() {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(D.tanggalLahir || '');
    return { h: D.tl_hari || (m ? m[3] : ''), b: D.tl_bulan || (m ? m[2] : ''), t: D.tl_tahun || (m ? m[1] : '') };
  }
  function fTanggalLahir() {
    var p = bagianTanggalLahir(), k = 'tanggalLahir';
    var thIni = +String(C.TANGGAL_HARI_INI).slice(0, 4), opsiHari = '', opsiTahun = '';
    for (var i = 1; i <= 31; i++) { var v = ('0' + i).slice(-2); opsiHari += '<option value="' + v + '"' + (p.h === v ? ' selected' : '') + '>' + i + '</option>'; }
    for (var y = thIni; y >= thIni - 30; y--) opsiTahun += '<option' + (p.t === String(y) ? ' selected' : '') + '>' + y + '</option>';
    var opsiBulan = NAMA_BULAN.map(function (n, i) { var v = ('0' + (i + 1)).slice(-2); return '<option value="' + v + '"' + (p.b === v ? ' selected' : '') + '>' + n + '</option>'; }).join('');
    var ar = galat[k] ? ' aria-invalid="true" aria-describedby="e-' + k + '"' : '';
    return '<fieldset class="' + kelasBidang(k) + '" id="b-' + k + '"><legend>Tanggal Lahir Anak' + tandaWajib() + '</legend>' +
      '<p class="petunjuk">Pilih tanggal, bulan, lalu tahun.</p><div class="tgl-tiga">' +
      '<div><label class="tgl-label" for="tanggalLahir">Tanggal</label><select id="tanggalLahir" name="tl_hari"' + ar + '><option value="">Tgl</option>' + opsiHari + '</select></div>' +
      '<div><label class="tgl-label" for="tl_bulan">Bulan</label><select id="tl_bulan" name="tl_bulan"' + ar + '><option value="">Bulan</option>' + opsiBulan + '</select></div>' +
      '<div><label class="tgl-label" for="tl_tahun">Tahun</label><select id="tl_tahun" name="tl_tahun"' + ar + '><option value="">Tahun</option>' + opsiTahun + '</select></div>' +
      '</div>' + pesanGalat(k) + '</fieldset>';
  }
  function susunTanggalLahir() {
    var p = bagianTanggalLahir();
    // Disimpan sebagai TTTT-BB-HH agar usia dapat dihitung; ditampilkan sebagai "21 April 2018"
    D.tanggalLahir = p.h && p.b && p.t ? p.t + '-' + p.b + '-' + p.h : '';
  }

  function teksUsia() {
    if (!D.tanggalLahir) return '<span class="opsional">Terisi otomatis setelah tanggal lahir dipilih</span>';
    var u = L.hitungUsia(D.tanggalLahir, CTX.tanggalAcuan);
    if (!u) return '—';
    if (u.masaDepan) return '<span style="color:var(--merah)">Tanggal lahir di masa depan</span>';
    return esc(u.teks);
  }

  function hAnak() {
    var h = '<div class="bagian-label">Bagian E</div><h2>Identitas Anak/Murid</h2><p class="petunjuk">Seluruh kolom wajib diisi.</p>';
    h += hNpsn();
    if (C.TAMPILKAN_NAMA_ANAK !== false) h += fTeks('namaAnak', 'Nama Lengkap Anak/Murid', { maks: 100 });
    h += fRadio('jenisKelamin', 'Jenis Kelamin', L.OPSI.jenisKelamin);
    h += fTeks('tempatLahir', 'Tempat Lahir', { maks: 60, ph: 'Contoh: Jakarta' });
    h += fTanggalLahir();
    h += '<div class="bidang"><label>Usia Anak <span class="opsional">(otomatis)</span></label><div class="usia" id="usia" aria-live="polite">' + teksUsia() + '</div>' +
      '<p class="petunjuk" style="margin-top:6px">Dihitung per tanggal ' + esc(formatTanggal(CTX.tanggalAcuan)) + '.</p></div>';
    h += '<div class="grid-2">' + fTeks('namaAyah', 'Nama Lengkap Ayah', { maks: 100 }) + fTeks('namaIbu', 'Nama Lengkap Ibu', { maks: 100 }) + '</div>';
    h += fRadio('layanan', 'Layanan Konsultasi yang Dibutuhkan', L.OPSI.layanan, { petunjuk: '<strong>Pendaftar hanya boleh memilih satu layanan.</strong>', kelas: 'layanan', pecah: true, nomor: true });
    h += fArea('kondisi', 'Ceritakan Kondisi Anak/Murid Anda', { kelas: 'besar', maks: 3000,
      petunjuk: 'Silakan sebutkan nama anak, jenjangnya (bila sudah sekolah), dan kendala yang dihadapi anak dengan jelas, dan tujuan dari konsultasi akan diperuntukkan untuk apa.' });
    h += fRadio('pernahTes', 'Pernah Melakukan Tes IQ, BERA, Asesmen Diagnosa dan Sejenisnya?', L.OPSI.yaTidak,
      { petunjuk: 'Jawaban ini menentukan dokumen yang perlu diunggah pada langkah berikutnya.' });
    return h;
  }

  function hBerkas() {
    var info = L.infoBerkas(D);
    var h = '<div class="bagian-label">Bagian F</div><h2>Tambah Berkas</h2>';
    if (FILE && FILE.untuk !== D.pernahTes) { FILE = null; D.berkas = null; h += '<div class="info peringatan"><span class="ikon">⚠️</span><div>Jawaban tentang tes sebelumnya berubah. Silakan unggah ulang berkas yang sesuai.</div></div>'; }
    if (info.perluJenis) h += fPilih('jenisDokumen', 'Jenis dokumen yang diunggah', L.OPSI.jenisDokumen.map(function (j) { return j[0]; }),
      { petunjuk: 'Pilih yang paling sesuai. Bila dokumen gabungan, pilih dokumen utama.' });
    h += '<div class="' + kelasBidang('berkas') + '" id="b-berkas"><label for="berkas">' + esc(info.label) + tandaWajib() + '</label>' +
      '<p class="petunjuk" id="p-berkas">' + esc(L.PETUNJUK_BERKAS) + '</p>';
    if (FILE) {
      h += '<div class="berkas-terpilih"><span aria-hidden="true" style="font-size:1.6rem">📄</span><div class="nama">' + esc(FILE.nama) +
        '<small>' + ukuranTeks(FILE.ukuran) + ' · PDF siap dikirim</small></div><button type="button" class="tombol tombol-garis tombol-kecil" data-aksi="hapus-berkas">Ganti</button></div>';
    } else {
      h += '<div class="unggah" id="zona"><div class="ikon-besar" aria-hidden="true">⬆️</div><strong>Pilih file PDF</strong> atau seret ke sini' +
        '<div class="petunjuk" style="margin:4px 0 0">Format PDF · maks. ' + C.UKURAN_MAKS_MB + ' MB</div>' +
        '<input type="file" id="berkas" name="berkas" accept="application/pdf,.pdf"' + aria('berkas', true) + '></div>';
    }
    return h + pesanGalat('berkas') + '</div>';
  }

  function hTinjau() {
    var a = L.dataAktif(D, CTX);
    function baris(lbl, v) { return v ? '<dt>' + esc(lbl) + '</dt><dd>' + esc(v) + '</dd>' : ''; }
    function blok(judul, idx, isi) {
      return '<section class="ringkas"><div class="ringkas-kepala"><h3>' + judul + '</h3><button type="button" class="tombol-teks" data-aksi="ke" data-langkah="' + idx + '">Ubah</button></div><dl>' + isi + '</dl></section>';
    }
    var h = '<div class="bagian-label">Langkah terakhir</div><h2>Periksa Kembali Data Anda</h2><p class="petunjuk">Pastikan seluruh data sudah benar sebelum dikirim.</p>';
    h += blok('Pertanyaan Pembuka', 0, baris('Pernah konsultasi di ULD', a.pernahKonsultasi) + baris('Punya hasil screening/diagnosa', a.punyaScreening));
    h += blok('Kelayakan Pendaftaran', 1, baris(LABEL_B.sudahSekolah, a.sudahSekolah) + baris(LABEL_B.sekolahJakarta, a.sekolahJakarta) + baris(LABEL_B.ktpJakarta, a.ktpJakarta) + baris('Catatan', a.prioritas));
    h += blok('Data Pendaftar', 2, baris('Nama pendaftar', a.namaPendaftar) + baris('Peran', a.peran) + baris('Nomor HP', L.tampilHP(a.hp)) + baris('Email', a.email));
    h += blok('Kontak Lainnya', 3, baris('Nama guru', a.namaGuru) + baris('Nomor HP guru', L.tampilHP(a.hpGuru)) + baris('Nama orang tua/wali', a.namaWali) + baris('Hubungan dengan anak', a.hubunganWali) + baris('Nomor HP orang tua/wali', L.tampilHP(a.hpWali)));
    h += blok('Identitas Anak/Murid', 4, baris('NPSN', a.npsn) + baris('Nama sekolah', a.namaSekolah ? a.namaSekolah + (D.sekolahManual === true ? ' (perlu verifikasi)' : '') : a.statusSekolah) +
      baris('Nama anak/murid', a.namaAnak) + baris('Jenis kelamin', a.jenisKelamin) + baris('Tempat, tanggal lahir', a.tempatLahir + ', ' + formatTanggal(a.tanggalLahir)) + baris('Usia', a.usia) +
      baris('Nama ayah', a.namaAyah) + baris('Nama ibu', a.namaIbu) + baris('Layanan', a.layanan) + baris('Kondisi anak/murid', a.kondisi) + baris('Pernah tes IQ/BERA/asesmen', a.pernahTes));
    h += blok('Berkas', 5, baris('Jenis dokumen', a.jenisDokumen) + baris('File', FILE ? FILE.nama + ' (' + ukuranTeks(FILE.ukuran) + ')' : '-'));
    h += '<fieldset class="' + kelasBidang('persetujuan') + '" id="b-persetujuan"><legend class="sr">Pernyataan</legend><label class="pilihan"><input type="checkbox" name="persetujuan" id="persetujuan"' +
      (D.persetujuan === true ? ' checked' : '') + aria('persetujuan') + '><span>Saya menyatakan data yang saya isi adalah benar, dan saya bersedia dihubungi oleh petugas ULD Dinas Pendidikan Provinsi DKI Jakarta untuk keperluan layanan konsultasi.</span></label>' +
      pesanGalat('persetujuan') + '</fieldset>';
    if (galat._kirim) h += '<div class="info bahaya" role="alert"><span class="ikon">⚠️</span><div>' + esc(galat._kirim) + '</div></div>';
    return h;
  }

  function hSukses() {
    var r = hasilKirim;
    return '<div class="kartu sukses"><div class="centang" aria-hidden="true">✓</div><h1>Pendaftaran Berhasil Dikirim</h1>' +
      '<p>Terima kasih, <strong>' + esc(D.namaPendaftar) + '</strong>. Data Anda sudah kami terima.</p><p style="margin:0">Nomor registrasi Anda:</p>' +
      '<div class="noreg" id="noreg">' + esc(r.noReg) + '</div>' +
      '<p class="petunjuk">Simpan nomor ini. Petugas ULD akan menghubungi Anda melalui nomor HP atau email yang terdaftar untuk informasi jadwal konsultasi.</p>' +
      '<div class="baris-tombol" style="justify-content:center"><button type="button" class="tombol tombol-garis" data-aksi="salin">Salin Nomor</button>' +
      '<a class="tombol tombol-wa" target="_blank" rel="noopener noreferrer" href="' + urlWA('Halo Admin ULD, saya ' + D.namaPendaftar + ' sudah mendaftar konsultasi SELARAS dengan nomor registrasi ' + r.noReg + '.') + '">Konfirmasi via WhatsApp</a>' +
      '<button type="button" class="tombol tombol-utama" data-aksi="awal">Kembali ke Beranda</button></div></div>';
  }

  var RENDER = { pembuka: hPembuka, kelayakan: hKelayakan, pendaftar: hPendaftar, kontak: hKontak, anak: hAnak, berkas: hBerkas, tinjau: hTinjau };

  function render(fokusId) {
    if (hasilKirim) { app.innerHTML = hSukses(); return; }
    if (langkah < 0) { app.innerHTML = hBeranda(); return; }
    var id = L.LANGKAH[langkah].id;
    var akhir = id === 'tinjau';
    app.innerHTML = kepalaLangkah() + '<form class="kartu" novalidate onsubmit="return false">' +
      '<div class="sr" aria-hidden="true"><label>Website <input name="website" tabindex="-1" autocomplete="off"></label></div>' +
      RENDER[id]() + navigasi(akhir ? 'Kirim Pendaftaran' : '') + '</form>';
    if (fokusId) { var f = document.getElementById(fokusId); if (f) f.focus(); }
  }

  function keLangkah(i) {
    langkah = i; galat = {};
    render();
    window.scrollTo(0, 0);
    var h = app.querySelector('h2'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }

  function lanjut() {
    var id = L.LANGKAH[langkah].id;
    galat = L.validasiLangkah(id, D, CTX);
    if (galat._tolak === 'tolak_screening') return modalScreening();
    if (galat._tolak === 'tolak_sekolah') return modalSekolah();
    if (Object.keys(galat).length) {
      render();
      var k = Object.keys(galat)[0];
      var el = document.getElementById(k) || document.querySelector('[name="' + k + '"]') || document.getElementById('b-' + k);
      var b = document.getElementById('b-' + k);
      if (b) b.scrollIntoView({ block: 'center' });
      if (el && el.focus) el.focus({ preventScroll: true });
      return;
    }
    if (id === 'tinjau') return kirim();
    keLangkah(langkah + 1);
  }

  // ---------------- NPSN ----------------
  function cariNpsn() {
    var n = String(D.npsn || '').trim();
    if (!/^\d{8}$/.test(n)) { sekolah = { status: '', npsn: '' }; perbaruiNpsn(); return; }
    if (sekolah.npsn === n && (sekolah.status === 'ditemukan' || sekolah.status === 'mencari')) return;
    sekolah = { status: 'mencari', npsn: n }; perbaruiNpsn();
    api('cariSekolah', n).then(function (r) {
      if (sekolah.npsn !== n) return;
      if (!r.ok) sekolah.status = 'galat';
      else if (r.ditemukan) { sekolah.status = 'ditemukan'; sekolah.data = r.sekolah; D.namaSekolah = r.sekolah.nama; D.sekolahManual = false; delete galat.npsn; }
      else { sekolah.status = 'tidak'; D.namaSekolah = ''; }
      render('npsn');
    }).catch(function () { if (sekolah.npsn === n) { sekolah.status = 'galat'; perbaruiNpsn(); } });
  }
  function perbaruiNpsn() { var w = document.getElementById('npsn-hasil'); if (w) w.innerHTML = hHasilNpsn(); }

  // ---------------- Berkas ----------------
  function pilihBerkas(file) {
    delete galat.berkas;
    var bacaan = { nama: file.name, tipe: file.type || 'application/pdf', ukuran: file.size };
    var e = L.validasiLangkah('berkas', { berkas: bacaan });
    if (e.berkas) { galat.berkas = e.berkas; render(); return; }
    file.slice(0, 5).arrayBuffer().then(function (buf) {
      var t = String.fromCharCode.apply(null, new Uint8Array(buf));
      if (t.indexOf('%PDF') !== 0) throw new Error('bukan-pdf');
      return new Promise(function (ok, gagal) {
        var fr = new FileReader();
        fr.onload = function () { ok(String(fr.result).split(',')[1]); };
        fr.onerror = gagal; fr.readAsDataURL(file);
      });
    }).then(function (b64) {
      FILE = { nama: file.name, tipe: 'application/pdf', ukuran: file.size, base64: b64, untuk: D.pernahTes };
      D.berkas = { nama: file.name, tipe: 'application/pdf', ukuran: file.size };
      render();
    }).catch(function (err) {
      galat.berkas = err && err.message === 'bukan-pdf' ? 'Isi file bukan PDF yang valid. Silakan simpan ulang dokumen sebagai PDF.' : 'File tidak dapat dibaca. Silakan coba lagi.';
      render();
    });
  }

  // ---------------- Kirim ----------------
  var BIDANG_LANGKAH = {
    pembuka: ['pernahKonsultasi', 'punyaScreening'],
    kelayakan: ['sudahSekolah', 'sekolahJakarta', 'ktpJakarta'],
    pendaftar: ['namaPendaftar', 'peran', 'hp', 'email'],
    kontak: ['namaGuru', 'hpGuru', 'namaWali', 'hubunganWali', 'hpWali'],
    anak: ['npsn', 'namaSekolahManual', 'namaAnak', 'jenisKelamin', 'tempatLahir', 'tanggalLahir', 'namaAyah', 'namaIbu', 'layanan', 'kondisi', 'pernahTes'],
    berkas: ['jenisDokumen', 'berkas']
  };
  function langkahUntuk(k) {
    for (var i = 0; i < L.LANGKAH.length; i++) { var b = BIDANG_LANGKAH[L.LANGKAH[i].id]; if (b && b.indexOf(k) !== -1) return i; }
    return L.LANGKAH.length - 1;
  }
  function kirim() {
    var muat = document.createElement('div');
    muat.className = 'memuat'; muat.setAttribute('role', 'status');
    muat.innerHTML = '<div class="putar" aria-hidden="true"></div><div>Mengirim pendaftaran…<br><small style="font-weight:500">Mohon tidak menutup halaman ini.</small></div>';
    document.body.appendChild(muat);
    var data = {}; Object.keys(D).forEach(function (k) { data[k] = D[k]; });
    api('kirimPendaftaran', data, { nama: FILE.nama, tipe: FILE.tipe, ukuran: FILE.ukuran, base64: FILE.base64 }).then(function (r) {
      muat.remove();
      if (r.ok) { hasilKirim = r; FILE = null; render(); window.scrollTo(0, 0); return; }
      if (r.bidang) {
        var langkahGalat = Math.min.apply(null, Object.keys(r.bidang).map(langkahUntuk));
        if (r.bidang.npsn) { sekolah = { status: 'tidak', npsn: D.npsn }; D.namaSekolah = ''; }
        if (langkahGalat >= 0) { keLangkah(langkahGalat); galat = r.bidang; render(); return; }
      }
      galat = { _kirim: r.galat || 'Pendaftaran belum berhasil dikirim.' }; render();
    }).catch(function () {
      muat.remove();
      galat = { _kirim: 'Koneksi terputus saat mengirim. Periksa internet Anda lalu tekan Kirim Pendaftaran lagi.' }; render();
    });
  }

  // ---------------- Event ----------------
  app.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-aksi]'); if (!b) return;
    var a = b.getAttribute('data-aksi');
    if (a === 'mulai') { D.mulaiPada = Date.now(); if (!D.idKirim) D.idKirim = idBaru(); keLangkah(0); }
    else if (a === 'lanjut') lanjut();
    else if (a === 'kembali') { if (langkah === 0) { langkah = -1; render(); } else keLangkah(langkah - 1); }
    else if (a === 'ke') keLangkah(+b.getAttribute('data-langkah'));
    else if (a === 'cari-npsn') { sekolah.npsn = ''; cariNpsn(); }
    else if (a === 'hapus-berkas') { FILE = null; D.berkas = null; render('berkas'); }
    else if (a === 'awal') ulangDariAwal();
    else if (a === 'salin') {
      var t = hasilKirim.noReg;
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { b.textContent = 'Tersalin ✓'; })
        .catch(function () { var r = document.createRange(); r.selectNodeContents(document.getElementById('noreg')); var s = getSelection(); s.removeAllRanges(); s.addRange(r); });
    }
  });

  app.addEventListener('change', function (ev) {
    var t = ev.target, k = t.name; if (!k) return;
    if (t.type === 'radio') {
      D[k] = t.value; delete galat[k];
      if (k === 'punyaScreening' && t.value === 'Tidak') { render(t.id); return modalScreening(); }
      if (L.LANGKAH[langkah].id === 'kelayakan') {
        var s = L.alurKelayakan(D);
        render(t.id);
        if (s.status === 'tolak_sekolah') modalSekolah();
        return;
      }
      render(t.id);
    } else if (t.type === 'checkbox') {
      D[k] = t.checked; delete galat[k];
      if (k === 'sekolahManual') { delete galat.npsn; render('npsn'); var m = document.getElementById('namaSekolahManual'); if (t.checked && m) m.focus(); }
    } else if (t.type === 'file') {
      if (t.files && t.files[0]) pilihBerkas(t.files[0]);
    } else if (k === 'tl_hari' || k === 'tl_bulan' || k === 'tl_tahun') {
      D[k] = t.value; susunTanggalLahir();
      var u = document.getElementById('usia'); if (u) u.innerHTML = teksUsia();
      if (galat.tanggalLahir && D.tanggalLahir) { delete galat.tanggalLahir; render(t.id); }
    } else if (t.tagName === 'SELECT') { D[k] = t.value; }
  });

  app.addEventListener('input', function (ev) {
    var t = ev.target, k = t.name; if (!k || t.type === 'radio' || t.type === 'checkbox' || t.type === 'file') return;
    if (k === 'npsn') {
      t.value = t.value.replace(/\D/g, '').slice(0, 8);
      if (t.value !== D.npsn) { D.namaSekolah = ''; if (sekolah.status !== 'tidak' || t.value.length === 8) { sekolah = { status: '', npsn: '' }; } }
      D.npsn = t.value; perbaruiNpsn();
      clearTimeout(timerNpsn);
      if (t.value.length === 8) timerNpsn = setTimeout(cariNpsn, 350);
      return;
    }
    D[k] = t.value;
    if (galat[k]) {   // hapus pesan kesalahan begitu kolom diperbaiki
      delete galat[k];
      var bk = document.getElementById('b-' + k), ek = document.getElementById('e-' + k);
      if (bk) bk.classList.remove('ada-galat');
      if (ek) ek.remove();
      t.removeAttribute('aria-invalid');
    }
    if (k === 'tanggalLahir') { var u = document.getElementById('usia'); if (u) u.innerHTML = teksUsia(); }
    var h = document.getElementById('h-' + k); if (h) h.textContent = t.value.length + ' / ' + t.maxLength;
  });

  app.addEventListener('dragenter', function (ev) { var z = ev.target.closest && ev.target.closest('.unggah'); if (z) z.classList.add('seret'); });
  app.addEventListener('dragleave', function (ev) { var z = ev.target.closest && ev.target.closest('.unggah'); if (z) z.classList.remove('seret'); });

  window.addEventListener('beforeunload', function (ev) {
    if (langkah >= 0 && !hasilKirim) { ev.preventDefault(); ev.returnValue = ''; }
  });

  render();
})();
