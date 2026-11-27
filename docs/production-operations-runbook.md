# Panduan Operasional Produksi Ponyo

Panduan ini menjelaskan pekerjaan rutin setelah Ponyo live: membuat akses admin, merilis perubahan kode, dan memeriksa layanan. Simpan hanya di repositori privat/Drive yang aksesnya dibatasi. **Jangan tulis password, token, private key, isi `.env.prod`, atau data pelanggan di dokumen, chat, maupun output yang dibagikan.**

**Terakhir diverifikasi:** 27 November 2026  
**Produksi:** Lightsail Tokyo, instance `ponyo-prod-tokyo`, static IP `13.112.48.83`; frontend/API berjalan dengan Docker Compose. DNS `byponyo.com`, `admin`, `suppliers`, dan `api` mengarah ke IP tersebut. `www.byponyo.com` mengalihkan ke `https://byponyo.com/`. Situs dan API menjawab HTTP 200 saat smoke test.

## Status dan batas penting

- Deploy saat ini dilakukan **manual melalui SSH**. GitHub Actions menjalankan pemeriksaan/tes, tetapi tidak otomatis merilis ke Lightsail.
- Database produksi adalah Supabase Tokyo. Jangan menjalankan migrasi atau mengubah data produksi tanpa backup tervalidasi dan persetujuan pemilik operasional.
- Stripe/pembayaran masih nonaktif. Jangan menerima pembayaran sungguhan atau mengaktifkan checkout sebelum konfigurasi dan alur pembayaran disetujui serta diuji.
- Ada backup database manual pra-migrasi yang tervalidasi. Backup terjadwal dan uji pemulihan belum dibuktikan; jangan menganggap pemulihan siap.
- Caddy di server sudah dikonfigurasi agar `www` redirect ke domain utama. Perubahan Caddyfile lokal di repositori perlu dipastikan sudah disinkronkan sebelum deploy berikutnya.
- Supplier Portal menerima draft produk baru dari supplier; Admin meninjau dan menyetujui draft sebelum produk dipublikasikan secara terpisah. Aplikasi maker sendiri tidak membuat listing produk.

## 1. Membuat akun admin

### Admin pertama

Public registration tidak dapat membuat akun admin. Jika belum ada admin yang bisa login, bootstrap akun pertama dari terminal SSH Lightsail. Perintah ini meminta password secara tersembunyi di terminal dan tidak menaruh password di argumen perintah atau `.env.prod`.

Ganti email dan nama sesuai orang yang diberi akses. Contoh berikut memakai akun operasional:

```bash
cd ~/ponyo
sudo docker compose --env-file backend/.env.prod -f docker-compose.prod.yml run --rm --no-deps \
  -e INITIAL_ADMIN_EMAIL="hello@byponyo.com" \
  -e INITIAL_ADMIN_FIRST_NAME="admin" \
  api python -c 'import asyncio, getpass, os; os.environ["INITIAL_ADMIN_PASSWORD"] = getpass.getpass("Buat password admin (input tersembunyi): "); from app.seed import seed_initial_admin; created = asyncio.run(seed_initial_admin()); print("Admin berhasil dibuat." if created else "Admin dengan email ini sudah ada; password tidak diubah.")'
```

Password harus 8–128 karakter dan menyertakan setidaknya satu angka dan satu simbol. Ketik hanya saat prompt `getpass` muncul. Jangan kirim atau catat password.

- Jika muncul **Admin berhasil dibuat**, login di <https://admin.byponyo.com/admin-portal>.
- Jika muncul **Admin dengan email ini sudah ada**, seed tidak mengganti password akun yang ada. Jangan mengulanginya dengan asumsi password akan ter-reset.
- Jika alamat email sudah dipakai akun non-admin, seed berhenti dengan error. Jangan mengubah role lewat SQL; minta pemilik operasional memeriksa identitas dan akun terlebih dahulu.
- Jika akun sudah ada tetapi password tidak diketahui dan tidak ada admin lain, hentikan percobaan dan lakukan pemulihan akses yang disetujui pemilik sistem. Jangan reset database atau mengubah hash secara manual.

### Admin tambahan

Setelah login sebagai admin:

1. Buka bagian **Admin accounts** di Admin Portal.
2. Isi nama, email, dan password sementara untuk admin baru.
3. Sampaikan password sementara lewat kanal privat yang disetujui, bukan chat grup. Minta penerima menggantinya setelah login jika fitur penggantian password tersedia.
4. Cabut akses admin yang tidak lagi diperlukan. Portal melindungi akun sendiri dan admin terakhir agar tidak terkunci tanpa akses.

Berikan akses hanya kepada orang yang berwenang. Akun customer dan supplier tidak dapat digunakan untuk login sebagai admin.

## 2. Merilis perubahan kode

### Sebelum rilis

1. Buat perubahan di repositori lokal, jalankan tes yang relevan, lalu minta review sesuai proses tim.
2. Commit dan push ke branch `main` setelah disetujui. Push saja **tidak** mengubah produksi.
3. Pastikan migrasi database, perubahan konfigurasi, dan perubahan DNS/provider sudah ditinjau terpisah.
4. Buka SSH Lightsail dan periksa keadaan repositori:

