require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { initDb } = require("./db");
const bcrypt = require("bcrypt");

const app = express();

let db;

app.use(
  cors({
    origin: "http://127.0.0.1:8000",
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
  ROLES
========================= */

app.post("/api/insertRoles", (req, res) => {
  const { role_name } = req.body;

  db.query(
    "INSERT INTO roles (role_name) VALUES (?)",
    [role_name],
    (err, result) => {
      if (err) {
        return res.status(500).json({
          error: err.message,
        });
      }

      res.json({
        id: result.insertId,
        role_name,
      });
    },
  );
});

app.get("/api/getAllRoles", (req, res) => {
  db.query("SELECT * FROM roles", (err, results) => {
    if (err) {
      return res.status(500).json({
        error: err.message,
      });
    }

    res.json(results);
  });
});

// REVISI: Mengubah ke Async/Await agar sinkron dengan koneksi database utama
// PASTIKAN ENDPOINT INI ADA DAN SUDAH BERBASIS ASYNC/AWAIT
app.get("/api/getAllStaffCompany/:company_id", async (req, res) => {
  try {
    const { company_id } = req.params;

    console.log(
      `\n📥 REQUEST MASUK: Mengambil data staf khusus untuk Company ID #${company_id}`,
    );

    // Mengeksekusi query SQL terfilter berdasarkan ID perusahaan sang admin
    const [results] = await db.query(
      "SELECT id, full_name, username, email, role_id, company_id FROM users WHERE company_id = ?",
      [parseInt(company_id)],
    );

    console.log(
      `🚀 Sukses memfilter dan mengirimkan ${results.length} data staf ke Laravel.`,
    );

    // Mengembalikan data berupa array JSON ke Laravel
    return res.json(results);
  } catch (err) {
    console.error("❌ BACKEND ERROR pada getAllStaffCompany:", err.message);
    return res
      .status(500)
      .json({ error: "Gagal memfilter data staf: " + err.message });
  }
});

// REGISTER COMPANY
// REVISI TOTAL: Terapkan gaya Async/Await agar sinkron dengan koneksi initDb()
app.post("/api/registerCompany", async (req, res) => {
  try {
    const { company_name, email, password, phone_number, address } = req.body;

    console.log("=========================================");
    console.log("📥 REQUEST MASUK DARI LARAVEL PANEL");
    console.log("Mendaftarkan Perusahaan:", company_name);

    // 1. Jalankan Query Pertama: Masukkan data ke tabel companies (Menggunakan Await)
    const hashedPassword = await bcrypt.hash(password, 10);
    const [companyResult] = await db.query(
      `INSERT INTO companies 
        (company_name, email, password, phone_number, address) 
        VALUES (?, ?, ?, ?, ?)`,
      [
        company_name,
        email,
        hashedPassword,
        phone_number,
        address,
      ]
    );

    // Ambil ID otomatis dari hasil insert barusan
    // Catatan: Jika menggunakan mysql2/promise, ID didapat dari properti insertId
    const companyId = companyResult.insertId;
    console.log(`✅ Sukses Insert Table Companies. ID Terbakar: #${companyId}`);

    // 2. Jalankan Query Kedua: Membuat akun admin utama otomatis di tabel users
    // PENTING: Pastikan kolom database (fullname, username, dll) namanya sama dengan MySQL kamu!
    const usernameAwal = email.split("@")[0];
    const fullNameAdmin = company_name + " Admin";

    await db.query(
      `INSERT INTO users 
        (full_name, username, email, password, role_id, company_id) 
        VALUES (?, ?, ?, ?, 1, ?)`,
      [
        fullNameAdmin,
        usernameAwal,
        email,
        hashedPassword,
        companyId,
      ],
    );

    console.log(
      `✅ Sukses Membuat Akun Login Admin Default untuk @${usernameAwal}`,
    );
    console.log("=========================================");

    // 3. KIRIM RESPONS SUKSES LANGSUNG KE LARAVEL
    return res.json({
      id: companyId,
      company_name,
      email,
      phone_number,
      address,
      message: "Company and Admin User successfully created using Async/Await.",
    });
  } catch (err) {
    // Apabila ada nama kolom database yang salah ketik, blok CATCH ini akan langsung menangkapnya
    console.error("❌ BACKEND DATABASE ERROR:", err.message);

    // Kirim respons status 500 dalam hitungan milidetik agar Laravel tidak mengalami Timeout 30 detik
    return res.status(500).json({
      error: "Gagal memproses registrasi pada database pusat: " + err.message,
    });
  }
});

// ENDPOINT: MENGAMBIL DETAIL SATU PERUSAHAAN BERDASARKAN ID
app.get("/api/getCompanyDetail/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [results] = await db.query(
      "SELECT id, company_name, email, phone_number, address FROM companies WHERE id = ?",
      [id],
    );

    if (results.length === 0) {
      return res
        .status(404)
        .json({ error: "Data perusahaan tidak ditemukan." });
    }

    return res.json(results[0]);
  } catch (err) {
    console.error("❌ BACKEND ERROR pada getCompanyDetail:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Pastikan rute ini ada di dalam file index.js Express kamu
app.get("/api/getAllCompanies", async (req, res) => {
  try {
    const [results] = await db.query(
      "SELECT id, company_name, email, phone_number, address FROM companies",
    );
    return res.json(results);
  } catch (err) {
    console.error("❌ ERROR pada getAllCompanies:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/getUsersByCompanyId/:company_id", async (req, res) => {
  const timestamp = new Date().toLocaleString("id-ID");
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const companyId = req.params.company_id;

  console.log(
    `\n[${timestamp}] 📥 GET Request masuk ke /api/getUsersByCompanyId/${companyId}`,
  );
  console.log(`[${timestamp}] 🖥️  Dipanggil oleh IP: ${clientIp}`);

  if (!companyId || isNaN(companyId)) {
    console.log(`[${timestamp}] ⚠️  Request ditolak: Company ID tidak valid.`);
    return res
      .status(400)
      .json({ message: "Company ID tidak valid atau harus berupa angka." });
  }

  try {
    const [results] = await db.query(
      // 💡 PERHATIKAN TANDA KOMA SETELAH is_active DI BAWAH INI:
      `SELECT id, role_id, company_id, full_name, username, email, password, is_active,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at, 
        DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM users 
       WHERE company_id = ? AND role_id != 1
       ORDER BY created_at ASC`,
      [parseInt(companyId)],
    );

    console.log(
      `[${timestamp}] 🚀 Sukses menarik data. Menemukan ${results.length} blueprint user.`,
    );
    return res.json(results);
  } catch (err) {
    console.error(`[${timestamp}] ❌ Database Error:`, err.message);
    return res.status(500).json({
      error: "Terjadi kesalahan internal pada server database.",
      details: err.message,
    });
  }
});

// 1. ENDPOINT UNTUK MELIHAT STAFF BERDASARKAN COMPANY
// app.get("/api/getUsersByCompanyId/:company_id", async (req, res) => {
//   try {
//     const { company_id } = req.params;

//     // Query SQL kamu sudah sangat bagus & aman dari SQL Injection (menggunakan ?)
//     const [rows] = await db.query(
//       "SELECT id, full_name, email, role_id, is_active FROM users WHERE company_id = ? AND role_id = 2", // 💡 Tips: Ikut sertakan is_active untuk badge status di UserAdapter kamu
//       [parseInt(company_id)]
//     );

//     return res.json(rows);
//   } catch (err) {
//     return res.status(500).json({ error: err.message });
//   }
// });

// 2. ENDPOINT SUPERADMIN MENAMBAHKAN STAFF KE COMPANY TERTENTU
7; // 🛠️ PASTIKAN RUTE INI DITULIS SEPERTI INI DAN DILETAKKAN DI AREA BEBAS (TIDAK DI DALAM ROUTER GRUP LAIN)
app.post("/api/superadmin/addStaff", async (req, res) => {
  // LOG PALING ATAS (Wajib muncul jika pintu rute ini ketuk)
  console.log(
    "🌐 [NETWORK] Ada request POST masuk ke /api/superadmin/addStaff!",
  );
  console.log("📦 Body Mentah yang Diterima:", req.body);

  try {
    const { company_id, full_name, email, password } = req.body;

    if (!company_id || !full_name || !email || !password) {
      console.warn("⚠️ Gagal validasi: Ada parameter wajib yang kosong.");
      return res
        .status(400)
        .json({ success: false, error: "Parameter data wajib diisi." });
    }

    const usernameDefault = email.split("@")[0];

    const [result] = await db.query(
      `INSERT INTO users (company_id, full_name, username, email, password, role_id) 
       VALUES (?, ?, ?, ?, ?, 2)`,
      [parseInt(company_id), full_name, usernameDefault, email, password],
    );

    console.log(
      `🚀 [BACKDOOR SUCCESS] Staff baru dibuat dengan ID User #${result.insertId}`,
    );
    return res.json({
      success: true,
      message: "Staff berhasil disuntik masuk oleh Pusat!",
    });
  } catch (err) {
    console.error(
      "❌ ERROR internal SQL pada superadmin addStaff:",
      err.message,
    );
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* =========================
  AUTH
========================= */
// REGISTER
app.post("/api/register", async (req, res) => {
  try {
    const { full_name, username, email, password, role_id, company_id } =
      req.body;
    
    const hashedPassword = await bcrypt.hash(password, 10);

    console.log("=========================================");
    console.log(
      `📥 REQUEST MASUK: Mendaftarkan Staff Baru untuk Company ID #${company_id}`,
    );
    console.log(`Nama: ${full_name} | Username: @${username}`);

    // Eksekusi query dengan gaya await promise
    // PASTIKAN nama kolom database di bawah ini (full_name, username, dll) sudah sesuai dengan isi tabel MySQL kamu!
    const [result] = await db.query(
      `INSERT INTO users 
        (full_name, username, email, password, role_id, company_id)
        VALUES (?, ?, ?, ?, ?, ?)`,
      [
          full_name,
          username,
          email,
          hashedPassword,
          parseInt(role_id),
          parseInt(company_id),
      ]
    );

    console.log(
      `✅ Staff Baru Berhasil Disimpan. User ID Terbakar: #${result.insertId}`,
    );
    console.log("=========================================");

    // Kirim respons sukses berupa JSON secara instan ke Laravel
    return res.json({
      id: result.insertId,
      full_name,
      username,
      email,
      password,
      role_id,
      company_id,
      message: "Staff account successfully created using Async/Await.",
    });
  } catch (err) {
    // Apabila terjadi error (misal username/email duplikat atau nama kolom salah ketik)
    console.error("❌ BACKEND DATABASE ERROR pada /api/register:", err.message);

    // Kirim respons status 500 dalam hitungan milidetik agar Laravel tidak mengalami Timeout 30 detik
    return res.status(500).json({
      error:
        "Gagal menyimpan data staff baru ke database pusat: " + err.message,
    });
  }
});

// LOGIN
app.post("/api/login", async (req, res) => {
  try {
    const { email, username, password } = req.body;
    console.log(">>>>>>>> MASUK LOGIN USER <<<<<<<<");
    console.log("EMAIL =", email);
    console.log("PASSWORD =", password);

    const [results] = await db.query(
      `SELECT
          u.id,
          u.company_id,
          u.full_name,
          u.username,
          u.email,
          u.role_id,
          u.password
      FROM users u
      WHERE (u.email = ? OR u.username = ?)`,
      [email, username]
    );

    if (results.length === 0) {
      return res.status(401).json({
        message: "Login gagal",
      });
    }

    const user = results[0];

    const isMatch = await bcrypt.compare(
        password,
        user.password
    );

    if (!isMatch) {
        return res.status(401).json({
            message: "Login gagal"
        });
    }

    delete user.password;
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err.message,
    });
  }
});

// LOGIN
app.post("/api/loginCompany", async (req, res) => {
    try {
        const { email, password } = req.body;

        const [results] = await db.query(
            `SELECT
                id,
                company_name,
                email,
                password,
                phone_number,
                address
            FROM companies
            WHERE email = ?`,
            [email]
        );

        if (results.length === 0) {
            return res.status(401).json({
                message: "Login gagal"
            });
        }

        const company = results[0];

        console.log("Password input :", password);
        console.log("Password DB    :", company.password);

        const isMatch = await bcrypt.compare(
            password,
            company.password
        );

        if (!isMatch) {
            return res.status(401).json({
                message: "Login gagal"
            });
        }

        console.log("MATCH =", isMatch);

        delete company.password;

        res.json(company);

    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
});

// PROFILE
app.get("/api/getUserProfile/:id", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, username, full_name, email, role_id FROM users WHERE id = ?",
      [parseInt(req.params.id)],
    );

    if (rows.length > 0) {
      return res.json(rows[0]); // Mengirim satu objek user rill
    } else {
      return res
        .status(404)
        .json({ success: false, message: "User tidak ditemukan" });
    }
  } catch (err) {
    // Pengaman utama: kalau database error/salah kolom, kirim errornya ke client biar GAK GANTUNG
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* =========================
  USERS
========================= */
app.get("/api/getAllUsers", async (req, res) => {
  const timestamp = new Date().toLocaleString("id-ID");
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  console.log(`\n[${timestamp}] 📥 GET Request masuk ke /api/getAllUsers`);
  console.log(`[${timestamp}] 🖥️  Dipanggil oleh IP: ${clientIp}`);

  try {
    const [results] = await db.query("SELECT * FROM users WHERE company_id IS NOT NULL");

    console.log(
      `[${timestamp}] 🚀 Sukses mengambil ${results.length} data dari database.`,
    );
    console.log(`[${timestamp}] 📋 DAFTAR DATA YANG DIKIRIM KE ANDROID:`);

    if (results.length === 0) {
      console.log(`[${timestamp}] ⚠️  Tabel kosong, mengirim array kosong [].`);
    } else {
      console.table(results);
    }

    res.json(results);
  } catch (err) {
    console.error(`[${timestamp}] ❌ Database Error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/getAllStaff", (req, res) => {
  const timestamp = new Date().toLocaleString("id-ID");
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  console.log(`\n[${timestamp}] 📥 GET Request masuk ke /api/getStaff`);
  console.log(`[${timestamp}] 🖥️  Dipanggil oleh IP: ${clientIp}`);

  db.query("SELECT * FROM users", (err, results) => {
    if (err) {
      console.error(`[${timestamp}] ❌ Database Error:`, err.message);

      return res.status(500).json({
        error: err.message,
      });
    }

    // === PERBAIKAN LOG UNTUK MENAMPILKAN SEMUA DATA ===
    console.log(
      `[${timestamp}] 🚀 Sukses mengambil ${results.length} data dari database.`,
    );
    console.log(`[${timestamp}] 📋 DAFTAR DATA YANG DIKIRIM KE ANDROID:`);

    if (results.length === 0) {
      console.log(`[${timestamp}] ⚠️  Tabel kosong, mengirim array kosong [].`);
    } else {
      console.table(results);
    }

    res.json(results);
  });
});

// === GET ALL STAFF BY COMPANY ID (ISOLASI MULTI-TENANT & EMERGENCY INTERVENTION) ===
app.get("/api/getStaffByCompany/:company_id", async (req, res) => {
  const timestamp = new Date().toLocaleString("id-ID");
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  // Menangkap parameter company_id dari URL Request
  const companyId = req.params.company_id;

  console.log(
    `\n[${timestamp}] 📥 GET Request masuk ke /api/getStaffByCompany/${companyId}`,
  );
  console.log(`[${timestamp}] 🖥️  Dipanggil oleh IP: ${clientIp}`);

  // Validasi jika parameter companyId tidak valid atau bukan angka
  if (!companyId || isNaN(companyId)) {
    console.log(`[${timestamp}] ⚠️  Request ditolak: Company ID tidak valid.`);
    return res.status(400).json({
      message: "Company ID tidak valid atau harus berupa angka.",
    });
  }

  try {
    // Jalankan query MySQL untuk mengambil seluruh staf/karyawan lapangan (role_id = 2)
    // yang bernaung di bawah company_id tersebut
    const [results] = await db.query(
      `SELECT id, company_id, full_name, username, email, role_id 
       FROM users 
       WHERE company_id = ? AND role_id = 2
       ORDER BY id DESC`,
      [parseInt(companyId)],
    );

    console.log(
      `[${timestamp}] 🚀 Sukses menarik data. Menemukan ${results.length} staf aktif.`,
    );

    // Cetak visualisasi data berbentuk tabel di terminal Node.js jika data ditemukan
    if (results.length > 0) {
      console.table(results);
    } else {
      console.log(
        `[${timestamp}] ⚠️  Tidak ada staf yang terikat pada Company ID #${companyId}`,
      );
    }

    // Kirim respon murni berupa Array Objek (JSON) ke Laravel Blade / Alpine.js
    return res.json(results);
  } catch (err) {
    console.error(
      `[${timestamp}] ❌ Database Error pada getStaffByCompany:`,
      err.message,
    );
    return res.status(500).json({
      error: "Terjadi kesalahan internal pada server database pusat.",
      details: err.message,
    });
  }
});

app.get("/api/getUserById/:id", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, company_id, role_id, full_name, username, email, is_active FROM users WHERE id = ?",
      [req.params.id],
    );
    if (rows.length === 0)
      return res.status(404).json({ message: "User tidak ditemukan" });
    return res.json(rows[0]);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/getAllMember", (req, res) => {
  const timestamp = new Date().toLocaleString("id-ID");
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  console.log(`\n[${timestamp}] 📥 GET Request masuk ke /api/getMember`);
  console.log(`[${timestamp}] 🖥️  Dipanggil oleh IP: ${clientIp}`);

  db.query("SELECT * FROM users WHERE role_id=2", (err, results) => {
    if (err) {
      console.error(`[${timestamp}] ❌ Database Error:`, err.message);

      return res.status(500).json({
        error: err.message,
      });
    }

    // === PERBAIKAN LOG UNTUK MENAMPILKAN SEMUA DATA ===
    console.log(
      `[${timestamp}] 🚀 Sukses mengambil ${results.length} data dari database.`,
    );
    console.log(`[${timestamp}] 📋 DAFTAR DATA YANG DIKIRIM KE ANDROID:`);

    if (results.length === 0) {
      console.log(`[${timestamp}] ⚠️  Tabel kosong, mengirim array kosong [].`);
    } else {
      console.table(results);
    }

    res.json(results);
  });
});

app.post("/api/insertUser", async (req, res) => {
  const timestamp = new Date().toLocaleString("id-ID");
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  // 1. Ambil data mentah dari Android Retrofit
  const {
    role_id,
    company_id,
    full_name,
    username,
    email,
    password,
    is_active,
  } = req.body;

  console.log(`\n[${timestamp}] 📥 POST Request masuk ke /api/insertUser`);
  console.log(`[${timestamp}] 🖥️  Dipanggil oleh IP: ${clientIp}`);

  // 2. Validasi parameter inputan
  if (
    !company_id ||
    !role_id ||
    !full_name ||
    !username ||
    !email ||
    !password
  ) {
    console.log(
      `[${timestamp}] ⚠️  Insert Ditolak: Parameter utama ada yang kosong!`,
    );
    return res
      .status(400)
      .json({ success: false, message: "Parameter utama tidak boleh kosong!" });
  }

  try {
  // Hash password sebelum disimpan
  const hashedPassword = await bcrypt.hash(password, 10);

  const [result] = await db.query(
    `INSERT INTO users
     (role_id, company_id, full_name, username, email, password, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      parseInt(role_id),
      parseInt(company_id),
      full_name,
      username,
      email,
      hashedPassword,
      parseInt(is_active ?? 1),
    ]
  );

  console.log(
    `[${timestamp}] ✅ Sukses mendaftarkan User baru dengan ID: ${result.insertId}`
  );

  return res.json({
    id: result.insertId,
    company_id: parseInt(company_id),
    role_id: parseInt(role_id),
    full_name,
    username,
    email,
    // jangan kirim password lagi
    is_active: parseInt(is_active ?? 1),
    created_at: new Date().toISOString().replace("T", " ").substring(0, 19),
    updated_at: new Date().toISOString().replace("T", " ").substring(0, 19),
  });

  } catch (err) {
    console.error(`[${timestamp}] ❌ Database Error:`, err.message);

    return res.status(500).json({
      success: false,
      error: "Terjadi kesalahan saat menyimpan data pengguna baru.",
      details: err.message,
    });
  }
});

app.put("/api/updateUser/:id", async (req, res) => {
  const timestamp = new Date().toLocaleString("id-ID");
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  const { role_id, full_name, username, email, is_active } = req.body;
  const userId = req.params.id;

  console.log(
    `\n[${timestamp}] 📥 PUT Request masuk ke /api/updateUser/${userId}`,
  );
  console.log(`[${timestamp}] 🖥️  Dipanggil oleh IP: ${clientIp}`);

  try {
    // 💡 PERBAIKAN: Ditambahkan `updated_at = NOW()` ke dalam query SQL UPDATE
    const querySql = `
      UPDATE users 
      SET role_id = ?, 
          full_name = ?, 
          username = ?, 
          email = ?, 
          is_active = ?, 
          updated_at = NOW() 
      WHERE id = ?
    `;

    const [result] = await db.query(querySql, [
      parseInt(role_id),
      full_name,
      username,
      email,
      parseInt(is_active),
      parseInt(userId),
    ]);

    // Jika id tidak ditemukan di database
    if (result.affectedRows === 0) {
      console.log(
        `[${timestamp}] ⚠️  Update Gagal: User ID ${userId} tidak ditemukan.`,
      );
      return res
        .status(404)
        .json({ success: false, message: "User tidak ditemukan." });
    }

    console.log(`[${timestamp}] ✅ Sukses mengupdate data User ID: ${userId}`);
    return res.sendStatus(200); // Kembalikan status HTTP 200 OK ke Android Studio
  } catch (err) {
    console.error(`[${timestamp}] ❌ Database Error saat Update:`, err.message);
    return res.status(500).json({
      success: false,
      error: "Terjadi kesalahan saat memperbarui data pengguna.",
      details: err.message,
    });
  }
});

app.delete("/api/deleteUser/:id", async (req, res) => {
  const timestamp = new Date().toLocaleString("id-ID");
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const { id } = req.params;

  console.log(
    `\n[${timestamp}] 🗑️ DELETE Request masuk ke /api/deleteUser/${id}`,
  );
  console.log(`[${timestamp}] 🖥️  Dipanggil oleh IP: ${clientIp}`);

  try {
    const [result] = await db.query("DELETE FROM users WHERE id = ?", [
      parseInt(id),
    ]);

    if (result.affectedRows === 0) {
      console.log(
        `[${timestamp}] ⚠️ Delete Ditolak: User ID ${id} tidak ditemukan di database.`,
      );
      return res
        .status(404)
        .json({ success: false, message: "User tidak ditemukan." });
    }

    console.log(
      `[${timestamp}] 🚀 Sukses menghapus user ID: ${id} dari cloud MySQL.`,
    );

    // 💡 TIPS RETROFIT: Kirim status 200 OK murni agar Response<Unit> di Android membacanya sebagai sukses
    return res
      .status(200)
      .json({ success: true, message: "User berhasil dihapus." });
  } catch (err) {
    console.error(`[${timestamp}] ❌ Database Error saat Delete:`, err.message);
    return res
      .status(500)
      .json({ error: "Gagal menghapus user.", details: err.message });
  }
});

/* =========================
  SCHEDULES
========================= */

app.post("/api/insertSchedules", async (req, res) => {
  const {
    company_id,
    created_by,
    title,
    description,
    start_time,
    end_time,
    location,
  } = req.body;

  // LOGIKA SMART FIX: Jika Android mengirimkan angka Long (Timestamp), ubah otomatis ke format DATETIME MySQL
  let finalStartTime = start_time;
  let finalEndTime = end_time;

  if (start_time && !isNaN(start_time)) {
    finalStartTime = new Date(parseInt(start_time))
      .toISOString()
      .replace("T", " ")
      .substring(0, 19);
  }
  if (end_time && !isNaN(end_time)) {
    finalEndTime = new Date(parseInt(end_time))
      .toISOString()
      .replace("T", " ")
      .substring(0, 19);
  }

  try {
    const [result] = await db.query(
      `INSERT INTO schedules 
       (company_id, created_by, title, description, start_time, end_time, location) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        parseInt(company_id),
        parseInt(created_by),
        title,
        description || null,
        finalStartTime, // Gunakan variabel yang sudah di-format pintar
        finalEndTime, // Gunakan variabel yang sudah di-format pintar
        location || "Default Area",
      ],
    );

    return res.json({ success: true, id: result.insertId });
  } catch (err) {
    console.error("❌ ERROR DATABASE:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/getAllSchedules", async (req, res) => {
  const timestamp = new Date().toLocaleString("id-ID");
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  console.log(`\n[${timestamp}] 📥 GET Request masuk ke /api/getAllSchedules`);
  console.log(`[${timestamp}] 🖥️  Dipanggil oleh IP: ${clientIp}`);

  try {
    // 🛠️ DIUBAH MENJADI ASYNC/AWAIT: Menggunakan TIME_FORMAT agar Android Retrofit aman membaca string jam
    const [results] = await db.query(
      `SELECT id, company_id, created_by, title, description,
        DATE_FORMAT(start_time, '%Y-%m-%d %H:%i:%s') AS start_time, 
        DATE_FORMAT(end_time, '%Y-%m-%d %H:%i:%s')   AS end_time,
        location, created_at
       FROM schedules`,
    );

    console.log(
      `[${timestamp}] 🚀 Sukses mengambil ${results.length} data dari database.`,
    );
    console.log(`[${timestamp}] 📋 DAFTAR DATA YANG DIKIRIM KE ANDROID / WEB:`);

    if (results.length === 0) {
      console.log(`[${timestamp}] ⚠️  Tabel kosong, mengirim array kosong [].`);
    } else {
      console.table(results);
    }

    return res.json(results);
  } catch (err) {
    console.error(`[${timestamp}] ❌ Database Error:`, err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/getSchedulesByCompanyId/:company_id", async (req, res) => {
  const timestamp = new Date().toLocaleString("id-ID");
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const companyId = req.params.company_id;

  console.log(
    `\n[${timestamp}] 📥 GET Request masuk ke /api/getSchedulesByCompanyId/${companyId}`,
  );
  console.log(`[${timestamp}] 🖥️  Dipanggil oleh IP: ${clientIp}`);

  if (!companyId || isNaN(companyId)) {
    console.log(`[${timestamp}] ⚠️  Request ditolak: Company ID tidak valid.`);
    return res
      .status(400)
      .json({ message: "Company ID tidak valid atau harus berupa angka." });
  }

  try {
    const [results] = await db.query(
      `SELECT id, company_id, created_by, title, description,
        DATE_FORMAT(start_time, '%Y-%m-%d %H:%i:%s') AS start_time, 
        DATE_FORMAT(end_time, '%Y-%m-%d %H:%i:%s')   AS end_time,
        location, created_at
       FROM schedules 
       WHERE company_id = ? 
       ORDER BY start_time DESC`,
      [parseInt(companyId)],
    );

    console.log(
      `[${timestamp}] 🚀 Sukses menarik data. Menemukan ${results.length} blueprint shift.`,
    );

    if (results.length > 0) {
      console.log("\n=== DATA SCHEDULE ===");

      // 💡 PERBAIKAN UTAMA: Ukuran padEnd disesuaikan dengan panjang teks judul header agar tidak luber
      const header =
        "id".padEnd(6) +
        "company_id".padEnd(13) +
        "user_id".padEnd(13) +
        "title".padEnd(25) +
        "start_time".padEnd(23) +
        "end_time".padEnd(23) +
        "location".padEnd(18) +
        "created_at";

      console.log(header);
      console.log("-".repeat(header.length + 2)); // Garis pembatas otomatis pas sesuai panjang header

      results.forEach((row) => {
        // Konversi tanggal objek Date dari MySQL menjadi format string ringkas (YYYY-MM-DD HH:mm:ss)
        const tanggalRingkas = row.created_at
          ? new Date(row.created_at)
              .toISOString()
              .replace("T", " ")
              .substring(0, 19)
          : "-";

        // 💡 BARIS DATA: Angka padEnd disamakan persis dengan konfigurasi Header di atas
        const barisData =
          String(row.id).padEnd(6) +
          String(row.company_id).padEnd(13) +
          String(row.created_by).padEnd(13) +
          (row.title || "").padEnd(25) +
          String(row.start_time || "").padEnd(23) +
          String(row.end_time || "").padEnd(23) +
          (row.location || "Online").padEnd(18) +
          tanggalRingkas;

        console.log(barisData);
      });

      console.log("-".repeat(header.length + 2) + "\n");
    }

    return res.json(results);
  } catch (err) {
    console.error(`[${timestamp}] ❌ Database Error:`, err.message);
    return res.status(500).json({
      error: "Terjadi kesalahan internal pada server database.",
      details: err.message,
    });
  }
});

// === UPDATE (EDIT) SCHEDULE BY ID ===
app.put("/api/updateSchedule/:id", async (req, res) => {
  const timestamp = new Date().toLocaleString("id-ID");
  const { id } = req.params;
  const {
    company_id,
    created_by,
    title,
    description,
    start_time,
    end_time,
    location,
  } = req.body;

  console.log(
    `\n[${timestamp}] 📝 PUT Request masuk ke /api/updateSchedule/${id}`,
  );

  try {
    // =========================================================================
    // 💡 PERBAIKAN UTAMA: Pastikan memisahkan kolom dengan KOMA (,), bukan AND!
    // =========================================================================
    const query = `
      UPDATE schedules 
      SET 
        company_id = ?, 
        created_by = ?, 
        title = ?, 
        description = ?, 
        start_time = ?, 
        end_time = ?, 
        location = ?
      WHERE id = ?
    `;

    // Pastikan urutan di dalam array di bawah ini SAMA PERSIS dengan urutan tanda tanya (?) di atas
    const [result] = await db.query(query, [
      parseInt(company_id),
      parseInt(created_by),
      title,
      description || null,
      start_time, // String format "yyyy-MM-dd HH:mm:ss" dari Android mysqlFormat
      end_time, // String format "yyyy-MM-dd HH:mm:ss" dari Android mysqlFormat
      location || null,
      parseInt(id), // Untuk mengisi WHERE id = ? di paling akhir
    ]);

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Jadwal tidak ditemukan." });
    }

    console.log(`[${timestamp}] 🚀 Sukses memperbarui jadwal ID: ${id}`);
    return res.json({ success: true, message: "Jadwal berhasil diperbarui." });
  } catch (err) {
    console.error(`[${timestamp}] ❌ Database Error:`, err.message);
    return res
      .status(500)
      .json({ error: "Gagal memperbarui jadwal.", details: err.message });
  }
});

app.delete("/api/deleteSchedule/:id", async (req, res) => {
  const timestamp = new Date().toLocaleString("id-ID");
  const { id } = req.params;

  console.log(
    `\n[${timestamp}] 🗑️ DELETE Request masuk untuk ID Jadwal: ${id}`,
  );

  try {
    const [result] = await db.query("DELETE FROM schedules WHERE id = ?", [
      parseInt(id),
    ]);

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Jadwal tidak ditemukan." });
    }

    console.log(`[${timestamp}] 🚀 Sukses menghapus jadwal ID: ${id}`);
    return res.json({
      success: true,
      message: "Jadwal berhasil dihapus dari database.",
    });
  } catch (err) {
    console.error(`[${timestamp}] ❌ Database Error:`, err.message);
    return res
      .status(500)
      .json({ error: "Gagal menghapus jadwal.", details: err.message });
  }
});

/* ========================================================
  ATTENDANCE 
======================================================== */
app.get("/api/getAttendancesByCompanyId/:company_id", async (req, res) => {
  // Ambil parameter company_id dari URL routing Retrofit
  const companyId = req.params.company_id;
  const logTimestamp = new Date().toLocaleString("id-ID");

  console.log(
    `\n[${logTimestamp}] 🔍 ADMIN MONITORING: Menarik data absensi untuk Company ID: ${companyId}`,
  );

  try {
    // Kueri SQL JOIN Berantai untuk menembus company_id yang ada di tabel schedules
    const querySql = `
            SELECT 
                a.id, 
                a.assignment_id, 
                DATE_FORMAT(a.check_in, '%Y-%m-%d %H:%i:%s') AS check_in, 
                DATE_FORMAT(a.check_out, '%Y-%m-%d %H:%i:%s') AS check_out, 
                a.status, 
                a.sync_status,
                a.created_at
            FROM attendances a
            INNER JOIN assignments n ON a.assignment_id = n.id
            INNER JOIN schedules s ON n.schedule_id = s.id
            WHERE s.company_id = ?
            ORDER BY a.created_at DESC
        `;

    // Eksekusi kueri ke database MySQL cloud
    const [rows] = await db.query(querySql, [parseInt(companyId)]);

    // =========================================================================
    // 💡 LOG DEBUGGING DATA YANG TERKIRIM KE ANDROID (EduStaff Pro)
    // =========================================================================
    console.log(
      `[${logTimestamp}] ✅ Sukses menemukan ${rows.length} rekam absensi staff.`,
    );

    if (rows.length > 0) {
      console.log(
        `[${logTimestamp}] 📋 Sampel data teratas yang dikirim ke Android (Max 3 baris):`,
      );
      rows.slice(0, 3).forEach((row, index) => {
        console.log(
          `   👉 [Baris ${index + 1}] ID Absen: ${row.id} | Assignment ID: ${row.assignment_id}`,
        );
        console.log(
          `      • check_in  (Tipe: ${typeof row.check_in})  -> ${row.check_in}`,
        );
        console.log(
          `      • check_out (Tipe: ${typeof row.check_out}) -> ${row.check_out}`,
        );
        console.log(
          `      • status    -> ${row.status} | sync_status -> ${row.sync_status}`,
        );
      });
    } else {
      console.log(
        `[${logTimestamp}] ⚠️ Data kosong untuk Company ID ${companyId}, mengirim array kosong []`,
      );
    }
    // =========================================================================

    // Kembalikan data dalam bentuk Array JSON (Retrofit: List<AttendanceJson>)
    return res.status(200).json(rows);
  } catch (err) {
    console.error(
      `[${logTimestamp}] ❌ Database Error pada getAttendancesByCompanyId:`,
      err.message,
    );
    return res.status(500).json({
      error: "Gagal menarik data monitoring absensi dari server cloud.",
      details: err.message,
    });
  }
});

/* ========================================================
  ATTENDANCE REAL-TIME LOG & AI REPORT GENERATOR (HTTP REST)
======================================================== */
app.get("/api/getAttendanceReport/:company_id", async (req, res) => {
  try {
    const { company_id } = req.params;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    console.log(
      `\n📊 [HTTP REST API] Memproses data laporan absensi Company ID #${company_id}`,
    );

    // 1. Ambil data gabungan absensi
    const [attendanceLogs] = await db.query(
      `SELECT 
          a.id as attendance_id, u.full_name, u.username, s.title as shift_title,
          s.start_time, s.end_time, a.check_in, a.check_out
        FROM attendances a
        JOIN assignments am ON a.assignment_id = am.id
        JOIN schedules s ON am.schedule_id = s.id
        JOIN users u ON am.user_id = u.id
        WHERE u.company_id = ? AND DATE(a.check_in) = CURDATE()`,
      [parseInt(company_id)],
    );

    if (attendanceLogs.length === 0) {
      return res.json({
        logs: [],
        ai_summary:
          "Tidak ada aktivitas absensi atau shift yang berjalan pada hari ini.",
      });
    }

    // PERBAIKAN: Ubah v1 menjadi v1beta agar mendukung penuh properti response_mime_type
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const dataMentahAbsen = JSON.stringify(attendanceLogs);

    const instructionPrompt = `
        Kamu adalah Manajer Operasional HRD Senior. Di bawah ini adalah data mentah log absensi shift karyawan hari ini dalam format JSON.
        Tugasmu adalah menganalisis data tersebut dan memberikan 1 paragraf ringkasan eksekutif (maksimal 4 kalimat) dalam Bahasa Indonesia resmi mengenai performa kehadiran hari ini, apakah ada keterlambatan, atau semua berjalan optimal.
        
        Data Mentah Log Absensi:
        ${dataMentahAbsen}
      `;

    // Laporan PDF membutuhkan teks paragraf bebas, jadi generation_config dikosongkan saja
    const payloadReport = {
      contents: [{ parts: [{ text: instructionPrompt }] }],
    };

    const aiResponse = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadReport), // ⬅️ Pastikan nama variabel sinkron
    });

    let aiSummaryText = "Gagal memuat ringkasan otomatis AI.";

    if (aiResponse.ok) {
      const aiDataParsed = await aiResponse.json();
      aiSummaryText = aiDataParsed.candidates[0].content.parts[0].text.trim();
    } else {
      console.error(
        "⚠️ Google Gemini API (PDF) merespon dengan error:",
        await aiResponse.text(),
      );
    }

    return res.json({ logs: attendanceLogs, ai_summary: aiSummaryText });
  } catch (err) {
    console.error("❌ BACKEND REPORT ERROR:", err.message);
    return res
      .status(500)
      .json({ error: "Gagal memproses laporan: " + err.message });
  }
});

/* =========================
  ASSIGNMENTS
========================= */

  app.post("/api/insertAssignments", async (req, res) => {
    try {
      const {
        schedule_id,
        user_id,
        role_in_event,
        job_desc,
        assigned_at // 💡 Samakan penamaannya dengan Android & DB (image_e05a3f.png)
      } = req.body;

      if (!assigned_at) {
        return res.status(400).json({ error: "assigned_at is required" });
      }

      // 💡 Ubah angka milidetik Long dari Android menjadi format DATETIME string yang dipahami MySQL
      // Jika Android mengirim dateMillis berupa angka, kita ubah ke format MySQL: YYYY-MM-DD HH:MM:SS
      const mysqlDateTime = new Date(assigned_at).toISOString().slice(0, 19).replace('T', ' ');

      // Cek apakah assignment sudah ada menggunakan nama kolom yang benar
      const [existing] = await db.query(
        `SELECT id FROM assignments WHERE schedule_id = ? AND user_id = ?`,
        [schedule_id, user_id] 
      );

      let resultId;

      if (existing.length > 0) {
        await db.query(
          `UPDATE assignments SET role_in_event = ?, job_desc = ? WHERE id = ?`,
          [role_in_event, job_desc, existing[0].id]
        );
        resultId = existing[0].id;
      } else {
        const [result] = await db.query(
          `INSERT INTO assignments (schedule_id, user_id, role_in_event, job_desc, assigned_at)
           VALUES (?, ?, ?, ?, ?)`,
          [schedule_id, user_id, role_in_event, job_desc, mysqlDateTime]
        );
        resultId = result.insertId;
      }
      
      try {
        await db.query(
          `INSERT INTO notifications
          (user_id, title, message, type)
          VALUES (?, 'New Assignment', 'You got a new assignment', 'assignment')`,
          [user_id]
        );
      } catch (notiErr) {
        console.warn("⚠️ Warning: Gagal menyisipkan notifikasi otomatis:", notiErr.message);
      }

      return res.json({
        id: resultId,
        schedule_id,
        user_id,
        role_in_event,
        job_desc,
        assigned_at
      });
    } catch (err) {
      console.error("❌ BACKEND ERROR pada insertAssignments:", err.message);
      return res.status(500).json({
        error: err.message
      });
    }
});

  app.get("/api/getTodayAssignmentsByUserId/:user_id", async (req, res) => {
    const { user_id } = req.params;
    const { month, year } = req.query; // Mengambil query params untuk filter

    console.log("REQUEST");
    console.log(user_id);

    try {
      // 1. PONDASI UTAMA: Menggunakan let query agar bisa ditambah klausa secara dinamis
      let query = `SELECT
          a.id AS assignment_id,
          a.schedule_id,
          a.user_id,
          a.role_in_event,
          a.job_desc,
          a.status,
          a.assigned_at,
          s.title,
          s.description,
          DATE_FORMAT(s.start_time, '%Y-%m-%d %H:%i:%s') AS start_time,
          DATE_FORMAT(s.end_time, '%Y-%m-%d %H:%i:%s') AS end_time,
          s.location
        FROM assignments a
        JOIN schedules s ON a.schedule_id = s.id
        WHERE a.user_id = ?`;

      const params = [parseInt(user_id)];

      // 2. LOGIKA FILTER: Menyisipkan kondisi month & year yang Anda maksud
      if (month && year) {
        query += ` AND MONTH(a.assigned_at) = ? AND YEAR(a.assigned_at) = ?`;
        params.push(month, year);
      } else if (year) {
        query += ` AND YEAR(a.assigned_at) = ?`;
        params.push(year);
      }

      // 3. SORTING UTAMA: Tetap menggunakan aturan sorting Anda
      query += ` ORDER BY a.assigned_at ASC, s.start_time ASC`;

      const [results] = await db.query(query, params);

      console.log("RESULT");
      console.log(results);

      return res.json(results);
    } catch (err) {
      console.log(err);
      return res.status(500).json({
        error: err.message
      });
    }
  });

  app.get("/api/getAssignmentsByUserId/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;

    console.log("REQUEST");
    console.log(user_id);

    const [results] = await db.query(
      `
      SELECT
          a.id AS assignment_id,
          a.schedule_id,
          a.user_id,
          a.role_in_event,
          a.job_desc,
          a.status,
          a.assigned_at,
          s.title,
          s.description,
          DATE_FORMAT(s.start_time, '%Y-%m-%d %H:%i:%s') AS start_time,
          DATE_FORMAT(s.end_time, '%Y-%m-%d %H:%i:%s') AS end_time,
          s.location
      FROM assignments a
      JOIN schedules s
        ON a.schedule_id = s.id
      WHERE a.user_id = ?
      ORDER BY s.start_time ASC
      `,
      [parseInt(user_id)]
    );

    console.log("RESULT");
    console.log(results);

    return res.json(results);

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: err.message,
    });
  }
});

/* =========================
  ATTENDANCES
========================= */

app.post("/api/insertAttendance/checkin", (req, res) => {
  const { assignment_id } = req.body;

  db.query(
    `INSERT INTO attendances
      (assignment_id, check_in)
      VALUES (?, NOW())`,
    [assignment_id],
    (err, result) => {
      if (err) {
        return res.status(500).json({
          error: err.message,
        });
      }

      res.json({
        id: result.insertId,
        assignment_id,
        check_in: new Date(),
      });
    },
  );
});

app.post("/api/updateAttendance/checkout", (req, res) => {
  const { assignment_id } = req.body;

  db.query(
    `UPDATE attendances
      SET check_out = NOW()
      WHERE assignment_id = ?`,
    [assignment_id],
    (err) => {
      if (err) {
        return res.status(500).json({
          error: err.message,
        });
      }

      res.json({
        assignment_id,
        check_out: new Date(),
        message: "Check-out success",
      });
    },
  );
});

/* =========================
  REPLACEMENTS
========================= */

// 🟢 SEKARANG SUDAH ASYNC/AWAIT & MENAMPUNG REPLACEMENT_USER_ID (ORANG B)
app.post("/api/insertReplacements", async (req, res) => {
  const logTimestamp = new Date().toLocaleString("id-ID");
  const { assignment_id, requested_by, replacement_user_id, reason } = req.body;

  console.log(
    `\n[${logTimestamp}] 🔄 AJUAN PERIZINAN | User #${requested_by} ingin melempar Assignment #${assignment_id} ke User #${replacement_user_id}`,
  );

  if (!assignment_id || !requested_by || !replacement_user_id || !reason) {
    return res.status(400).json({
      success: false,
      message:
        "Data tidak lengkap! Parameter assignment_id, requested_by, replacement_user_id, dan reason wajib diisi.",
    });
  }

  try {
    const [result] = await db.query(
      `INSERT INTO replacements 
        (assignment_id, requested_by, replacement_user_id, reason, status) 
       VALUES (?, ?, ?, ?, 'pending')`,
      [
        parseInt(assignment_id),
        parseInt(requested_by),
        parseInt(replacement_user_id),
        reason,
      ],
    );

    console.log(
      `[${logTimestamp}] ✅ Sukses mencatat permohonan izin di database dengan ID Request: #${result.insertId}`,
    );

    return res.json({
      success: true,
      id: result.insertId,
      assignment_id,
      requested_by,
      replacement_user_id,
      reason,
      message: "Permohonan delegasi tugas berhasil dikirim ke Admin!",
    });
  } catch (err) {
    console.error(
      `[${logTimestamp}] ❌ Gagal mengisikan data permohonan:`,
      err.message,
    );
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/* =========================
  AI RECOMMENDATIONS
========================= */

app.post("/api/insertAi-recommendations", (req, res) => {
  const { schedule_id, recommended_user_id, score, reason } = req.body;

  db.query(
    `INSERT INTO ai_recommendations
      (schedule_id, recommended_user_id, score, reason)
      VALUES (?, ?, ?, ?)`,
    [schedule_id, recommended_user_id, score, reason],
    (err, result) => {
      if (err) {
        return res.status(500).json({
          error: err.message,
        });
      }

      res.json({
        id: result.insertId,
        schedule_id,
        recommended_user_id,
        score,
        reason,
      });
    },
  );
});

app.get("/api/getAi-recommendations/:schedule_id", (req, res) => {
  const { schedule_id } = req.params;

  db.query(
    "SELECT * FROM ai_recommendations WHERE schedule_id = ?",
    [schedule_id],
    (err, results) => {
      if (err) {
        return res.status(500).json({
          error: err.message,
        });
      }

      res.json(results);
    },
  );
});

// REVISI ENDPOINT: Amankan konversi string data text & tracking log
app.get("/api/getLeaveRequestsCompany/:company_id", async (req, res) => {
  try {
    const { company_id } = req.params;

    console.log(
      `\n🔍 [TRACKING] Laravel sedang meminta data izin untuk Company ID: ${company_id}`,
    );

    // Kita gunakan CAST atau jamin kolom text terkonversi menjadi string biasa
    const [results] = await db.query(
      `SELECT 
          r.id,
          r.assignment_id,
          r.requested_by,
          r.reason,
          r.is_valid,
          IFNULL(r.ai_reason, 'Tidak ada catatan analisis AI.') as ai_reason,
          r.status,
          u.full_name,
          u.username
        FROM replacements r
        JOIN users u ON r.requested_by = u.id
        WHERE u.company_id = ?
        ORDER BY r.id DESC`,
      [parseInt(company_id)],
    );

    // PENTING: Pantau di terminal Node.js kamu apakah array ini ada isinya atau []
    console.log("📦 Data yang berhasil diambil dari MySQL:", results);

    return res.json(results);
  } catch (err) {
    console.error("❌ ERROR pada getLeaveRequestsCompany:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

/* ========================================================
   WEEKLY WORKLOAD MONITORING SYSTEM - FINAL FIXED
======================================================== */
app.get("/api/getWeeklyWorkload/:company_id", async (req, res) => {
  try {
    const { company_id } = req.params;

    console.log(
      `\n📊 [WORKLOAD ENGINE] Menghitung akumulasi jam kerja mingguan Company ID #${company_id}`,
    );

    // 1. Ambil daftar semua staff murni khusus perusahaan ini
    const [staffRows] = await db.query(
      `SELECT id, full_name, username FROM users 
       WHERE company_id = ? AND role_id = 2`,
      [parseInt(company_id)],
    );

    let overworked = 0;
    let normal = 0;
    let underworked = 0;
    const details = [];

    // 2. Kalkulasi jam kerja riil mingguan masing-masing staff
    for (let staff of staffRows) {
      const [attendanceRows] = await db.query(
        `SELECT IFNULL(SUM(TIMESTAMPDIFF(HOUR, a.check_in, a.check_out)), 0) as total_hours
         FROM attendances a
         JOIN assignments am ON a.assignment_id = am.id
         WHERE am.user_id = ? -- 🛠️ FIXED: Menggunakan nama kolom user_id yang sah di tabel assignments
           AND a.check_in >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`,
        [staff.id],
      );

      const totalHours = attendanceRows[0]
        ? parseInt(attendanceRows[0].total_hours)
        : 0;

      // Klasifikasi batas jam kerja
      if (totalHours > 45) {
        overworked++;
      } else if (totalHours >= 35 && totalHours <= 45) {
        normal++;
      } else {
        underworked++;
      }

      details.push({
        id: staff.id,
        full_name: staff.full_name,
        username: staff.username,
        total_hours: totalHours,
      });
    }

    console.log(
      `🚀 Sukses kalkulasi beban. Overworked: ${overworked}, Normal: ${normal}, Underworked: ${underworked}`,
    );

    return res.json({
      overworked,
      normal,
      underworked,
      details: details,
    });
  } catch (err) {
    console.error("❌ WORKLOAD CALCULATION ERROR:", err.message);
    return res
      .status(500)
      .json({ error: "Gagal menghitung jam kerja: " + err.message });
  }
});

/* ========================================================
  AI LEAVE VALIDATION - VERSI REST API HTTP MURNI (NO SDK)
======================================================== */
app.post("/api/analyze-leave-request", async (req, res) => {
  try {
    const { reason } = req.body;

    if (!reason) {
      return res
        .status(400)
        .json({ success: false, error: "Teks alasan izin kosong." });
    }

    console.log(`\n🤖 [REST API] Mengevaluasi dokumen alasan: "${reason}"`);

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const systemInstruction = `
      Anda adalah HRD senior. Evaluasi alasan izin ini secara objektif.
      Aturan: Berikan is_valid = 1 jika mendesak (Sakit, Kecelakaan, UGD, Musibah). Berikan is_valid = 0 jika remeh (Kesiangan, malas, urusan pribadi bisa ditunda).
      WAJIB keluarkan format JSON murni:
      { "is_valid": 1 atau 0, "ai_reason": "1 kalimat penjelasan Bahasa Indonesia" }
    `;

    const payloadAnalyze = {
      contents: [
        {
          parts: [
            {
              text: `Aturan:\n${systemInstruction}\n\nNilailah teks ini: "${reason}"`,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
      },
    };

    let apiResponse;
    let retries = 3; // Sistem akan otomatis mencoba mengetuk pintu Google hingga 3 kali jika terjadi error 503

    while (retries > 0) {
      apiResponse = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadAnalyze),
      });

      if (apiResponse.status !== 503) {
        break; // Keluar dari loop jika status bukan 503 (berhasil atau jenis error lain)
      }

      console.warn(
        `⚠️ Google API sibuk (503). Mencoba ulang dalam 1.5 detik... (Sisa percobaan: ${retries - 1})`,
      );
      retries--;
      await new Promise((resolve) => setTimeout(resolve, 1500)); // Delay jeda sebelum menembak ulang
    }

    // JIKA GOOGLE API TERNYATA BENAR-BENAR DOWN (TETAP SIBUK SETELAH 3X RETRY)
    if (!apiResponse.ok && apiResponse.status === 503) {
      console.log(
        "fallback 💡 Mengaktifkan sistem penyaringan cadangan internal (HRD Local Engine)...",
      );

      // Deteksi kata kunci darurat secara manual menggunakan Regex Local Server
      const kataKunciDarurat =
        /kecelakaan|sakit|ugd|rs|rumah sakit|dokter|musibah|meninggal|kejang/i;
      const isValidLocal = kataKunciDarurat.test(reason) ? 1 : 0;
      const reasonLocal =
        isValidLocal === 1
          ? "Validasi Cadangan: Alasan terdeteksi mengandung unsur kedaruratan medis/force majeure (Disetujui HRD Engine)."
          : "Validasi Cadangan: Alasan terdeteksi minim indikasi kedaruratan medis mendesak (Ditinjau Ulang).";

      return res.json({
        success: true,
        is_valid: isValidLocal,
        ai_reason: reasonLocal,
      });
    }

    // JIKA GOOGLE API MERESPONS DENGAN SUKSES (200 OK)
    if (apiResponse.ok) {
      const aiDataParsed = await apiResponse.json();
      const rawJsonText =
        aiDataParsed.candidates[0].content.parts[0].text.trim();
      const aiResult = JSON.parse(rawJsonText);

      console.log("🧠 Hasil Analisis Sukses Berbasis REST:", aiResult);
      return res.json({
        success: true,
        is_valid: aiResult.is_valid,
        ai_reason: aiResult.ai_reason,
      });
    } else {
      const errorText = await apiResponse.text();
      throw new Error(
        `Google API merespon dengan status ${apiResponse.status}: ${errorText}`,
      );
    }
  } catch (err) {
    console.error("❌ BACKEND ANALYSIS ERROR:", err.message);
    return res.status(500).json({
      success: false,
      error: "Gagal memproses analisis AI.",
      details: err.message,
    });
  }
});

/* ========================================================
   REAL-TIME TODAY ATTENDANCE LOG FOR DASHBOARD
======================================================== */
app.get("/api/getTodayAttendanceLog/:company_id", async (req, res) => {
  try {
    const { company_id } = req.params;

    console.log(
      `\n🕒 [ATTENDANCE LOG] Menarik data check-in hari ini untuk Company ID #${company_id}`,
    );

    // Query mengambil log masuk staf khusus hari ini
    const [rows] = await db.query(
      `SELECT 
        u.full_name,
        u.username,
        s.title as shift_title,
        TIME(a.check_in) as jam_masuk,
        IF(a.check_out IS NULL, 'Belum Pulang', TIME(a.check_out)) as jam_keluar
       FROM attendances a
       JOIN assignments am ON a.assignment_id = am.id
       JOIN schedules s ON am.schedule_id = s.id
       JOIN users u ON am.user_id = u.id
       WHERE u.company_id = ? AND DATE(a.check_in) = CURDATE()
       ORDER BY a.check_in DESC`,
      [parseInt(company_id)],
    );

    return res.json(rows);
  } catch (err) {
    console.error("❌ TODAY LOG ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

/* ========================================================
 ACTION: ADMIN MEMUTUSKAN STATUS PERMOHONAN IZIN (APPROVE / REJECT)
======================================================== */
app.post("/api/respond-leave-request", async (req, res) => {
  try {
    // Note: replacement_id di sini adalah ID Baris dari tabel replacements
    const { replacement_id, action, ai_reason } = req.body;

    if (!replacement_id || !action) {
      return res
        .status(400)
        .json({ success: false, error: "Data yang dikirimkan tidak lengkap." });
    }

    // 1. Ambil informasi detail permohonan secara lengkap (tambahkan assignment_id dan replacement_user_id)
    const [leaveData] = await db.query(
      "SELECT assignment_id, requested_by, replacement_user_id, reason FROM replacements WHERE id = ?",
      [parseInt(replacement_id)],
    );

    if (leaveData.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Data pengajuan izin tidak ditemukan.",
      });
    }

    const { assignment_id, requested_by, replacement_user_id, reason } =
      leaveData[0];
    const statusFinal = action === "approve" ? "approved" : "rejected";
    const statusTextIndo = action === "approve" ? "DISETUJUI" : "DITOLAK";

    console.log(
      `\n⚖️ [ACTION ADMIN] Memproses status baru untuk Permohonan ID #${replacement_id}: ${statusFinal}`,
    );

    // 2. Update status permohonan beserta simpan catatan hasil evaluasi AI ke database
    await db.query(
      `UPDATE replacements 
       SET status = ?, ai_reason = ? 
       WHERE id = ?`,
      [statusFinal, ai_reason || "", parseInt(replacement_id)],
    );

    // 3. 🎯 LOGIKA UTAMA: Jika disetujui admin, tukar pemilik tugas di tabel assignments ke Orang B!
    if (statusFinal === "approved") {
      await db.query("UPDATE assignments SET user_id = ? WHERE id = ?", [
        replacement_user_id,
        assignment_id,
      ]);
      console.log(
        `⚙️ [SHIFT TRANSMISSION] Tugas ID #${assignment_id} resmi dialihkan dari User #${requested_by} ke User #${replacement_user_id}`,
      );
    }

    // 4. Suntik Notifikasi Otomatis ke Karyawan yang mengajukan (Orang A)
    const judulNotif = `Pengajuan Izin ${statusTextIndo}`;
    const pesanNotif = `Permohonan izin Anda dengan alasan "${reason.substring(0, 50)}..." telah ${statusFinal} oleh Admin.`;

    await db.query(
      `INSERT INTO notifications (user_id, title, message, type) 
       VALUES (?, ?, ?, 'assignment')`,
      [requested_by, judulNotif, pesanNotif],
    );

    console.log(
      `🔔 Notifikasi konfirmasi berhasil dikirimkan ke User ID #${requested_by}`,
    );

    return res.json({
      success: true,
      message: `Permohonan berhasil ${statusFinal} dan tugas telah resmi disesuaikan.`,
    });
  } catch (err) {
    console.error("❌ BACKEND RESPOND LEAVE ERROR:", err.message);
    return res.status(500).json({
      success: false,
      error: "Gagal memproses keputusan admin: " + err.message,
    });
  }
});

/* =========================
  NOTIFICATIONS
========================= */

app.get("/api/getNotificationsByUserId/:user_id", (req, res) => {
  const { user_id } = req.params;

  db.query(
    `SELECT *
      FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC`,
    [user_id],
    (err, results) => {
      if (err) {
        return res.status(500).json({
          error: err.message,
        });
      }

      res.json(results);
    },
  );
});

app.put("/api/updateNotifications/:id/read", (req, res) => {
  const { id } = req.params;

  db.query(
    `UPDATE notifications
      SET is_read = TRUE
      WHERE id = ?`,
    [id],
    (err) => {
      if (err) {
        return res.status(500).json({
          error: err.message,
        });
      }

      res.json({
        id,
        is_read: true,
        message: "Marked as read",
      });
    },
  );
});

/* =========================
  RESOURCES
========================= */

app.post("/api/insertResources", (req, res) => {
  const { schedule_id, title, content, file_url } = req.body;

  db.query(
    `INSERT INTO resources
      (schedule_id, title, content, file_url)
      VALUES (?, ?, ?, ?)`,
    [schedule_id, title, content, file_url],
    (err, result) => {
      if (err) {
        return res.status(500).json({
          error: err.message,
        });
      }

      res.json({
        id: result.insertId,
        schedule_id,
        title,
        content,
        file_url,
      });
    },
  );
});

app.get("/api/getResources/:schedule_id", (req, res) => {
  const { schedule_id } = req.params;

  db.query(
    "SELECT * FROM resources WHERE schedule_id = ?",
    [schedule_id],
    (err, results) => {
      if (err) {
        return res.status(500).json({
          error: err.message,
        });
      }

      res.json(results);
    },
  );
});

/* =========================
  ANNOUNCEMENTS
========================= */

app.post("/api/insertAnnouncements", (req, res) => {
  const { title, message, created_by } = req.body;

  db.query(
    `INSERT INTO announcements
      (title, message, created_by)
      VALUES (?, ?, ?)`,
    [title, message, created_by],
    (err, result) => {
      if (err) {
        return res.status(500).json({
          error: err.message,
        });
      }

      res.json({
        id: result.insertId,
        title,
        message,
        created_by,
      });
    },
  );
});

app.get("/api/getAllAnnouncements", async (req, res) => {
  try {
    const [results] = await db.query(
      "SELECT id, title, message, created_by, UNIX_TIMESTAMP(created_at) * 1000 as created_at FROM announcements"
    );
    console.log(results)
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   MY SCHEDULE (STAFF)
========================= */

app.get("/api/mySchedule/:user_id", (req, res) => {

  const { user_id } = req.params;

  db.query(
    `SELECT
        a.id AS assignment_id,
        a.schedule_id,
        a.user_id,
        a.role_in_event,
        a.job_desc,
        a.status,

        s.title,
        s.description,
        s.start_time,
        s.end_time,
        s.location

     FROM assignments a

     INNER JOIN schedules s
        ON a.schedule_id = s.id

     WHERE a.user_id = ?

     ORDER BY s.start_time ASC`,
    [user_id],
    (err, results) => {

      if (err) {
        return res.status(500).json({
          error: err.message
        });
      }

      res.json(results);

    }
  );

});

// staff attendance
app.get("/api/getAttendancesByUserId/:user_id", async (req, res) => {
  // Ambil parameter user_id dari URL
  const userId = req.params.user_id;
  const logTimestamp = new Date().toLocaleString("id-ID");

  console.log(
    `\n[${logTimestamp}] 👤 STAFF ATTENDANCE: Menarik data absensi untuk User ID: ${userId}`,
  );

  try {
    // Query attendance berdasarkan user yang terhubung melalui assignments
    const querySql = `
            SELECT
                ad.id,
                ad.assignment_id,
                DATE_FORMAT(ad.check_in, '%Y-%m-%d %H:%i:%s') AS check_in,
                DATE_FORMAT(ad.check_out, '%Y-%m-%d %H:%i:%s') AS check_out,
                ad.status,
                ad.sync_status,
                ad.created_at,
                s.id AS schedule_id,
                s.title,
                s.location,
                s.start_time,
                s.end_time
            FROM attendances ad
            JOIN assignments ag
                ON ad.assignment_id = ag.id
            JOIN schedules s
                ON s.id = ag.schedule_id
            WHERE ag.user_id = ?
            ORDER BY ad.created_at DESC;
          `;

    const [rows] = await db.query(querySql, [parseInt(userId)]);

    // ============================================================
    // DEBUG LOG
    // ============================================================
    console.log(
      `[${logTimestamp}] ✅ Ditemukan ${rows.length} data absensi untuk User ID ${userId}`,
    );

    if (rows.length > 0) {
      console.log(
        `[${logTimestamp}] 📋 Sampel data yang dikirim ke Android (Max 3 baris):`,
      );

      rows.slice(0, 3).forEach((row, index) => {
        console.log(`   👉 [Baris ${index + 1}] Attendance ID: ${row.id}`);
        console.log(`      • assignment_id -> ${row.assignment_id}`);
        console.log(`      • check_in      -> ${row.check_in}`);
        console.log(`      • check_out     -> ${row.check_out}`);
        console.log(`      • status        -> ${row.status}`);
      });
    } else {
      console.log(
        `[${logTimestamp}] ⚠️ Tidak ada data absensi untuk User ID ${userId}`,
      );
    }
    // ============================================================

    return res.status(200).json(rows);
  } catch (err) {
    console.error(
      `[${logTimestamp}] ❌ Database Error pada getAttendancesByUserId:`,
      err.message,
    );

    return res.status(500).json({
      error: "Gagal mengambil data absensi staff.",
      details: err.message,
    });
  }
});

//staff check in
app.post("/api/checkIn", async (req, res) => {
  const logTimestamp = new Date().toLocaleString("id-ID");

  try {
    const { assignment_id } = req.body;

    console.log(
      `\n[${logTimestamp}] 📍 CHECK IN REQUEST | Assignment ID: ${assignment_id}`,
    );

    // Validasi input
    if (!assignment_id) {
      return res.status(400).json({
        error: "assignment_id wajib diisi",
      });
    }

    // Cek assignment ada atau tidak
    const [assignmentRows] = await db.query(
      `
              SELECT
                  ag.id,
                  ag.user_id,
                  ag.schedule_id,
                  s.title,
                  s.start_time,
                  s.end_time
              FROM assignments ag
              INNER JOIN schedules s
                  ON ag.schedule_id = s.id
              WHERE ag.id = ?
              `,
      [assignment_id],
    );

    if (assignmentRows.length === 0) {
      return res.status(404).json({
        error: "Assignment tidak ditemukan",
      });
    }

    const assignment = assignmentRows[0];

    // Cek apakah sudah check in hari ini
    const [existingAttendance] = await db.query(
      `
              SELECT *
              FROM attendances
              WHERE assignment_id = ?
              AND DATE(check_in) = CURDATE()
              `,
      [assignment_id],
    );

    if (existingAttendance.length > 0) {
      return res.status(409).json({
        error: "Staff sudah melakukan check in hari ini",
      });
    }

    // Tentukan status
    const now = new Date();
    const scheduleStart = new Date(assignment.start_time);

    let status = "present";

    if (now > scheduleStart) {
      status = "late";
    }

    // Simpan attendance
    const [insertResult] = await db.query(
      `
              INSERT INTO attendances
              (
                  assignment_id,
                  check_in,
                  status,
                  sync_status,
                  created_at
              )
              VALUES
              (
                  ?,
                  NOW(),
                  ?,
                  'synced',
                  NOW()
              )
              `,
      [assignment_id, status],
    );

    // Ambil data yang baru dibuat
    const [attendanceRows] = await db.query(
      `
              SELECT
                  id,
                  assignment_id,
                  DATE_FORMAT(check_in,'%Y-%m-%d %H:%i:%s') AS check_in,
                  DATE_FORMAT(check_out,'%Y-%m-%d %H:%i:%s') AS check_out,
                  status,
                  sync_status,
                  DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s') AS created_at
              FROM attendances
              WHERE id = ?
              `,
      [insertResult.insertId],
    );

    console.log(
      `[${logTimestamp}] ✅ Check In berhasil | Attendance ID: ${insertResult.insertId}`,
    );

    return res.status(201).json({
      success: true,
      message: "Check In berhasil",
      attendance: attendanceRows[0],
    });
  } catch (err) {
    console.error(`[${logTimestamp}] ❌ Error Check In:`, err.message);

    return res.status(500).json({
      success: false,
      error: "Gagal melakukan Check In",
      details: err.message,
    });
  }
});

//staff check out
app.put("/api/checkOut/:attendance_id", async (req, res) => {
  const attendanceId = parseInt(req.params.attendance_id);
  const logTimestamp = new Date().toLocaleString("id-ID");

  console.log(
    `\n[${logTimestamp}] 📍 CHECK OUT REQUEST | Attendance ID: ${attendanceId}`,
  );

  try {
    // Validasi ID
    if (isNaN(attendanceId)) {
      return res.status(400).json({
        success: false,
        error: "attendance_id harus berupa angka",
      });
    }

    // Cek attendance ada atau tidak
    const [attendanceRows] = await db.query(
      `
              SELECT
                  id,
                  assignment_id,
                  check_in,
                  check_out,
                  status
              FROM attendances
              WHERE id = ?
              `,
      [attendanceId],
    );

    if (attendanceRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Attendance tidak ditemukan",
      });
    }

    const attendance = attendanceRows[0];

    // Sudah checkout?
    if (attendance.check_out !== null) {
      return res.status(409).json({
        success: false,
        error: "Attendance sudah melakukan check out",
      });
    }

    // Update checkout
    await db.query(
      `
              UPDATE attendances
              SET
                  check_out = NOW(),
                  sync_status = 'synced'
              WHERE id = ?
              `,
      [attendanceId],
    );

    // Ambil data terbaru
    const [updatedRows] = await db.query(
      `
              SELECT
                  id,
                  assignment_id,
                  DATE_FORMAT(check_in,'%Y-%m-%d %H:%i:%s') AS check_in,
                  DATE_FORMAT(check_out,'%Y-%m-%d %H:%i:%s') AS check_out,
                  status,
                  sync_status,
                  DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s') AS created_at
              FROM attendances
              WHERE id = ?
              `,
      [attendanceId],
    );

    console.log(
      `[${logTimestamp}] ✅ Check Out berhasil | Attendance ID: ${attendanceId}`,
    );

    return res.status(200).json({
      success: true,
      message: "Check Out berhasil",
      attendance: updatedRows[0],
    });
  } catch (err) {
    console.error(`[${logTimestamp}] ❌ Error Check Out:`, err.message);

    return res.status(500).json({
      success: false,
      error: "Gagal melakukan Check Out",
      details: err.message,
    });
  }
});

/* =========================
   NFC MANAGEMENT
========================= */

// ENDPOINT: Menghubungkan atau Mengupdate ID NFC ke User tertentu
app.post("/api/assignNfc", async (req, res) => {
  const timestamp = new Date().toLocaleString("id-ID");
  const { user_id, nfc_uid } = req.body;

  console.log(
    `\n[${timestamp}] 💳 NFC REQUEST: Assign NFC ID [${nfc_uid}] ke User ID #${user_id}`,
  );

  if (!user_id || !nfc_uid) {
    return res
      .status(400)
      .json({ success: false, message: "User ID dan NFC UID wajib diisi!" });
  }

  try {
    // Gunakan query INSERT ... ON DUPLICATE KEY UPDATE agar jika user sudah punya NFC, otomatis terupdate
    const querySql = `
      INSERT INTO nfc_cards (user_id, nfc_uid, is_active) 
      VALUES (?, ?, 1)
      ON DUPLICATE KEY UPDATE nfc_uid = ?, updated_at = NOW()
    `;

    await db.query(querySql, [parseInt(user_id), nfc_uid, nfc_uid]);

    console.log(
      `[${timestamp}] ✅ Sukses mengikat NFC UID [${nfc_uid}] ke User ID #${user_id}`,
    );
    return res.json({
      success: true,
      message: "ID NFC berhasil dikonfigurasi pada profil user.",
      user_id: parseInt(user_id),
      nfc_uid: nfc_uid,
    });
  } catch (err) {
    console.error(
      `[${timestamp}] ❌ Database Error pada assignNfc:`,
      err.message,
    );

    // Handle jika NFC UID sudah dipakai oleh user lain (Duplicate Entry)
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        error: "Kartu atau ID NFC ini sudah terdaftar milik pengguna lain!",
      });
    }

    return res.status(500).json({
      success: false,
      error: "Gagal menyimpan data NFC: " + err.message,
    });
  }
});

// ENDPOINT: Mengambil daftar SHIFT TUGAS HARI INI khusus untuk User tertentu
app.get("/api/getTodayAssignmentsByUserId/:user_id", async (req, res) => {
  const userId = req.params.user_id;
  const logTimestamp = new Date().toLocaleString("id-ID");

  console.log(
    `\n[${logTimestamp}] 🕒 DASHBOARD HOME: Menarik Shift HARI INI untuk User ID: ${userId}`,
  );

  try {
    // Query JOIN untuk mencocokkan user_id di assignments dengan detail di schedules khusus HARI INI
    const querySql = `
      SELECT
        a.id as assignment_id,
        a.schedule_id,
        a.user_id,
        a.role_in_event,
        a.job_desc,
        s.title,
        s.description,
        DATE_FORMAT(s.start_time, '%Y-%m-%d %H:%i:%s') as start_time,
        DATE_FORMAT(s.end_time, '%Y-%m-%d %H:%i:%s') as end_time,
        s.location
      FROM assignments a
      INNER JOIN schedules s ON a.schedule_id = s.id
      WHERE a.user_id = ? 
        AND (DATE(s.start_time) = CURDATE() OR DATE(s.end_time) = CURDATE())
      ORDER BY s.start_time ASC
    `;

    const [results] = await db.query(querySql, [parseInt(userId)]);

    console.log(
      `[${logTimestamp}] 🚀 Sukses mengirimkan ${results.length} shift hari ini ke Android.`,
    );
    return res.json(results);
  } catch (err) {
    console.error(
      `[${logTimestamp}] ❌ Database Error pada getTodayAssignments:`,
      err.message,
    );
    return res.status(500).json({
      error: "Gagal memuat shift hari ini",
      details: err.message,
    });
  }
});

/* ========================================================
   REAL-TIME NFC ATTENDANCE TAP (PURE SHIFT-BASED)
======================================================== */
app.post("/api/checkInNfc", async (req, res) => {
  const logTimestamp = new Date().toLocaleString("id-ID");
  const { nfc_uid } = req.body;

  console.log(
    `\n[${logTimestamp}] ⚡ NFC SHIFT ATTENDANCE TAP | UID: ${nfc_uid}`,
  );

  if (!nfc_uid) {
    return res
      .status(400)
      .json({ success: false, message: "NFC UID wajib dikirim!" });
  }

  try {
    // 1. Cari siapa pemilik nfc_uid aktif ini
    const [nfcRows] = await db.query(
      "SELECT user_id FROM nfc_cards WHERE nfc_uid = ? AND is_active = 1",
      [nfc_uid],
    );

    if (nfcRows.length === 0) {
      console.log(
        `[${logTimestamp}] ⚠️ Tap ditolak: Kartu NFC belum terdaftar.`,
      );
      return res.status(404).json({
        success: false,
        message: "Kartu NFC tidak dikenali/belum terdaftar!",
      });
    }

    const userId = nfcRows[0].user_id;

    // 2. CARI SHIFT AKTIF: Cari assignment milik user yang jamnya COCOK dengan waktu SEKARANG
    // Toleransi: 2 Jam sebelum shift dimulai (buat check-in awal) hingga 2 jam setelah shift selesai (buat check-out telat)
    const [assignmentRows] = await db.query(
      `SELECT ag.id as assignment_id, s.title, s.start_time, s.end_time 
       FROM assignments ag
       INNER JOIN schedules s ON ag.schedule_id = s.id
       WHERE ag.user_id = ? 
         AND ag.status IN ('pending', 'accepted')
         AND NOW() >= DATE_SUB(s.start_time, INTERVAL 2 HOUR)
         AND NOW() <= DATE_ADD(s.end_time, INTERVAL 2 HOUR)
       ORDER BY s.start_time ASC 
       LIMIT 1`,
      [userId],
    );

    if (assignmentRows.length === 0) {
      console.log(
        `[${logTimestamp}] ⚠️ Tap ditolak: User ID #${userId} tidak ada jadwal shift yang aktif saat ini.`,
      );
      return res.status(404).json({
        success: false,
        message:
          "Ditolak: Anda tidak memiliki jadwal shift aktif pada jam sekarang!",
      });
    }

    const assignment = assignmentRows[0];
    const assignmentId = assignment.assignment_id;

    // 3. PERBAIKAN SHIFT: Cari absensi spesifik hanya berdasarkan assignment_id (Tanpa batasan tanggal CURDATE)
    const [attendanceRows] = await db.query(
      "SELECT id, check_in, check_out FROM attendances WHERE assignment_id = ?",
      [assignmentId],
    );

    const now = new Date();

    if (attendanceRows.length === 0) {
      // ------------------------------------------
      // JALUR A: Belum ada record untuk SHIFT INI -> Lakukan Check-In
      // ------------------------------------------
      const scheduleStart = new Date(assignment.start_time);
      const statusKehadiran = now > scheduleStart ? "late" : "present";

      await db.query(
        `INSERT INTO attendances (assignment_id, check_in, status, sync_status, created_at)
         VALUES (?, NOW(), ?, 'synced', NOW())`,
        [assignmentId, statusKehadiran],
      );

      console.log(
        `[${logTimestamp}] ✅ NFC Check-In Shift [${assignment.title}] Sukses! Status: ${statusKehadiran}`,
      );
      return res.status(201).json({
        success: true,
        message: `Check-In Shift ${assignment.title} Berhasil! (${statusKehadiran === "late" ? "Terlambat" : "Tepat Waktu"})`,
        action: "check_in",
      });
    } else {
      // ------------------------------------------
      // JALUR B: Sudah Check-In -> Lakukan Check-Out untuk SHIFT INI
      // ------------------------------------------
      const currentAttendance = attendanceRows[0];

      if (currentAttendance.check_out !== null) {
        console.log(
          `[${logTimestamp}] ⚠️ Tap diabaikan: User ID #${userId} sudah menyelesaikan shift ini.`,
        );
        return res.status(409).json({
          success: false,
          message:
            "Anda sudah menyelesaikan Check-In & Check-Out untuk shift ini!",
        });
      }

      await db.query(
        "UPDATE attendances SET check_out = NOW(), sync_status = 'synced' WHERE id = ?",
        [currentAttendance.id],
      );

      console.log(
        `[${logTimestamp}] ✅ NFC Check-Out Shift [${assignment.title}] Sukses!`,
      );
      return res.status(200).json({
        success: true,
        message: `Check-Out Shift ${assignment.title} Berhasil! Selamat beristirahat.`,
        action: "check_out",
      });
    }
  } catch (err) {
    console.error(`[${logTimestamp}] ❌ database Error:`, err.message);
    return res.status(500).json({
      success: false,
      error: "Gagal memproses absen NFC: " + err.message,
    });
  }
});

app.put("/api/users/:id/password", async (req, res) => {
    try {

        const id = req.params.id;
        const { password } = req.body;

        const hashedPassword = await bcrypt.hash(password, 10);

        await db.query(
            `
            UPDATE users
            SET password = ?
            WHERE id = ?
            `,
            [
                hashedPassword,
                id
            ]
        );

        res.json({
            success: true,
            message: "Password berhasil diperbarui."
        });

    } catch (err) {

        res.status(500).json({
            error: err.message
        });

    }
});

app.get("/api/getReplacementRequests/:company_id", async (req, res) => {

    try {

        const { company_id } = req.params;

        const [results] = await db.query(`
            SELECT
              r.id,
              r.assignment_id,
              r.reason,
              r.status,
              r.created_at,

              requester.full_name AS requester_name,
              replacement.full_name AS replacement_name,

              s.title,
              s.location,
              DATE_FORMAT(s.start_time,'%Y-%m-%d %H:%i') AS start_time,
              DATE_FORMAT(s.end_time,'%Y-%m-%d %H:%i') AS end_time

          FROM replacements r

          JOIN assignments a
          ON r.assignment_id = a.id

          JOIN schedules s
          ON a.schedule_id = s.id

          JOIN users requester
          ON requester.id = r.requested_by

          JOIN users replacement
          ON replacement.id = r.replacement_user_id

          WHERE s.company_id = ?

          ORDER BY r.created_at DESC;
        `,
        [parseInt(company_id)]);

        console.log("company_id =", company_id);

        return res.json(results);

    } catch (err) {

        console.log(err);

        return res.status(500).json({
            success: false,
            error: err.message
        });

    }

});

app.put("/api/replacements/:id/reject", async (req,res)=>{

    try{

        await db.query(
            `UPDATE replacements
             SET status='rejected'
             WHERE id=?`,
            [req.params.id]
        );

        res.json({
            success:true,
            message:"Request berhasil ditolak."
        });

    }catch(err){

        console.log(err);

        res.status(500).json({
            success:false,
            error:err.message
        });

    }

});

app.put("/api/replacements/:id/approve", async (req, res) => {

    console.log("==== APPROVE ====");
    console.log("id :", req.params.id);
    console.log("body :", req.body);

    try {

        const replacementId = req.params.id;
        const { approved_by } = req.body;

        console.log("1. sebelum SELECT");

        const [[replacement]] = await db.query(
            `SELECT * FROM replacements WHERE id=?`,
            [replacementId]
        );

        console.log("2. hasil SELECT");
        console.log(replacement);

        if (!replacement) {
            return res.status(404).json({
                success:false,
                message:"Replacement tidak ditemukan."
            });
        }

        console.log("3. sebelum update assignment");

        const [result1] = await db.query(
            `UPDATE assignments
             SET user_id=?
             WHERE id=?`,
            [
                replacement.replacement_user_id,
                replacement.assignment_id
            ]
        );

        console.log("4. update assignment");
        console.log(result1);

        console.log("5. sebelum update replacement");

        const [result2] = await db.query(
            `UPDATE replacements
             SET status='approved',
                 approved_by=?
             WHERE id=?`,
            [
                approved_by,
                replacementId
            ]
        );

        console.log("6. update replacement");
        console.log(result2);

        return res.json({
            success:true,
            message:"Replacement berhasil disetujui."
        });

    } catch(err){

        console.log("ERROR APPROVE");
        console.log(err);

        return res.status(500).json({
            success:false,
            error:err.message
        });

    }

});

app.get("/api/replacements/:id", async (req, res) => {

    const replacementId = req.params.id;

    try {

        const [results] = await db.query(

            `
            SELECT

                r.id,
                r.assignment_id,
                r.requested_by,
                r.replacement_user_id,
                r.reason,
                r.status,
                r.created_at,
                r.approved_by,

                requester.full_name AS requester_name,
                requester.email AS requester_email,

                replacement.full_name AS replacement_name,
                replacement.email AS replacement_email,

                approver.full_name AS approved_by_name,

                s.id AS schedule_id,
                s.title,
                s.description,
                s.location,

                DATE_FORMAT(s.start_time,'%Y-%m-%d %H:%i:%s') AS start_time,
                DATE_FORMAT(s.end_time,'%Y-%m-%d %H:%i:%s') AS end_time

            FROM replacements r

            JOIN assignments a
                ON a.id = r.assignment_id

            JOIN schedules s
                ON s.id = a.schedule_id

            JOIN users requester
                ON requester.id = r.requested_by

            JOIN users replacement
                ON replacement.id = r.replacement_user_id

            LEFT JOIN users approver
                ON approver.id = r.approved_by

            WHERE r.id = ?
            `,

            [replacementId]

        );

        if(results.length == 0){

            return res.status(404).json({
                success:false,
                message:"Replacement request tidak ditemukan."
            });

        }

        console.log(results[0]);

        return res.json(results[0]);

    } catch(err){

        console.log(err);

        return res.status(500).json({
            success:false,
            error:err.message
        });

    }

});

app.get("/api/replacements/user/:user_id", async (req, res) => {

    const { user_id } = req.params;

    try {

        const [results] = await db.query(

            `
            SELECT

                r.id,
                r.assignment_id,

                r.reason,

                r.status,

                r.created_at,

                requester.full_name AS requester_name,

                replacement.full_name AS replacement_name,

                approver.full_name AS approved_by_name,

                s.title,
                s.location,

                DATE_FORMAT(
                    s.start_time,
                    '%Y-%m-%d %H:%i'
                ) AS start_time,

                DATE_FORMAT(
                    s.end_time,
                    '%Y-%m-%d %H:%i'
                ) AS end_time

            FROM replacements r

            JOIN assignments a
                ON a.id = r.assignment_id

            JOIN schedules s
                ON s.id = a.schedule_id

            JOIN users requester
                ON requester.id = r.requested_by

            LEFT JOIN users replacement
                ON replacement.id = r.replacement_user_id

            LEFT JOIN users approver
                ON approver.id = r.approved_by

            WHERE r.requested_by = ?

            ORDER BY r.created_at DESC
            `,

            [user_id]

        );

        return res.json(results);

    } catch (err) {

        console.log(err);

        return res.status(500).json({

            success: false,

            error: err.message

        });

    }

});

app.get("/test", (req, res) => {
  console.log("masuk test");
  res.send("OK");
});
/* =========================
  SERVER
========================= */

const PORT = 3000;

initDb()
  .then((connection) => {
    db = connection;

    // Tambahkan '0.0.0.0' di sini agar Express mendengarkan semua interface jaringan
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running at http://0.0.0.0:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Server error:", err);
  });

module.exports = app;
