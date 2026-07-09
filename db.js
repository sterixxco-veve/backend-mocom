const mysql = require("mysql2/promise");

// Vercel akan membaca DATABASE_URL dari Environment Variables yang kamu isi nanti
const dbUri = process.env.DATABASE_URL;

let pool;

const initDb = async () => {
  // Menggunakan createPool jauh lebih aman untuk serverless (Vercel)
  pool = mysql.createPool({
    uri: dbUri,
    waitForConnections: true,
    connectionLimit: 10, // Membatasi agar koneksi ke Aiven tidak overload
    queueLimit: 0
  });

  console.log("Koneksi database (Pool) berhasil diinisialisasi.");

  // Karena di Aiven nama database sudah ditentukan saat kamu buat pertama kali,
  // baris CREATE DATABASE & USE sebaiknya dihapus agar tidak error di cloud.
  // Pastikan nama database di Aiven disamakan (misal: proyek_mocom).

  return pool;
};

module.exports = {
  initDb,
  // Kembalikan pool agar bisa dipakai query di file lain
  getDb: () => pool 
};