# FULL CODEBASE AUDIT & REFACTORING

Saya ingin kamu melakukan **audit dan refactoring menyeluruh terhadap seluruh codebase project ini**.

Kondisi project saat ini cukup berantakan karena sebelumnya banyak kode dibuat/dimodifikasi oleh AI. Saya ingin kamu **membaca dan memahami seluruh struktur project terlebih dahulu**, kemudian merapikannya secara sistematis.

## ATURAN UTAMA

**JANGAN langsung mengedit kode.**

Sebelum melakukan perubahan apa pun:

1. Scan seluruh struktur project.
2. Baca **semua file source code yang relevan**, bukan hanya file yang terlihat bermasalah.
3. Identifikasi hubungan antar-komponen, hooks, utilities, services, pages, routes, state management, API calls, types, dan dependencies.
4. Pahami flow aplikasi dari awal sampai akhir.
5. Identifikasi kode yang redundant, duplicated, unused, terlalu kompleks, tightly coupled, atau memiliki tanggung jawab terlalu banyak.
6. Buat gambaran arsitektur project saat ini.
7. Setelah memahami keseluruhan project, baru mulai melakukan refactoring.

**Jangan melakukan refactor berdasarkan asumsi. Pastikan perubahan berdasarkan kode yang benar-benar kamu baca.**

---

# TUJUAN REFACTORING

Saya ingin codebase menjadi:

* Modular
* Clean
* Readable
* Maintainable
* Reusable
* Consistent
* Scalable
* Minim duplication
* Minim spaghetti code
* Memiliki separation of concerns yang jelas

Namun:

> **Jangan mengubah behavior atau fitur aplikasi hanya demi membuat struktur terlihat lebih bagus.**

Refactoring harus sebisa mungkin bersifat behavior-preserving.

---

# 1. MODULARISASI COMPONENT

Audit semua component.

Cari component yang:

* Terlalu besar
* Memiliki terlalu banyak responsibility
* Memiliki nested logic yang kompleks
* Menggabungkan UI, business logic, API call, state management, dan formatting sekaligus
* Memiliki JSX/template yang sangat panjang
* Memiliki bagian UI yang dapat digunakan kembali

Pecah component tersebut menjadi component yang lebih kecil dan memiliki satu tanggung jawab.

Contoh:

```text
Bad:

UserPage
 ├── API request
 ├── form validation
 ├── state management
 ├── modal
 ├── table
 ├── filtering
 ├── pagination
 └── rendering

Good:

UserPage
 ├── UserHeader
 ├── UserFilters
 ├── UserTable
 ├── UserPagination
 └── UserModal

hooks/
 └── useUsers

services/
 └── userService

utils/
 └── userHelpers
```

Jangan memecah component secara berlebihan.

**Jangan membuat component kecil yang hanya membungkus satu element sederhana tanpa alasan yang jelas.**

Gunakan prinsip:

> One component → one clear responsibility.

---

# 2. PISAHKAN BUSINESS LOGIC DARI UI

Cari logic yang saat ini berada langsung di dalam component seperti:

* API request
* Data transformation
* Validation
* Filtering
* Sorting
* Calculation
* Complex state logic
* Local storage handling
* Formatting
* Side effects

Pindahkan ke layer yang sesuai.

Contoh struktur jika memang relevan:

```text
components/
hooks/
services/
utils/
lib/
types/
constants/
```

Jangan membuat folder atau abstraction hanya demi mengikuti struktur tersebut.

**Gunakan struktur yang memang dibutuhkan project.**

---

# 3. CUSTOM HOOKS

Identifikasi logic React yang berulang atau terlalu kompleks di component.

Jika terdapat state + effect + handler yang memiliki tanggung jawab tertentu, pertimbangkan untuk membuat custom hook.

Contoh:

```tsx
useUsers()
useAuth()
useModal()
usePagination()
useForm()
```

Namun jangan membuat custom hook untuk logic yang terlalu sederhana.

Tujuannya adalah membuat component lebih fokus pada:

```text
UI + interaction
```

sedangkan reusable behavior berada di:

```text
hooks/
```

---

# 4. HAPUS DUPLICATION

Cari seluruh pengulangan kode.

Audit:

* Duplicate component logic
* Duplicate API calls
* Duplicate validation
* Duplicate formatting
* Duplicate constants
* Duplicate types
* Duplicate handlers
* Duplicate JSX
* Duplicate utility functions
* Duplicate CSS/Tailwind classes jika memang relevan

Jika terdapat logic yang sama di beberapa tempat, buat abstraction yang masuk akal.

Namun:

> **Jangan membuat abstraction terlalu dini.**

