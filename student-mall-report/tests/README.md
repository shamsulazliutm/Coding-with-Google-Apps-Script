# Ujian

- `node test-backend.js`: menjalankan `Code.gs` dengan tiruan API Apps Script (`gas-harness.js`) dan menguji logik pelayan.
- `node e2e.js`: menjalankan `Index.html` dalam Chromium (Playwright) dengan pelayan tiruan yang sama. Memerlukan `npm i playwright`. Tangkapan skrin disimpan dalam `out/`.

Permintaan fon Google sengaja disekat semasa ujian, jadi ralat "Failed to load resource" diabaikan.