```bash
cd ~/ponyo
git status --short --branch
```

Jika ada perubahan lokal, jangan pull atau menimpanya sebelum memahami perbedaannya. Ini penting untuk `Caddyfile`: pengalihan `www` sudah diterapkan langsung di server, dan perubahan yang sama perlu disimpan di repositori agar tidak hilang pada rilis berikutnya.

### Rilis rutin tanpa migrasi database

Setelah branch bersih dan perubahan sudah ada di GitHub `main`:

```bash
git pull --ff-only origin main
sudo docker compose --env-file backend/.env.prod -f docker-compose.prod.yml up -d --build
sudo docker compose --env-file backend/.env.prod -f docker-compose.prod.yml ps
```

Jangan gunakan `docker compose down -v`, menghapus volume, atau menjalankan `git reset --hard` sebagai langkah deploy.

### Jika rilis menyertakan migrasi Alembic

Jangan gunakan langkah rutin di atas sendirian. Sebelum migrasi:

1. Tinjau file migrasi dan dampaknya terhadap data produksi.
2. Pastikan backup database baru tervalidasi dan pemulihan disetujui.
3. Rencanakan jendela rilis serta konfirmasi versi `current` dan `heads`.
4. Bangun image API yang memuat migrasi, lalu jalankan migrasi hanya setelah ada persetujuan:

```bash
sudo docker compose --env-file backend/.env.prod -f docker-compose.prod.yml run --rm --no-deps --build api alembic upgrade head
```

Jika migrasi gagal, jangan mengulang, mengubah revision, atau memulihkan backup secara spontan. Simpan error yang sudah disensor dan hubungi pemilik operasional.

### Perubahan Caddyfile saja

File di server di-mount ke container Caddy. Validasi sebelum reload:

```bash
sudo docker compose --env-file backend/.env.prod -f docker-compose.prod.yml exec caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo docker compose --env-file backend/.env.prod -f docker-compose.prod.yml exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

Jangan reload jika validasi gagal. Jangan mengubah nameserver atau record email untuk perubahan kode.

## 3. Pemeriksaan setelah rilis

```bash
sudo docker compose --env-file backend/.env.prod -f docker-compose.prod.yml ps
curl -sS -o /dev/null -w 'Site HTTP %{http_code}\n' https://byponyo.com/
curl -sS -o /dev/null -w 'API HTTP %{http_code}\n' https://api.byponyo.com/v1/health
curl -sS -o /dev/null -w 'WWW HTTP %{http_code} -> %{redirect_url}\n' https://www.byponyo.com/
```

Semua container yang seharusnya sehat perlu berstatus healthy. Harapkan situs dan API membalas HTTP 200; `www` seharusnya membalas HTTP 301 ke `https://byponyo.com/`.

Lanjutkan smoke test browser untuk:

- homepage dan halaman detail produk;
- login Admin dan akses dashboard;
- login Supplier dengan akun uji yang disetujui;
- reservasi/minat tanpa menyelesaikan pembayaran;
- email verifikasi/reset hanya jika pengiriman SMTP produksi telah dikonfirmasi.

Periksa log bila ada kegagalan, dan bagikan hanya bagian yang sudah disensor:

```bash
sudo docker compose --env-file backend/.env.prod -f docker-compose.prod.yml logs --tail=80 api frontend caddy
```

Jangan mengirim `.env.prod`, password, token sesi, alamat pelanggan, atau log mentah ke chat/tiket publik. Catat commit yang dirilis, hasil pemeriksaan, dan error non-sensitif.

Jika pemeriksaan gagal, hentikan perubahan lanjutan. Jangan menjalankan migrasi ulang, menghapus volume, atau mencoba restore sebelum backup dan dampaknya dipastikan.

## 4. Catatan operasi yang perlu ditindaklanjuti

- **Backup:** konfirmasi pemilik, jadwal dan lokasi backup otomatis untuk Supabase Tokyo; lakukan uji restore terisolasi dan catat tanggal, durasi, serta hasil. Sampai itu selesai, proses pemulihan belum terverifikasi.
- **Staging dan rilis:** belum ada staging permanen atau deploy otomatis. Pertimbangkan menyiapkan staging dan prosedur approval/rollback sebelum rilis rutin.
- **Pembayaran:** Stripe tetap nonaktif sampai kredensial, webhook, refund, rekonsiliasi, pajak/pengiriman, dan persetujuan bisnis selesai diuji.
- **Email dan alur pengguna:** verifikasi pengiriman email produksi serta alur customer/admin/supplier di domain live; jangan menyamakan status HTTP sehat dengan semua alur bisnis siap.
- **Blueprint:** perbarui biaya layanan, pemilik akses, tanggal renewal, kebijakan backup/restore, dan siapa yang menyetujui rilis di [site blueprint](./site-blueprint.md).

## Dokumen terkait

- [Backend README](../backend/README.md)
- [Post-build launch checklist](./post-build-launch-checklist.md)
- [Operations reliability](./operations-reliability.md)
- [Payment gateway](./payment-gateway.md)