Jika dua kode hanya terlihat mirip tetapi memiliki behavior berbeda, jangan dipaksa menjadi satu abstraction.

Gunakan prinsip:

> Reuse when behavior is genuinely shared, not merely because code looks similar.

---

# 5. HAPUS UNUSED CODE

Cari dan hapus:

* Unused components
* Unused imports
* Unused functions
* Unused hooks
* Unused variables
* Unused constants
* Unused types/interfaces
* Dead code
* Commented-out code
* Duplicate files
* Deprecated implementation yang sudah tidak digunakan

Tetapi **pastikan terlebih dahulu benar-benar tidak digunakan**.

Jangan menghapus sesuatu hanya karena tidak ditemukan reference secara sederhana jika kemungkinan digunakan melalui:

* Dynamic import
* Route
* Configuration
* Framework convention
* String reference
* Plugin system
* Runtime registration

---

# 6. SPAGHETTI CODE

Identifikasi kode dengan ciri:

* Nested conditional terlalu dalam
* Function terlalu panjang
* Component terlalu panjang
* Banyak state yang saling bergantung
* Banyak `if/else` yang kompleks
* Banyak callback bersarang
* Side effect tersebar
* Logic yang sama muncul di banyak tempat
* File memiliki terlalu banyak responsibility
* Dependency antar-module terlalu kuat
* Circular dependency
* Logic sulit diikuti

Refactor menjadi flow yang lebih jelas.

Prioritaskan readability.

Contoh:

```text
Before:

Component
 ├── fetch data
 ├── transform data
 ├── validate data
 ├── calculate result
 ├── update state
 ├── open modal
 └── render UI
```

menjadi sesuatu yang lebih terstruktur:

```text
Component
 └── UI

Hook
 └── state + interaction

Service
 └── API/data access

Utils
 └── pure transformation/calculation

Types
 └── shared types
```

---

# 7. STATE MANAGEMENT

Audit seluruh penggunaan state.

Cari:

* State yang sebenarnya tidak diperlukan
* Derived state yang seharusnya dihitung
* State yang duplicated
* State yang dapat dipindahkan ke parent/child yang tepat
* `useEffect` yang digunakan untuk hal yang sebenarnya dapat dihitung langsung
* State yang menyebabkan unnecessary re-render
* Global state yang seharusnya local state
* Local state yang sebenarnya perlu shared state

Jangan menambahkan state management library baru kecuali benar-benar diperlukan.

---

# 8. USE EFFECT & SIDE EFFECT

Audit semua `useEffect`.

Cari:

* Effect yang tidak diperlukan
* Effect yang menjalankan derived calculation
* Effect dengan dependency yang salah
* Effect yang dapat diganti dengan event handler
* Effect yang menyebabkan infinite loop
* Effect yang menyebabkan race condition
* Effect yang memiliki cleanup yang hilang
* Duplicate effect

Jangan menggunakan `useEffect` hanya karena "React membutuhkan effect".

---

# 9. TYPESCRIPT

Jika project menggunakan TypeScript, audit seluruh typing.

Cari:

* `any`
* Type assertion yang tidak diperlukan
* Duplicate interface/type
* Type yang terlalu longgar
* Optional property yang tidak diperlukan
* Type yang terlalu kompleks
* Type yang tidak konsisten

Perbaiki typing tanpa membuat code menjadi unnecessarily complicated.

Prioritaskan:

```text
Type safety
+
Readability
```

bukan sekadar menghilangkan semua error TypeScript.

---

# 10. NAMING & CONSISTENCY

Periksa konsistensi:

* Component naming
* Function naming
* Variable naming
* Hook naming
* File naming
* Folder naming
* Type naming
* Constant naming

Gunakan naming yang jelas dan deskriptif.

Hindari nama seperti:

```text
data
item
temp
handleData
processData
doSomething
utils
helper
common
```

jika nama tersebut tidak menjelaskan responsibility sebenarnya.

---

# 11. FILE STRUCTURE

Evaluasi struktur folder project.

Jika struktur saat ini tidak masuk akal, reorganisasi menjadi struktur yang lebih mudah dipahami.

Namun:

**Jangan memindahkan file hanya demi estetika.**

Pastikan struktur tersebut membantu:

* Discoverability
* Reusability
* Separation of concerns
* Scalability
* Maintainability

Pertimbangkan apakah project lebih cocok menggunakan:

```text
feature-based structure
```

atau:

```text
layer-based structure
```

dan pilih berdasarkan kebutuhan project yang sebenarnya.

---

# 12. API & DATA ACCESS

Audit semua API/data fetching.

Cari:

