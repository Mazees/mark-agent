# Panduan Backup & Migrasi Data MARK (Versi Sebelumnya ke V5)

Dokumen ini menjelaskan langkah-langkah membackup data dari MARK versi sebelumnya (berbasis Electron & Dexie/IndexedDB) dan memulihkannya ke MARK versi baru (V5.0.0 berbasis Node Core & SQLite).

---

## 1. Perbedaan Arsitektur Penyimpanan

| Komponen | MARK Versi Sebelumnya | MARK V5 (Versi Baru) |
| :--- | :--- | :--- |
| **Engine Database** | Browser IndexedDB (Dexie.js) | Centralized SQLite (`better-sqlite3`) + WAL Mode |
| **Lokasi File** | Cache Chromium / Electron Profile | `%USERPROFILE%\.config\mark-agent\mark.db` |
| **Pencarian Vektor** | In-Memory Cosine Similarity | Orama WASM + Transformers.js (384 Dimensi) |
| **Format Backup** | JSON Dump (`tables: { ... }`) | JSON Unified (Mendukung struktur lama & V5) |

---

## 2. Cara Ekspor Data dari MARK Versi Sebelumnya

Jika pada MARK versi sebelumnya belum tersedia tombol ekspor di menu Pengaturan, Anda dapat mengekspor seluruh database langsung melalui Developer Console (`Ctrl + Shift + I`):

1. Buka aplikasi **MARK versi sebelumnya** (sebelum beralih atau menghapus instalasi lama).
2. Tekan tombol shortcut **`Ctrl + Shift + I`** pada keyboard untuk membuka jendela **Developer Tools / Console**.
3. Pilih tab **Console**.
4. Salin (*copy*) seluruh kode JavaScript berikut dan tempel (*paste*) ke dalam Console, lalu tekan **Enter**:

```javascript
(async function exportMarkDB() {
  const req = indexedDB.open('mark-db')
  req.onsuccess = async (e) => {
    const db = e.target.result
    const storeNames = Array.from(db.objectStoreNames)
    const dump = {
      app: 'MARK',
      version: 'legacy',
      exportedAt: new Date().toISOString(),
      tables: {}
    }

    for (const name of storeNames) {
      try {
        const tx = db.transaction(name, 'readonly')
        const store = tx.objectStore(name)
        dump.tables[name] = await new Promise((res) => {
          const getAll = store.getAll()
          getAll.onsuccess = () => res(getAll.result || [])
          getAll.onerror = () => res([])
        })
      } catch (_) {
        dump.tables[name] = []
      }
    }

    db.close()
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mark-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    console.log('Backup berhasil diekspor:', dump)
  }
  req.onerror = () => console.error('Gagal membuka database mark-db')
})()
```

5. Browser / aplikasi akan otomatis mendownload file JSON (misalnya `mark-backup-2026-xx-xx.json`).
6. Simpan file tersebut di lokasi yang aman. File ini mencakup seluruh memori kognitif, chat turns, riwayat sesi, knowledge document, relasi 4D, dan skill yang pernah dipelajari.

---

## 3. Cara Restore / Impor ke MARK V5 (Versi Baru)


1. Buka **MARK VERSI TERBARU**
2. Masuk ke menu **Pengaturan** (ikon gear di pojok kiri bawah).
3. Gulir ke bagian **Pencadangan & Migrasi Database**.
4. Klik tombol **Restore Database**.
5. Pilih file backup `.json` yang telah diekspor pada Langkah 2.
6. Tunggu beberapa saat hingga notifikasi konfirmasi berhasil muncul, lalu aplikasi akan me-reload data secara otomatis.


## 4. Kompatibilitas Pemetaan Skema Otomatis

Engine SQLite MARK V5 (`src/server/memory/db-store.js`) secara otomatis memetakan skema tabel Dexie lama ke SQLite modern:

| Data di Versi Sebelumnya (Dexie) | Skema Baru di V5 (SQLite) | Penanganan Kompatibilitas |
| :--- | :--- | :--- |
| `memory` | `memories` | Otomatis di-merge & dipertahankan |
| `chatArchive` | `chat_archives` | Otomatis di-merge |
| `chatTurns` (`pairId`) | `chat_turns` (`id`) | `pairId` dialihkan menjadi primary key `id` |
| `subagent_messages` | `subagent_messages` | Normalisasi kolom `subagent_id` |
| `sessionId: 1` / `1.0` | `session_id: '1'` | Normalisasi ID string mencegah duplikasi thread |

---

## 5. Lokasi Penyimpanan Fisik Terbaru

Di MARK V5, seluruh data tersimpan terpusat dalam database SQLite tunggal:

1. Buka File Explorer di Windows dan tuju:
   ```text
   %USERPROFILE%\.config\mark-agent\
   ```
2. File utama database:
   * **`mark.db`** (Database utama SQLite)
   * **`mark.db-wal`** (Write-Ahead Log)
   * **`mark.db-shm`** (Shared Memory index)
3. Untuk backup manual sewaktu-waktu, cukup salin file `mark.db` ke tempat aman atau gunakan tombol **Backup Seluruh Database (JSON)** di menu Pengaturan.

---

## 6. Troubleshooting

* **Riwayat obrolan tidak langsung muncul setelah restore?**
  * Klik menu *Chat Studio* atau refresh halaman (`Ctrl + R`) untuk memuat ulang daftar sesi.
* **Memori lama belum terindeks di pencarian cerdas?**
  * Masuk ke menu **Pengaturan** -> klik tombol **Re-index Search (Orama)** untuk memperbarui indeks vektor lokal.
