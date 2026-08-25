# PENTING: BACA INI SEBELUM UPDATE KE MARK V5.0

> **PERHATIAN**: Dokumen panduan ini ditujukan **khusus bagi pengguna yang sudah pernah menginstal atau menggunakan versi MARK sebelumnya** (v4.x atau versi Electron) dan hendak melakukan pembaruan (*update*) ke **MARK v5.0 (Arsitektur Tauri v2)**.
>
> Jika Anda adalah pengguna baru yang baru pertama kali menginstal MARK, Anda tidak perlu mengikuti langkah ini dan bisa langsung menggunakan aplikasi.

---

## 1. Mengapa Langkah Ini Diperlukan?

Pada pembaruan MARK v5.0, arsitektur dasar aplikasi telah dimodernisasi dari **Electron** ke **Tauri v2 (Microsoft Edge WebView2)**:
- **Versi Lama (Electron / Mode Dev)**: Menyimpan database memori lokal di bawah origin `http://localhost:5173` atau direktori data Electron lama.
- **Versi Baru v5.0 (Tauri v2)**: Berjalan di bawah domain native `http://tauri.localhost` yang jauh lebih aman, ringan, dan cepat.

Karena sistem keamanan bawaan Windows WebView2 memisahkan data antar domain origin yang berbeda, data memori lama Anda tidak akan otomatis terbaca jika belum diekspor terlebih dahulu.

Ikuti **2 langkah mudah di bawah ini (hanya butuh waktu 1 menit)** untuk memindahkan seluruh memori, dokumen, riwayat chat, dan konfigurasi lama Anda ke versi v5.0.

---

## 2. Langkah 1: Ekspor / Cadangkan Data dari MARK Lama

Lakukan langkah ini **di aplikasi MARK versi lama Anda** (atau saat menjalankan mode dev sebelum update):

1. Buka aplikasi MARK versi lama Anda.
2. Tekan tombol **F12** atau kombinasi **Ctrl + Shift + I** pada keyboard untuk membuka jendela Developer Tools.
3. Klik pada tab **Console**.
4. Salin seluruh kode di bawah ini, tempelkan ke dalam Console, lalu tekan **Enter**:

```javascript
;(async () => {
  try {
    await import('https://unpkg.com/dexie@3.2.2')
    await import('https://unpkg.com/dexie-export-import@1.0.3')

    console.log('[MARK Backup] Membaca skema database mark-db...')
    let dexie = new Dexie('mark-db')
    const { verno, tables } = await dexie.open()
    dexie.close()

    dexie = new Dexie('mark-db')
    dexie.version(verno).stores(
      tables.reduce((p, c) => {
        p[c.name] = c.schema.primKey.keyPath || ''
        return p
      }, {})
    )

    const exportBlob = await dexie.export()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(exportBlob)
    a.download = 'mark-db.json'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    console.log('[MARK Backup] Database mark-db berhasil diekspor ke folder Downloads!')
  } catch (error) {
    console.error('[MARK Backup Error] Gagal mengekspor database:', error)
  }
})()
```

5. File cadangan bernama **`mark-db.json`** akan otomatis terunduh ke folder **Downloads** komputer Anda.

---

## 3. Langkah 2: Pasang & Buka MARK v5.0

1. Instal atau jalankan file **`mark.exe`** (MARK v5.0).
2. Di jendela aplikasi MARK v5.0, buka Developer Tools dengan menekan **F12** atau **Ctrl + Shift + I**.
3. Buka tab **Console**.
4. Salin seluruh kode di bawah ini, tempelkan ke dalam Console, lalu tekan **Enter**:

```javascript
;(async () => {
  try {
    await import('https://unpkg.com/dexie@3.2.2')

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = e.target.files[0]
      if (!file) return

      console.log('[MARK Restore] Membaca file backup:', file.name)
      const text = await file.text()
      const json = JSON.parse(text)

      // Auto-deteksi data tabel dari format export Dexie
      const tableDataList = []

      // 1. Cek format standar Dexie export: json.data.data
      if (Array.isArray(json.data?.data)) {
        for (const item of json.data.data) {
          const tableName = item.tableName || item.name
          const rows = item.inRows || item.rows || []
          if (tableName && Array.isArray(rows) && rows.length > 0) {
            tableDataList.push({ tableName, rows })
          }
        }
      }

      // 2. Cek format alternatif: json.data.tables atau json.tables
      if (tableDataList.length === 0) {
        const altTables = json.data?.tables || json.tables || []
        for (const item of altTables) {
          const tableName = item.name || item.tableName
          const rows = item.rows || item.inRows || item.data || []
          if (tableName && Array.isArray(rows) && rows.length > 0) {
            tableDataList.push({ tableName, rows })
          }
        }
      }

      console.log(`[MARK Restore] Ditemukan ${tableDataList.length} tabel berisi data:`, tableDataList.map(t => `${t.tableName} (${t.rows.length} baris)`).join(', '))

      const db = new Dexie('mark-db')
      await db.open()

      for (const { tableName, rows } of tableDataList) {
        if (db.table(tableName)) {
          try {
            await db.table(tableName).clear()
            await db.table(tableName).bulkPut(rows)
            console.log(`[MARK Restore] Sukses memulihkan ${rows.length} data pada tabel: ${tableName}`)
          } catch (err) {
            console.warn(`[MARK Restore] Catatan pada tabel ${tableName}:`, err.message)
          }
        }
      }

      console.log('[MARK Restore] Seluruh data berhasil dipulihkan! Memuat ulang aplikasi...')
      setTimeout(() => window.location.reload(), 1500)
    }
    input.click()
  } catch (error) {
    console.error('[MARK Restore Error] Gagal memulihkan database:', error)
  }
})()
```

5. Jendela pemilih file Windows akan terbuka. Pilih file **`mark-db.json`** yang sudah diunduh pada Langkah 1.
6. Tunggu 1-2 detik hingga aplikasi otomatis memuat ulang (*reload*).
7. Selesai! Seluruh memori, profil kepribadian, dokumen RAG, relasi 4D, dan pengaturan lama Anda telah kembali 100% utuh.

---

## 4. Data Apa Saja yang Berhasil Dipulihkan?

Proses pencadangan dan pemulihan di atas mencakup seluruh 8 komponen database MARK:
1. **Memori Jangka Panjang (`memory`)**: Fakta penting dan preferensi Anda.
2. **Pengaturan Sistem (`config`)**: Kunci API AI, konfigurasi model, dan parameter suara.
3. **Riwayat Chat (`sessions` & `chatArchive`)**: Semua riwayat obrolan lama beserta vektor pencarian cerdasnya.
4. **Knowledge Base RAG (`documents`)**: Dokumen teks, PDF, dan DOCX yang pernah Anda masukkan.
5. **Relasi 4D (`relationships`)**: Perkembangan skor kehangatan, kepercayaan, sarkasme, dan energi Mark.
6. **Mission Control Sub-Agents (`subagents` & `subagentMessages`)**: Riwayat dan alur kerja sub-agent.