* Duplicate request logic
* API call di banyak component
* Error handling yang tidak konsisten
* Loading state yang duplicated
* Response transformation yang duplicated
* Hardcoded endpoint
* Hardcoded configuration
* Request yang tidak diperlukan
* Race condition
* Missing cleanup/cancellation jika memang diperlukan

Pisahkan data access dari UI jika memungkinkan.

---

# 13. ERROR HANDLING

Pastikan error handling konsisten.

Cari:

* Empty `catch`
* Error yang ditelan
* Error message yang tidak jelas
* Duplicate error handling
* API failure yang tidak ditangani
* Loading state yang tidak pernah selesai
* UI yang crash ketika data null/undefined

Gunakan pola error handling yang konsisten di seluruh project.

---

# 14. PERFORMANCE

Jangan melakukan premature optimization.

Tetapi identifikasi masalah nyata seperti:

* Unnecessary re-render
* Expensive calculation yang dilakukan berulang
* Duplicate API requests
* Large component yang menyebabkan excessive rendering
* Unnecessary state update
* Unstable callbacks jika memang berdampak
* Missing memoization hanya jika memang dibutuhkan

**Jangan menambahkan `useMemo`, `useCallback`, atau `memo` secara membabi buta.**

---

# 15. CSS / STYLING

Jika styling juga berantakan, audit:

* Duplicate styling
* Repeated class patterns
* Inline style yang tidak diperlukan
* Inconsistent spacing
* Inconsistent typography
* Dead CSS
* Component styling yang terlalu kompleks

Rapikan tanpa mengubah visual design secara signifikan.

**Jangan redesign UI kecuali diperlukan untuk memperbaiki struktur kode.**

---

# 16. CONSTANTS & CONFIGURATION

Cari magic numbers dan magic strings.

Contoh:

```tsx
if (status === "completed")
```

atau:

```tsx
setTimeout(callback, 5000)
```

Jika nilai tersebut memang digunakan di banyak tempat atau memiliki business meaning, pertimbangkan:

```ts
const STATUS = {
  COMPLETED: "completed",
}

const TIMEOUT = 5000
```

Tetapi jangan membuat constant untuk setiap string kecil yang hanya digunakan sekali.

---

# 17. DEPENDENCIES

Audit dependency project.

Cari:

* Dependency yang tidak digunakan
* Duplicate library dengan fungsi sama
* Library yang penggunaannya tidak diperlukan
* Import yang dapat diganti dengan functionality bawaan

**Jangan menghapus dependency hanya berdasarkan nama. Pastikan benar-benar tidak digunakan.**

Jangan menambahkan dependency baru kecuali ada alasan yang kuat.

---

# 18. ARCHITECTURAL PROBLEMS

Selain formatting dan component splitting, cari masalah arsitektur yang lebih besar:

* Circular dependencies
* Tight coupling
* God components
* God hooks
* God utilities
* Shared modules yang terlalu generik
* Business logic bercampur dengan presentation
* Data layer bercampur dengan UI
* Feature yang saling bergantung secara tidak sehat

Jika menemukan masalah seperti ini, refactor secara bertahap.

---

# 19. PRESERVE EXISTING BEHAVIOR

Ini sangat penting.

Selama refactoring:

**JANGAN mengubah:**

* Business logic
* API contract
* User flow
* Existing feature behavior
* Data format
* Route behavior
* Authentication behavior
* Expected UI interaction

kecuali memang ditemukan bug yang jelas.

Jika menemukan bug:

1. Catat bug tersebut.
2. Jangan langsung mengubah behavior jika tidak diperlukan untuk refactoring.
3. Jika perbaikannya aman dan jelas, lakukan.
4. Laporkan perubahan tersebut di hasil akhir.

---

# 20. VALIDATION SETELAH REFACTOR

Setelah selesai refactoring:

Jalankan semua validation yang tersedia di project.

Minimal jika tersedia:

```bash
npm run lint
npm run typecheck
npm run build
```

atau command yang sesuai dengan package manager/project.

Jika project memiliki test:

```bash
npm test
```

atau test runner yang digunakan project.

Periksa juga:

* TypeScript errors
* ESLint errors
* Build errors
* Import errors
* Circular dependency
* Runtime errors

Jika ada error setelah refactoring, **perbaiki sampai project kembali dalam kondisi valid.**

---

# WORKFLOW YANG WAJIB DIIKUTI

Gunakan workflow berikut:

## PHASE 1 — DISCOVERY

Scan seluruh project.

Baca semua source code yang relevan.

Identifikasi:

* Framework
* Architecture
* Entry points
* Routes
* Components
* Hooks
* Services
* Utilities
* Types
* State management
* API/data layer
* Configuration
* Tests

