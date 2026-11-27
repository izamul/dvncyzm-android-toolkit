/** Penjelasan singkat untuk pengguna awam. Kunci dipakai oleh <InfoTip k="..." />. */
export const TIPS: Record<string, { title: string; text: string }> = {
  tab_perangkat: { title: 'Perangkat', text: 'Ringkasan HP/TV yang tersambung: model, baterai, memori, aplikasi yang sedang terbuka, plus tombol cepat untuk screenshot, rekam layar, dan remote.' },
  tab_logcat: { title: 'Logcat', text: 'Catatan kejadian di dalam HP/TV secara langsung. Dipakai untuk mencari tahu kenapa sebuah aplikasi error atau berhenti sendiri. Merah (Error) berarti ada masalah; ANR berarti aplikasi macet dan tidak merespons.' },
  tab_aplikasi: { title: 'Aplikasi', text: 'Daftar aplikasi di perangkat. Bisa memasang APK, menghapus, menghentikan, membuka, atau membersihkan data sebuah aplikasi.' },
  tab_file: { title: 'File', text: 'Menjelajahi isi penyimpanan perangkat, lalu mengirim file dari laptop ke perangkat atau mengambil file dari perangkat ke laptop.' },
  tab_shell: { title: 'Shell', text: 'Jendela perintah (terminal) langsung ke dalam perangkat. Hanya untuk yang paham perintah Android; salah ketik bisa menghapus data.' },
  tab_tes: { title: 'Tes', text: 'Mengubah pengaturan perangkat untuk keperluan uji, misalnya ukuran layar, tema gelap, atau proxy. Semuanya bisa dikembalikan ke bawaan.' },
  tab_pengaturan: { title: 'Pengaturan', text: 'Lokasi alat bantu (adb dan scrcpy), folder tujuan simpan screenshot, dan daftar pintasan keyboard.' },
  layar: { title: 'Layar', text: 'Screenshot menyimpan gambar layar. Rekam menyimpan video (maks 3 menit). scrcpy menampilkan layar perangkat di laptop sehingga bisa dikontrol dengan mouse dan keyboard.' },
  aksi_cepat: { title: 'Aksi cepat', text: 'Animasi mati membuat tes lebih cepat. Batas layout menggambar garis di sekeliling elemen tampilan. Lokasi sentuhan menandai titik yang disentuh di layar. "Reverse" membuat aplikasi di perangkat bisa mengakses server yang jalan di laptop ini lewat localhost.' },
  wifi: { title: 'Sambungan Wi-Fi', text: 'Setelah tersambung lewat Wi-Fi, kabel USB boleh dicabut. Perangkat di jaringan yang sama muncul otomatis di daftar kiri bagian "Di jaringan". "Sambung ulang otomatis" menghubungkan lagi bila sambungan terputus.' },
  remote: { title: 'Remote TV', text: 'Mengganti remote fisik: tombol panah, OK, Kembali, Home, dan volume. Kotak ketik di bawah mengirim teks ke kolom yang sedang aktif di TV.' },
  foreground: { title: 'Sedang dibuka', text: 'Aplikasi yang sekarang tampil di layar perangkat, diperbarui otomatis. Force stop = paksa berhenti (data tidak hilang). Lihat log = buka catatan khusus aplikasi ini.' },
  deeplink: { title: 'Deep link dan broadcast', text: 'Untuk pengembang. Deep link membuka halaman tertentu di dalam aplikasi lewat alamat khusus. Broadcast mengirim "sinyal" ke aplikasi, misalnya memicu refresh data.' },
  macro: { title: 'Pasang bersih', text: 'Sekali klik: hapus aplikasi lama, pasang APK terbaru dari folder, beri semua izin, lalu buka. Berguna untuk menguji instalasi dari nol. Data aplikasi lama ikut terhapus.' },
  apk: { title: 'Install APK', text: 'APK adalah file pemasang aplikasi Android. Tarik file ke sini atau pilih dari folder; bisa dipasang ke beberapa perangkat sekaligus.' },
  resolusi: { title: 'Resolusi dan density', text: 'Mengubah ukuran dan kerapatan tampilan perangkat untuk menguji layar berbeda. Tekan Reset untuk kembali ke bawaan.' },
  proxy: { title: 'Proxy HTTP', text: 'Mengarahkan lalu lintas internet perangkat lewat laptop (misalnya untuk memeriksa permintaan jaringan). Hapus proxy setelah selesai, kalau tidak internet perangkat bisa mati.' },
  scrcpy: { title: 'scrcpy', text: 'Program terpisah yang menampilkan layar perangkat di laptop. Kualitas lebih tinggi (bit rate) berarti gambar lebih tajam tapi lebih berat. Jika tidak mau jalan, pesan penyebabnya akan ditampilkan. Jika jendelanya hitam tapi kontrol masuk, centang "Atasi layar hitam".' },
  adb: { title: 'adb', text: 'Alat resmi Google yang dipakai aplikasi ini untuk berbicara dengan perangkat Android. Biasanya terdeteksi otomatis.' }
}
