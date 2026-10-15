# SHAMS (nama kod: UTMPreneur)

Nama sistem yang dipaparkan kepada pengguna ialah **SHAMS** (`APP.NAMA` dalam `src/Config.gs`). Nama folder, cabang git dan dokumen reka bentuk kekal "UTMPreneur" kerana ia nama kod dalaman.

Sistem aktiviti keusahawanan dan inovasi pelajar UTM (UTMXCITE), dibina dengan Google Apps Script dan
Google Sheets. Pelajar, staf dan orang luar log masuk dengan emel dan OTP.

| Rujukan | Fail |
|---|---|
| Reka bentuk lengkap fasa 1 dan nota fasa 2 | [`REKA_BENTUK_FASA1.md`](REKA_BENTUK_FASA1.md) |
| Panduan peringkat 1 dan senarai semak ujian manual | [`docs/PERINGKAT1_PANDUAN.md`](docs/PERINGKAT1_PANDUAN.md) |
| Panduan peringkat 2 (Profiling, SSU, sijil) dan senarai semak ujian manual | [`docs/PERINGKAT2_PANDUAN.md`](docs/PERINGKAT2_PANDUAN.md) |
| Ilustrasi antara muka (PNG dan sumber HTML) | [`mockup/`](mockup/) |

## Struktur

```
UTMPreneur/
  appsscript.json        manifest (zon waktu, skop, web app)
  src/                   kod Apps Script (.gs) dan antara muka (.html)
    Config.gs            skema spreadsheet, tetapan lalai
    Util.gs              fungsi pembantu (tulen)
    Db.gs                lapisan data, Tetapan, Admin, Audit
    Auth.gs              OTP, sesi, peranan, daftar pelajar/staf/luar
    Import.gs            import data PELAJAR (CSV)
    Admin.gs             tindakan admin
    Setup.gs, Seed.gs    skrip persediaan dan data awal
    Mail.gs              emel dwibahasa
    Ref.gs               senarai pilihan (Rujukan)
    Files.gs             muat naik/turun fail (semakan di pelayan)
    Profiling.gs         profiling pelajar
    Ssu.gs, Sijil.gs     permohonan SSU, kelulusan, sijil PDF (Slides)
    Jobs.gs              kerja harian (pencetus)
    Bantu.gs             admin bertindak bagi pihak pelajar
    Code.gs              doGet dan rpc()
    Index.html, App.html, Styles.html, LogoData.html,
    ViewsModul.html, AppModul.html   (Profiling dan SSU)
  tests/                 ujian setempat (Node) dengan Apps Script ditiru
  scripts/               deploy.sh, build-logo.js
```

## Perintah

```sh
npm test            # jalankan semua ujian setempat
npm run push:uji    # clasp push ke projek UJI
npm run push:prod   # clasp push ke projek PRODUKSI
```

## Status

Peringkat 1 (asas dan log masuk) dan Peringkat 2 (Profiling, SSU, sijil, pembaharuan) siap dibina dan diuji setempat (108 ujian). Peringkat seterusnya: Ruang Niaga, Kewangan, Makerspace.
