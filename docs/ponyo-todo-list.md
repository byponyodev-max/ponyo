# Ponyo — Master To-do List

**Snapshot:** 21 November 2026  
Dokumen ini merangkum pekerjaan Ponyo yang pernah diminta, status implementasi yang sudah diverifikasi di repo, dan pekerjaan yang masih perlu keputusan atau tindakan di luar kode. “Selesai di kode” tidak otomatis berarti sudah live atau siap menerima pelanggan.

## Status

- ✅ Sudah dibuat/diuji di repo
- 🟡 Perlu verifikasi, keputusan, data asli, atau konfigurasi eksternal
- ⬜ Belum dilakukan / perlu dikerjakan sebelum aktivasi terkait

## 1. Sudah dibuat di repo

- ✅ Dasar storefront, katalog produk, halaman maker, dan tampilan produk.
- ✅ Reservasi produk: form pelanggan, jumlah/progres, serta pencatatan email dan negara; reservasi tidak menarik pembayaran.
- ✅ Admin reservasi: daftar individu, pencarian/filter, pagination, dan ekspor CSV.
- ✅ Inbox admin: mailbox dan status balasan; status pengiriman perlu dibedakan dari sekadar SMTP yang sudah dikonfigurasi.
- ✅ Analytics admin: ringkasan penjualan/refund, negara, produk/maker, pesanan, reservasi, dan minat. Mata uang JPY/KRW ditampilkan terpisah.
- ✅ Data contoh produk dan profil maker, halaman panduan ukuran tersendiri, serta label “Only at Ponyo”.
- ✅ Alur pembayaran Stripe, pesanan, refund, dan status pengiriman tersedia dalam kode; lihat [payment-gateway.md](./payment-gateway.md), [checkout-order-management.md](./checkout-order-management.md), dan [shipment-management.md](./shipment-management.md).
- ✅ Alur purchase order dan Supplier Studio tersedia dalam kode; penerusan pesanan ke supplier nonaktif secara default. Perubahan harga grosir/kapasitas supplier menunggu persetujuan Ponyo; satu maker utama dipilih per varian; harga retail = biaya grosir yang disetujui + 20%. Lihat [supplier-order-management.md](./supplier-order-management.md).
- ✅ Email transaksional, antrean/retry, dan kontrol keamanan API tersedia dalam kode; lihat [operations-reliability.md](./operations-reliability.md).
- ✅ Terjemahan UI EN/JA/KO dan terjemahan produk contoh JA/KO sudah ditambahkan dan sebagian besar diuji, termasuk perpindahan bahasa.
- ✅ Autentikasi admin dan pengelolaan akun admin tersedia.
- ✅ Fitur checkout/commerce, akun pelanggan, ulasan, dan Plush Journal saat ini **dinonaktifkan** lewat feature flag; reservasi produk aktif. Pembayaran, checkout, dan payout tetap tidak aktif sampai kebijakan pengiriman, biaya, pajak, pembatalan/refund, serta kesiapan operasional diputuskan dan diuji. Lihat [src/lib/storefront-features.ts](../src/lib/storefront-features.ts).

## 2. Prioritas sebelum peluncuran publik

### P0 — Konten, legal, dan reservasi

