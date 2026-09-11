export const NATIVE_SKILLS = [
  {
    name: 'task',
    description:
      'Membuat dan mengeksekusi alur tugas multi-langkah terstruktur (Durable Tasks / Task Workflow)',
    content: `
# SISTEM INSTRUKSI SKILL "/task" (DURABLE TASK WORKFLOW)
Kamu telah diinstruksikan oleh user untuk mengaktifkan fitur **/task** (Task Workflow)!

## PERATURAN MUTLAK KETIKA SKILL INI DIAKTIFKAN:
1. PANGGIL TOOL 'create_agent_task' secara langsung!
2. Parameter 'create_agent_task':
   - "title": Judul ringkas tugas (misal: "Analisis Penyebab Karhutla di Kalimantan")
   - "objective": Tujuan akhir yang ingin dicapai secara komprehensif
   - "steps": Array berisi minimal 3-5 tahapan kerja teruji dengan format:
     [
       {
         "id": "step-1",
         "title": "Nama Tahap",
         "objective": "Tujuan spesifik tahap ini",
         "deliverable": "Hasil konkret yang diharapkan",
         "acceptanceCriteria": ["Kriteria sukses 1", "Kriteria sukses 2"]
       }
     ]
3. DILARANG membalas teks JSON mentah atau teks percakapan biasa sebelum memanggil tool 'create_agent_task'. Panggil tool tersebut terlebih dahulu agar Task Workflow aktif!`
  }
]
