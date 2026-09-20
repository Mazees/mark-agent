export const NATIVE_SKILLS = [
  {
    name: 'task',
    description:
      'Membuat dan mengeksekusi alur tugas multi-langkah terstruktur (Durable Tasks / Task Workflow)',
    content: `
# SISTEM INSTRUKSI SKILL "/task" (DURABLE TASK WORKFLOW)
Kamu telah diinstruksikan oleh user untuk mengaktifkan fitur **/task** (Task Workflow)!

## ALUR KERJA WAJIB:
1. INISIASI ALUR KERJA: Panggil tool 'create_agent_task' sebagai tindakan PERTAMA. DILARANG memanggil tool lain (seperti run-powershell, node, dll) atau merespon dengan teks sebelum memanggil 'create_agent_task'.
2. EKSEKUSI TAHAP AKTIF (DI WORKSPACE PENGGUNA):
   - Kerjakan sasaran dan target deliverable tahap aktif HANYA di direktori workspace proyek pengguna saat ini menggunakan tool koding yang relevan (seperti 'write-file', 'replace-content', 'read-file', 'run-powershell').
   - DILARANG LANGSUNG MEMANGGIL 'mark_done_task' SEBELUM PEKERJAAN ATAU FILE DELIVERABLE TAHAP TERSEBUT SELESAI KAMU BUAT!
   - DILARANG KERAS mencari, membaca, atau mengotak-atik kode internal aplikasi MARK ('src/', 'better-sqlite3', file tool agent, dll)!
   - DILARANG menyelesaikan seluruh proyek di Tahap 1.
3. PENGUJIAN & VERIFIKASI WAJIB (TEST & VERIFICATION):
   - Sebelum menandai suatu tahap selesai, kamu WAJIB memverifikasi atau menguji hasil deliverable tahap tersebut (misal: cek keberadaan & integritas file dengan 'read-file', uji eksekusi script dengan 'run-powershell', atau validasi sintaks).
   - DILARANG KERAS memanggil 'mark_done_task' tanpa melakukan verifikasi riil!
4. PENYELESAIAN TAHAP (ONE-SHOT COMPLETION):
   - 'mark_done_task' BUKAN alat untuk menyimpan draf atau cicilan progress sedikit demi sedikit! Panggil 'mark_done_task' HANYA TEPAT 1 KALI di akhir tahap saat deliverable tahap tersebut 100% tuntas dan teruji.
   - Panggil 'mark_done_task' dengan parameter:
     * "taskId": ID task yang sedang berjalan
     * "stepIndex": Nomor tahap yang diselesaikan (1-based, misal: 1)
     * "verificationProof": Bukti konkret hasil pengujian/verifikasi bahwa deliverable berfungsi (wajib diisi minimal 15 karakter)
     * "artifactContent": Isi lengkap dokumen markdown (.md) hasil pengerjaan/spesifikasi tahap ini
     * "summary": Ringkasan hasil
   - DILARANG KERAS memanggil 'mark_done_task' berulang kali untuk tahap yang sama.
5. TRANSISI KE TAHAP BERIKUTNYA:
   - Setelah 'mark_done_task' berhasil dipanggil untuk Tahap N, DILARANG memanggil 'read_task' untuk membaca ulang artefak yang baru saja kamu simpan sendiri!
   - Langsung kerjakan deliverable Tahap N+1 di direktori workspace pengguna.
6. TAHAP TERAKHIR & RANGKUMAN PENUTUP:
   - Pada TAHAP TERAKHIR dari Task Workflow, saat memanggil 'mark_done_task', kamu WAJIB mengisi parameter 'summary' dengan ringkasan komprehensif seluruh alur kerja proyek dari awal hingga akhir.
   - Begitu tahap terakhir berhasil di-mark_done_task, alur kerja selesai 100% dan sistem langsung memutus proses serta menampilkan rangkuman akhir tersebut kepada pengguna. DILARANG memanggil tool apapun lagi.`
  },
  {
    name: 'plan',
    description: 'Alias untuk /task: Menjalankan alur pengerjaan tugas terstruktur (Task Workflow)',
    content: `
# ALIAS PERINTAH: /plan -> /task
Alihkan instruksi ini ke sistem Task Workflow. Segera panggil tool 'create_agent_task' sebagai tindakan pertama dengan judul, sasaran menyeluruh, dan 3-5 tahapan eksekusi terstruktur! Setiap tahap dikerjakan di workspace sebelum diselesaikan dengan 'mark_done_task'.`
  }
]