Jangan edit apa pun.

---

## PHASE 2 — AUDIT

Buat daftar masalah berdasarkan severity:

### Critical

Masalah yang berpotensi menyebabkan:

* Broken functionality
* Runtime error
* Data corruption
* Serious architectural problem

### High

Masalah seperti:

* God component
* Severe duplication
* Tight coupling
* Major spaghetti logic

### Medium

Masalah seperti:

* Poor naming
* Moderate duplication
* Inconsistent structure
* Unnecessary complexity

### Low

Masalah seperti:

* Minor cleanup
* Formatting
* Small readability improvements

---

## PHASE 3 — REFACTOR PLAN

Sebelum mengedit, tentukan:

1. File mana yang akan diubah.
2. File mana yang akan dibuat.
3. File mana yang akan dihapus.
4. Logic mana yang akan dipindahkan.
5. Component mana yang akan dipecah.
6. Duplicate logic mana yang akan digabung.
7. Dependency mana yang akan dihapus.
8. Risiko perubahan.

Prioritaskan perubahan dengan risiko paling rendah terlebih dahulu.

---

## PHASE 4 — EXECUTE

Mulai refactoring secara bertahap.

Setiap perubahan harus:

* Memiliki alasan jelas.
* Tidak mengubah behavior.
* Mengurangi complexity.
* Meningkatkan readability atau maintainability.

Jangan melakukan perubahan besar yang tidak berhubungan dengan tujuan refactoring.

---

## PHASE 5 — VERIFY

Setelah setiap kelompok perubahan besar:

1. Run lint.
2. Run typecheck.
3. Run test.
4. Run build jika tersedia.

Jika gagal, perbaiki sebelum melanjutkan.

---

## PHASE 6 — FINAL AUDIT

Setelah semua refactoring selesai:

**Scan ulang seluruh project.**

Pastikan tidak ada:

* Unused component
* Unused import
* Duplicate logic
* Dead code
* Obvious spaghetti code
* Circular dependency
* Broken import
* Type error
* Lint error
* Build error
* Component dengan responsibility berlebihan

---

# OUTPUT YANG SAYA INGINKAN

Setelah selesai, berikan laporan:

## 1. Summary

Jelaskan secara singkat kondisi codebase sebelum dan sesudah refactoring.

## 2. Changes Made

Contoh:

```text
- Split UserPage into 5 components
- Extracted API logic into userService
- Created useUsers hook
- Removed 3 unused components
- Removed duplicated validation logic
- Removed unused dependencies
- Simplified nested conditional logic
```

## 3. Files Created

Daftar file baru beserta alasan pembuatannya.

## 4. Files Modified

Daftar file yang diubah dan alasan perubahan.

## 5. Files Deleted

Daftar file yang dihapus dan alasan kenapa aman dihapus.

## 6. Architecture Changes

Jelaskan perubahan struktur architecture secara singkat.

## 7. Validation

Laporkan hasil:

```text
Lint: PASS/FAIL
Typecheck: PASS/FAIL
Tests: PASS/FAIL
Build: PASS/FAIL
```

Jika ada yang gagal, jelaskan errornya.

## 8. Remaining Issues

Jika masih ada masalah yang sengaja tidak diperbaiki karena membutuhkan perubahan behavior atau keputusan arsitektur yang lebih besar, jelaskan di sini.

---

# IMPORTANT CONSTRAINTS

* **Jangan mengarang file atau dependency.**
* **Jangan mengubah code yang belum kamu pahami.**
* **Jangan hanya membaca beberapa file lalu langsung menyimpulkan architecture.**
* **Jangan melakukan mass rewrite tanpa alasan.**
* **Jangan membuat abstraction berlebihan.**
* **Jangan membuat component terlalu kecil.**
* **Jangan menambahkan library tanpa alasan.**
* **Jangan mengubah UI/UX tanpa kebutuhan.**
* **Jangan mengubah business logic hanya karena menurutmu cara lain lebih bagus.**
* **Jangan menghapus code sebelum memastikan code tersebut benar-benar tidak digunakan.**
* **Jangan berhenti setelah memperbaiki satu atau dua file.**
* **Audit ulang seluruh codebase setelah refactoring.**

Prioritas utama:

> **Correctness → Maintainability → Readability → Modularity → Performance**

Bukan sekadar membuat jumlah file menjadi lebih banyak.

Anggap project ini sebagai **codebase production yang perlu diselamatkan dari AI-generated spaghetti code**.

Kerjakan secara hati-hati, sistematis, dan berdasarkan pemahaman penuh terhadap seluruh project.