- 🟡 **Ganti semua data contoh dengan data bisnis yang benar:** nama maker, cerita, bahan, ukuran, berat, jumlah edisi, tanggal pengiriman, harga, stok, foto, dan status “Only at Ponyo”. Jangan menjual berdasarkan angka contoh dari seed.
- ✅ **Aturan operasional target reservasi sudah diterapkan:** target tercapai menunggu konfirmasi admin sebelum undangan prioritas dikirim; jika tenggat lewat tanpa target, kampanye ditutup dan reservers diberi kabar. Reservasi tetap non-binding dan tidak menarik pembayaran.
- 🟡 Isi target produksi, tenggat, kapasitas, dan estimasi pengiriman yang benar untuk setiap produk sebelum dipublikasikan; angka/data contoh bukan komitmen produksi.
- 🟡 **Tetapkan kebijakan perubahan/pembatalan reservasi.** Reservasi sekarang tidak mengambil pembayaran, jadi belum ada pembayaran reservasi yang bisa dikembalikan. Jika model berbayar berubah, definisikan alur refund terpisah sebelum mengaktifkan checkout.
- 🟡 **Lengkapi halaman legal yang masih berupa draft:** nama badan usaha, alamat, kontak yang dipantau, kebijakan retensi/penghapusan data, prosesor data yang benar-benar dipakai, aturan pembatalan/refund, dan ketentuan penjualan.
- ⬜ Minta tinjauan profesional untuk kebijakan legal, lalu finalisasi dan terjemahkan versi final ke EN/JA/KO. Jangan tampilkan placeholder atau label “draft” saat peluncuran.
- 🟡 **Verifikasi seluruh halaman UI EN/JA/KO** melalui audit route-per-route dan alur perpindahan EN↔JA, EN↔KO, JA↔KO. Tes Contact dan beberapa key lolos, tetapi audit akhir homepage dan seluruh bagian admin belum terkonfirmasi lengkap.
- 🟡 Periksa Rare Finds: catatan seed/test masih menyebut koleksi lima produk tersendiri. Pastikan apakah memang harus digabung ke katalog utama, lalu samakan navigasi, kategori, seed, dan tes.
- 🟡 Pastikan informasi ukuran/pengiriman mudah terlihat sebelum pelanggan membuat reservasi atau melakukan pembayaran.

### P0 — Pembayaran, pajak, dan operasional penjualan

- ⬜ Putuskan fitur yang akan aktif saat launch. Checkout, cart, akun pelanggan, ulasan, dan Plush Journal masih mati; jangan aktifkan hanya dengan mengubah flag sebelum pemeriksaan prasyarat selesai. Checkout/pembayaran dan payout tetap nonaktif saat ini.
- ⬜ Jalankan uji end-to-end Stripe **sandbox** dengan webhook nyata: pembayaran berhasil/gagal, 3DS, retry, pembatalan, capture bila dipakai, refund parsial/penuh, webhook duplikat, dan rekonsiliasi status.
- ⬜ Daftarkan webhook Stripe untuk lingkungan yang sesuai dan pasang credential melalui secret manager. Konfigurasi atau keberadaan key saja bukan bukti transaksi berhasil.
- ⬜ Tentukan metode/biaya pengiriman dan tarif pajak yang sudah ditinjau untuk negara tujuan. Default pajak saat ini tidak memungut pajak; jangan menganggap konfigurasi default sebagai nasihat atau penentuan kewajiban pajak.
- ⬜ Uji order, stok, pembatalan, dan refund dengan PostgreSQL di staging; jangan melakukan transaksi live sebagai pengganti pengujian.
- ⬜ Sebelum menerima order, pastikan alur support untuk pesanan berbayar, refund, pengembalian barang, keterlambatan, dan kegagalan pemasok jelas.

### P0 — Supplier dan pengiriman

- 🟡 Ganti supplier demo dengan supplier sungguhan dan verifikasi harga grosir, SKU, kapasitas, MOQ, lead time, alamat, dan izin berbagi data pelanggan. Tetapkan satu maker utama per varian melalui persetujuan Ponyo; pergantian maker tidak otomatis.
- ⬜ Aktifkan `SUPPLIER_FORWARDING_ENABLED` hanya setelah kontrak integrasi, idempotensi supplier, retry, manual review, dan staging test disetujui. Integrasi supplier eksternal belum dibuktikan dengan transaksi nyata.
- ⬜ Untuk `suppliers.byponyo.com`, siapkan DNS, HTTPS, dan routing produksi; hostname lokal/tunnel bukan domain permanen.
- 🟡 Status shipment dan tracking saat ini dapat diperbarui operator; integrasi carrier/webhook langsung belum dikonfigurasi. Putuskan apakah pengelolaan manual cukup untuk launch.

