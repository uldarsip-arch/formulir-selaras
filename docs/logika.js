/**
 * ============================================================
 *  LOGIKA PERCABANGAN, VALIDASI & ATURAN REKAP (SATU SUMBER KEBENARAN)
 * ============================================================
 *  Fungsi buatLogika() dipakai di TIGA tempat:
 *   1. Server (Kode.gs/Admin.gs) — memvalidasi ulang setiap kiriman,
 *      menentukan status awal, nama berkas, dan kuota.
 *   2. Formulir publik — kode sumbernya disisipkan ke halaman (Index.html).
 *   3. Panel admin — pengelompokan jenjang, wilayah Sudin, usia, dan kuota
 *      untuk dashboard.
 *  Karena itu fungsi ini TIDAK BOLEH memakai layanan Apps Script
 *  (SpreadsheetApp, DriveApp, dsb.) — hanya JavaScript murni.
 */
function buatLogika(CFG) {
  'use strict';
  CFG = CFG || {};

  var OPSI = {
    yaTidak: ['Ya', 'Tidak'],
    sudahBelum: ['Sudah', 'Belum'],
    peran: ['Kepala Sekolah', 'Guru', 'Orang Tua', 'Anggota Keluarga Lainnya'],
    jenisKelamin: ['Laki-Laki', 'Perempuan'],
    layanan: [
      'Tes IQ',
      'Asesmen Diagnosa (Psikologis)',
      'Asesmen Kesiapan Belajar (persiapan masuk sekolah)',
      'Konsultasi Psikologi Perkembangan Anak (sudah memiliki hasil tes psikologi sebelumnya)',
      'Konsultasi Pembelajaran (Penyusunan perangkat ajar, saran pembelajaran, dll)'
    ],
    // Saran isian "Peran/Hubungan dengan Anak" (tetap bisa diketik bebas)
    hubungan: ['Ayah', 'Ibu', 'Wali', 'Tante', 'Om', 'Kakak', 'Kakek', 'Nenek'],
    // Jenis dokumen bila pernah tes (menentukan nama file di Google Drive)
    jenisDokumen: [
      ['Hasil Tes IQ', 'HASIL_IQ'],
      ['Hasil Asesmen / Pemeriksaan Psikologis', 'HASIL_ASESMEN'],
      ['Laporan Medis / Pemeriksaan Dokter', 'LAPORAN_MEDIS'],
      ['Laporan Terapis', 'LAPORAN_TERAPIS']
    ],
    jenjangRekap: ['PAUD/TK', 'SD/MI', 'SMP/MTs', 'SMA/MA', 'SMK', 'SLB', 'Lainnya'],
    wilayahSudin: ['Jakarta Pusat', 'Jakarta Utara', 'Jakarta Barat', 'Jakarta Selatan', 'Jakarta Timur', 'Kepulauan Seribu']
  };

  var LANGKAH = [
    { id: 'pembuka',   judul: 'Pertanyaan Pembuka' },
    { id: 'kelayakan', judul: 'Kelayakan Pendaftaran' },
    { id: 'pendaftar', judul: 'Data Pendaftar' },
    { id: 'kontak',    judul: 'Kontak Lainnya' },
    { id: 'anak',      judul: 'Identitas Anak/Murid' },
    { id: 'berkas',    judul: 'Tambah Berkas' },
    { id: 'tinjau',    judul: 'Periksa & Kirim' }
  ];

  var MAKS_MB = CFG.UKURAN_MAKS_MB || 10;

  // ---------------- Utilitas ----------------
  function isi(v) { return v !== undefined && v !== null && String(v).trim() !== ''; }
  function rapikan(v) { return isi(v) ? String(v).replace(/\s+/g, ' ').trim() : ''; }
  function dalam(v, daftar) { return daftar.indexOf(v) !== -1; }

  /** Nomor HP Indonesia → format baku 628xxxxxxxxx. Kembalikan '' bila tidak valid. */
  function normalisasiHP(v) {
    if (!isi(v)) return '';
    var s = String(v).replace(/[\s\-().]/g, '');
    if (s.indexOf('+') === 0) s = s.slice(1);
    if (s.indexOf('62') === 0) s = '0' + s.slice(2);
    if (!/^08[1-9][0-9]{7,10}$/.test(s)) return '';
    return '62' + s.slice(1);
  }
  /** 628123456789 → +62 812-3456-789 (untuk tampilan) */
  function tampilHP(v) {
    var n = normalisasiHP(v);
    if (!n) return rapikan(v);
    var lokal = n.slice(2);
    return '+62 ' + lokal.slice(0, 3) + '-' + lokal.slice(3, 7) + '-' + lokal.slice(7);
  }
  function emailValid(v) {
    return /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(String(v || '').trim());
  }
  function parseTanggal(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return { y: y, m: mo, d: d };
  }
  /** Usia (tahun & bulan penuh) dari tanggal lahir terhadap tanggal acuan. Format 'YYYY-MM-DD'. */
  function hitungUsia(tglLahir, tglAcuan) {
    var b = parseTanggal(tglLahir), a = parseTanggal(tglAcuan);
    if (!b || !a) return null;
    var nb = b.y * 10000 + b.m * 100 + b.d, na = a.y * 10000 + a.m * 100 + a.d;
    if (nb > na) return { masaDepan: true };
    var tahun = a.y - b.y, bulan = a.m - b.m;
    if (a.d < b.d) bulan--;
    if (bulan < 0) { tahun--; bulan += 12; }
    return { tahun: tahun, bulan: bulan, teks: tahun + ' tahun ' + bulan + ' bulan' };
  }

  // ---------------- Percabangan ----------------
  /**
   * Bagian A. status: 'belum' | 'lanjut' | 'tolak_screening'
   */
  function alurPembuka(d) {
    var tampil = ['pernahKonsultasi', 'punyaScreening'];
    if (d.punyaScreening === 'Tidak') return { tampil: tampil, status: 'tolak_screening' };
    var lengkap = dalam(d.pernahKonsultasi, OPSI.yaTidak) && d.punyaScreening === 'Ya';
    return { tampil: tampil, status: lengkap ? 'lanjut' : 'belum' };
  }

  /**
   * Bagian B.
   *  Belum sekolah                → tolak_sekolah
   *  Sekolah di luar Jakarta      → tolak_sekolah
   *  Sekolah di Jakarta + KTP DKI → lanjut, prioritas
   *  Sekolah di Jakarta + KTP non-DKI → lanjut, BUKAN prioritas (tidak ditolak)
   */
  function alurKelayakan(d) {
    var tampil = ['sudahSekolah'];
    if (!dalam(d.sudahSekolah, OPSI.sudahBelum)) return { tampil: tampil, status: 'belum' };
    if (d.sudahSekolah === 'Belum') return { tampil: tampil, status: 'tolak_sekolah' };
    tampil.push('sekolahJakarta');
    if (!dalam(d.sekolahJakarta, OPSI.yaTidak)) return { tampil: tampil, status: 'belum' };
    if (d.sekolahJakarta === 'Tidak') return { tampil: tampil, status: 'tolak_sekolah' };
    tampil.push('ktpJakarta');
    if (!dalam(d.ktpJakarta, OPSI.yaTidak)) return { tampil: tampil, status: 'belum' };
    return { tampil: tampil, status: 'lanjut', prioritas: d.ktpJakarta === 'Ya' };
  }

  function perluNPSN(d) { return alurKelayakan(d).status === 'lanjut'; }
  function pendaftarSekolah(d) { return d.peran === 'Guru' || d.peran === 'Kepala Sekolah'; }
  /** Guru/Kepala Sekolah: kontak guru = identitas pendaftar (read only). */
  function kontakGuru(d) {
    if (pendaftarSekolah(d)) return { nama: rapikan(d.namaPendaftar), hp: d.hp || '', otomatis: true };
    return { nama: d.namaGuru || '', hp: d.hpGuru || '', otomatis: false };
  }
  /** Orang Tua: kontak orang tua/wali = identitas pendaftar (read only). */
  function pendaftarOrangTua(d) { return d.peran === 'Orang Tua'; }
  function kontakWali(d) {
    if (pendaftarOrangTua(d)) return { nama: rapikan(d.namaPendaftar), hubungan: 'Orang Tua', hp: d.hp || '', otomatis: true };
    return { nama: d.namaWali || '', hubungan: d.hubunganWali || '', hp: d.hpWali || '', otomatis: false };
  }
  /** Status awal saat formulir terkirim. */
  function statusAwal(d) { return d.ktpJakarta === 'Tidak' ? 'Baru: KTP Non DKI' : 'Baru'; }
  function teksPrioritas(d) {
    return d.ktpJakarta === 'Tidak' ? 'Bukan prioritas (KTP non-DKI)' : (d.ktpJakarta === 'Ya' ? 'Prioritas (KTP DKI Jakarta)' : '');
  }

  function infoBerkas(d) {
    if (d.pernahTes === 'Ya') {
      var kode = '';
      OPSI.jenisDokumen.forEach(function (j) { if (j[0] === d.jenisDokumen) kode = j[1]; });
      return { kode: kode || 'HASIL_TES', perluJenis: true,
        label: 'Silakan unggah hasil tes IQ, Pemeriksaan Dokter, atau Laporan Medis dan Terapis lainnya.' };
    }
    if (d.pernahTes === 'Tidak') return { kode: 'HASIL_SCREENING', perluJenis: false,
      label: 'Silakan unggah hasil screening dari guru, terapis, atau ULD Kota.' };
    return null;
  }
  var PETUNJUK_BERKAS = 'Mohon lampirkan berkas yang terbaca jelas dalam satu file PDF (maksimal ' + MAKS_MB +
    ' MB). Jika dokumen lebih dari satu, gabungkan terlebih dahulu menjadi satu file PDF.';

  /** "Melati Putri!" → "MELATI-PUTRI" (aman untuk nama file). */
  function slugNama(s) {
    var t = String(s || '').toUpperCase();
    if (t.normalize) t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
    t = t.replace(/[^A-Z0-9\s-]/g, ' ').trim().replace(/[\s-]+/g, '-');
    return t.slice(0, 60).replace(/-+$/, '') || 'TANPA-NAMA';
  }
  /** ULD-DDMMYYYY-NAMA-JENIS.pdf ; tanggal 'YYYY-MM-DD'. urutan>1 → ...-JENIS-2.pdf */
  function namaFileBerkas(tanggal, nama, kode, urutan) {
    var t = parseTanggal(String(tanggal || '').slice(0, 10));
    var tgl = t ? ('0' + t.d).slice(-2) + ('0' + t.m).slice(-2) + t.y : '00000000';
    var jenis = String(kode || 'BERKAS').toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    return 'ULD-' + tgl + '-' + slugNama(nama) + '-' + jenis + (urutan > 1 ? '-' + urutan : '') + '.pdf';
  }

  // ---------------- Aturan rekap (dashboard & spreadsheet) ----------------
  /** Jenjang dari database sekolah → kategori rekap. Bila kosong, ditebak dari nama sekolah. */
  function kategoriJenjang(jenjang, namaSekolah) {
    function cocok(t) {
      t = ' ' + String(t || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ') + ' ';
      if (/ (SLB|SDLB|SMPLB|SMALB|SMLB)[NS]? |LUAR BIASA/.test(t)) return 'SLB';
      if (/ SMK[NS]? /.test(t)) return 'SMK';
      if (/ (SMA|SMU)[NS]? | MA[NS]? /.test(t)) return 'SMA/MA';
      if (/ (SMP|SLTP)[NS]? | MTS[NS]? /.test(t)) return 'SMP/MTs';
      if (/ SD[NS]? | MI[NS]? /.test(t)) return 'SD/MI';
      if (/ (PAUD|TK|KB|RA|TPA|SPS)[NS]? /.test(t)) return 'PAUD/TK';
      return '';
    }
    return cocok(jenjang) || cocok(namaSekolah) || 'Lainnya';
  }
  /** Sudin/kota dari database sekolah → salah satu dari 6 wilayah. */
  function wilayahSudin(sudin, kota) {
    function cocok(t) {
      t = String(t || '').toUpperCase();
      if (/SERIBU|KEPULAUAN/.test(t)) return 'Kepulauan Seribu';
      if (/PUSAT/.test(t)) return 'Jakarta Pusat';
      if (/UTARA/.test(t)) return 'Jakarta Utara';
      if (/BARAT/.test(t)) return 'Jakarta Barat';
      if (/SELATAN/.test(t)) return 'Jakarta Selatan';
      if (/TIMUR/.test(t)) return 'Jakarta Timur';
      return '';
    }
    return cocok(sudin) || cocok(kota) || '';
  }
  /** "7 tahun 3 bulan" → 7 */
  function usiaTahun(teks) {
    var m = /(\d+)\s*tahun/i.exec(String(teks || ''));
    return m ? +m[1] : null;
  }
  /** "0-5, 6-8, 18+" → [{label,min,max}] */
  function parseKelompokUsia(s) {
    var hasil = [];
    String(s || '').split(',').forEach(function (b) {
      b = b.trim(); var m;
      if ((m = /^(\d+)\s*-\s*(\d+)$/.exec(b))) hasil.push({ label: m[1] + '–' + m[2] + ' th', min: +m[1], max: +m[2] });
      else if ((m = /^(\d+)\s*\+$/.exec(b))) hasil.push({ label: '≥ ' + m[1] + ' th', min: +m[1], max: 999 });
    });
    return hasil;
  }
  function kelompokUsia(tahun, kelompok) {
    if (tahun === null || tahun === undefined || isNaN(tahun)) return 'Tidak diketahui';
    for (var i = 0; i < kelompok.length; i++) if (tahun >= kelompok[i].min && tahun <= kelompok[i].max) return kelompok[i].label;
    return 'Di luar kelompok';
  }
  /** Teks status kuota untuk urutan pendaftar ke-n dalam setahun. */
  function statusKuota(n, kuota) {
    kuota = kuota || 3;
    if (!n) return '';
    if (n < kuota) return n + '/' + kuota;
    if (n === kuota) return 'PENUH ' + n + '/' + kuota;
    return 'MELEBIHI KUOTA ' + n + '/' + kuota;
  }

  // ---------------- Validasi per langkah ----------------
  function validasiLangkah(id, d, ctx) {
    ctx = ctx || {};
    var e = {};
    function pilih(k, daftar) { if (!dalam(d[k], daftar)) e[k] = 'Silakan pilih salah satu jawaban.'; }
    function hp(k, w) {
      if (!isi(d[k])) { if (w) e[k] = 'Nomor HP wajib diisi.'; return; }
      if (!normalisasiHP(d[k])) e[k] = 'Nomor HP tidak valid. Gunakan nomor seluler Indonesia, contoh: 0812-3456-7890.';
    }
    function teks(k, w, min, maks) {
      var v = rapikan(d[k]);
      if (!v) { if (w) e[k] = 'Wajib diisi.'; return; }
      if (min && v.length < min) e[k] = 'Isian terlalu singkat (minimal ' + min + ' karakter).';
      else if (maks && v.length > maks) e[k] = 'Isian terlalu panjang (maksimal ' + maks + ' karakter).';
    }

    if (id === 'pembuka') {
      var a = alurPembuka(d);
      pilih('pernahKonsultasi', OPSI.yaTidak);
      pilih('punyaScreening', OPSI.yaTidak);
      if (a.status === 'tolak_screening') e._tolak = 'tolak_screening';
    }

    if (id === 'kelayakan') {
      var k = alurKelayakan(d);
      k.tampil.forEach(function (q) { pilih(q, q === 'sudahSekolah' ? OPSI.sudahBelum : OPSI.yaTidak); });
      if (k.status === 'tolak_sekolah') e._tolak = 'tolak_sekolah';
    }

    if (id === 'pendaftar') {
      teks('namaPendaftar', true, 3, 100);
      pilih('peran', OPSI.peran);
      hp('hp', true);
      if (!isi(d.email)) e.email = 'Email wajib diisi.';
      else if (!emailValid(d.email)) e.email = 'Format email tidak valid, contoh: nama@gmail.com.';
    }

    if (id === 'kontak') {
      if (!pendaftarSekolah(d)) {   // Guru/Kepala Sekolah: diambil otomatis dari data pendaftar
        teks('namaGuru', true, 3, 100);
        hp('hpGuru', true);
      }
      if (!pendaftarOrangTua(d)) {  // Orang Tua: diambil otomatis dari data pendaftar
        teks('namaWali', true, 3, 100);
        teks('hubunganWali', true, 3, 60);
        hp('hpWali', true);
      }
    }

    if (id === 'anak') {
      if (perluNPSN(d)) {
        if (d.sekolahManual === true) {
          teks('namaSekolahManual', true, 3, 150);
          if (isi(d.npsn) && !/^\d{8}$/.test(String(d.npsn).trim())) e.npsn = 'NPSN terdiri dari 8 digit angka.';
        } else {
          if (!isi(d.npsn)) e.npsn = 'NPSN sekolah wajib diisi.';
          else if (!/^\d{8}$/.test(String(d.npsn).trim())) e.npsn = 'NPSN terdiri dari 8 digit angka.';
          else if (ctx.cekSekolah !== false && !isi(d.namaSekolah)) e.npsn = 'Sekolah belum ditemukan. Periksa kembali NPSN yang dimasukkan.';
        }
      }
      if (CFG.TAMPILKAN_NAMA_ANAK !== false) teks('namaAnak', true, 2, 100);
      pilih('jenisKelamin', OPSI.jenisKelamin);
      teks('tempatLahir', true, 2, 60);
      if (!isi(d.tanggalLahir)) e.tanggalLahir = 'Tanggal lahir wajib diisi.';
      else {
        var u = hitungUsia(d.tanggalLahir, ctx.tanggalAcuan);
        if (!u) e.tanggalLahir = 'Tanggal lahir tidak valid.';
        else if (u.masaDepan) e.tanggalLahir = 'Tanggal lahir tidak boleh di masa depan.';
        else if (u.tahun > 30) e.tanggalLahir = 'Periksa kembali tanggal lahir anak/murid.';
      }
      teks('namaAyah', true, 2, 100);
      teks('namaIbu', true, 2, 100);
      pilih('layanan', OPSI.layanan);
      teks('kondisi', true, 30, 3000);
      pilih('pernahTes', OPSI.yaTidak);
    }

    if (id === 'berkas') {
      if (d.pernahTes === 'Ya') {
        var ok = OPSI.jenisDokumen.some(function (j) { return j[0] === d.jenisDokumen; });
        if (!ok) e.jenisDokumen = 'Pilih jenis dokumen yang diunggah.';
      }
      var b = d.berkas;
      if (!b || !b.nama) e.berkas = 'Silakan unggah berkas PDF.';
      else if (!/\.pdf$/i.test(b.nama) || (b.tipe && b.tipe !== 'application/pdf')) e.berkas = 'Berkas harus berformat PDF.';
      else if (b.ukuran > MAKS_MB * 1024 * 1024) e.berkas = 'Ukuran berkas melebihi ' + MAKS_MB + ' MB.';
      else if (b.ukuran < 1024) e.berkas = 'Berkas tampak kosong atau rusak. Silakan unggah ulang.';
    }

    if (id === 'tinjau') {
      if (d.persetujuan !== true) e.persetujuan = 'Centang pernyataan ini untuk mengirim pendaftaran.';
    }
    return e;
  }

  function validasiSemua(d, ctx) {
    var semua = {};
    LANGKAH.forEach(function (l) {
      var e = validasiLangkah(l.id, d, ctx);
      Object.keys(e).forEach(function (k) { if (!semua[k]) semua[k] = e[k]; });
    });
    return semua;
  }

  /**
   * Hanya bidang yang relevan dengan jawaban yang dikirim sebagai data aktif.
   * (Jawaban di bagian yang tersembunyi tetap tersimpan di layar, tetapi tidak dikirim.)
   */
  function dataAktif(d, ctx) {
    ctx = ctx || {};
    var o = {};
    var a = alurPembuka(d), k = alurKelayakan(d);
    a.tampil.forEach(function (q) { o[q] = d[q]; });
    k.tampil.forEach(function (q) { o[q] = d[q]; });
    o.prioritas = teksPrioritas(d);
    ['namaPendaftar', 'peran', 'email',
      'namaAnak', 'jenisKelamin', 'tempatLahir', 'tanggalLahir', 'namaAyah', 'namaIbu', 'layanan', 'pernahTes'
    ].forEach(function (f) { o[f] = rapikan(d[f]); });
    o.kondisi = String(d.kondisi || '').trim();
    o.email = rapikan(d.email).toLowerCase();
    o.hp = normalisasiHP(d.hp);
    var g = kontakGuru(d);
    o.namaGuru = rapikan(g.nama);
    o.hpGuru = normalisasiHP(g.hp);
    var w = kontakWali(d);
    o.namaWali = rapikan(w.nama);
    o.hubunganWali = rapikan(w.hubungan);
    o.hpWali = normalisasiHP(w.hp);
    o.npsn = rapikan(d.npsn);
    if (d.sekolahManual === true) { o.namaSekolah = rapikan(d.namaSekolahManual); o.statusSekolah = 'PERLU VERIFIKASI (NPSN tidak ditemukan)'; }
    else { o.namaSekolah = rapikan(d.namaSekolah); o.statusSekolah = 'Terverifikasi NPSN'; }
    var u = hitungUsia(d.tanggalLahir, ctx.tanggalAcuan);
    o.usia = u && !u.masaDepan ? u.teks : '';
    o.tanggalAcuanUsia = ctx.tanggalAcuan || '';
    var ib = infoBerkas(d);
    o.jenisBerkas = ib ? ib.kode : '';
    o.jenisDokumen = d.pernahTes === 'Ya' ? rapikan(d.jenisDokumen) : 'Hasil screening guru / terapis / ULD Kota';
    o.persetujuan = d.persetujuan === true;
    return o;
  }

  return {
    OPSI: OPSI, LANGKAH: LANGKAH, PETUNJUK_BERKAS: PETUNJUK_BERKAS,
    isi: isi, rapikan: rapikan, normalisasiHP: normalisasiHP, tampilHP: tampilHP, emailValid: emailValid,
    parseTanggal: parseTanggal, hitungUsia: hitungUsia, alurPembuka: alurPembuka, alurKelayakan: alurKelayakan,
    perluNPSN: perluNPSN, pendaftarSekolah: pendaftarSekolah, kontakGuru: kontakGuru,
    pendaftarOrangTua: pendaftarOrangTua, kontakWali: kontakWali,
    statusAwal: statusAwal, teksPrioritas: teksPrioritas, infoBerkas: infoBerkas,
    slugNama: slugNama, namaFileBerkas: namaFileBerkas,
    kategoriJenjang: kategoriJenjang, wilayahSudin: wilayahSudin, usiaTahun: usiaTahun,
    parseKelompokUsia: parseKelompokUsia, kelompokUsia: kelompokUsia, statusKuota: statusKuota,
    validasiLangkah: validasiLangkah, validasiSemua: validasiSemua, dataAktif: dataAktif
  };
}