### P0 — Keamanan, deployment, dan pemulihan

- ⬜ Jalankan migrasi pada PostgreSQL staging dari baseline yang benar dan tinjau perubahan skema sebelum produksi. Jangan men-stamp database yang belum diverifikasi.
- ⬜ Uji backup dan pemulihan ke lingkungan terisolasi; tetapkan target RPO/RTO dan jadwal drill. Retensi backup otomatis bukan bukti bahwa restore berhasil.
- ⬜ Tinjau konfigurasi domain, HTTPS, cookie, CORS, proxy, Redis, secret manager, dan akses admin pada lingkungan staging/produksi.
- ⬜ Tinjau alert, DLQ, antrean email, kegagalan pembayaran, log, dan penanggung jawab insiden sebelum launch.
- ⬜ Jalankan pemeriksaan keamanan dan dependency review; verifikasi kontrol akses admin, data pribadi reservasi, dan kebijakan retensi/penghapusan.
- 🟡 Build Docker sebelumnya berhasil. Build lokal pernah gagal karena masalah pemuatan ESM pada Tailwind/magic-string; pastikan pipeline build yang dipakai untuk rilis tetap hijau.

## 3. Email domain dan logo Gmail (BIMI)

- ✅ SPF, DKIM, dan DMARC dilaporkan PASS untuk `hello@`, `support@`, dan `partners@byponyo.com`; DMARC terakhir terverifikasi `p=quarantine; pct=100`.
- 🟡 Uji juga email yang dikirim melalui Hostinger Reach jika layanan itu digunakan. Autentikasi yang lulus tidak menjamin email masuk Inbox, bukan Spam.
- ⬜ Tayang dan cek file BIMI di URL HTTPS publik, misalnya `https://byponyo.com/bimi.svg`. File saat ini masih draft lokal di [public/bimi.svg](../public/bimi.svg), belum dinyatakan diterima oleh penerbit sertifikat.
- ⬜ Minta penerbit sertifikat memeriksa SVG dan kelayakan merek; dapatkan VMC/CMC yang memenuhi syarat Gmail.
- ⬜ Setelah sertifikat diterbitkan, unggah PEM ke URL publik HTTPS, lalu tambahkan TXT `default._bimi` dengan URL PEM yang benar. Jangan pasang record BIMI sebelum sertifikat siap.
- 🟡 [public/profile.svg](../public/profile.svg) menyisipkan PNG asli untuk penggunaan gambar biasa; itu bukan SVG BIMI yang memenuhi syarat.

## 4. Keputusan fitur sebelum aktivasi

- ⬜ Checkout/cart dan akun pelanggan: tetap dinonaktifkan atau aktif setelah pembayaran, pengiriman/biaya, pajak, stok, legal, dan support siap?
- ⬜ Ulasan produk dan Plush Journal: tetap disembunyikan atau akan diluncurkan? Jika diluncurkan, tentukan moderasi, spam, dan terjemahan.
- 🟡 Reservasi: aturan target/tenggat dan tindakan admin sudah diterapkan; nilai produksi, tanggal estimasi, kebijakan perubahan/pembatalan, serta konten pembaruan pelanggan tetap perlu dikonfirmasi untuk tiap produk.
- ⬜ Analitik produk/maker: angka penjualan per produk/maker memperhitungkan diskon baris, tetapi tidak membagi refund tingkat order, ongkir, atau pajak. Gunakan metrik ini sebagai nilai item, bukan laba bersih.

## 5. Rujukan operasional

- [Audit konfigurasi aplikasi](./application-configuration-audit.md)
- [Database storefront](./storefront-database.md)
- [Pembayaran Stripe](./payment-gateway.md)
- [Checkout dan manajemen pesanan](./checkout-order-management.md)
- [Supplier dan purchase order](./supplier-order-management.md)
- [Shipment dan pengiriman](./shipment-management.md)
- [Keamanan API dan keandalan operasional](./operations-reliability.md)
