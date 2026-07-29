"use server";

import { db } from "@/lib/db";
import { revalidatePath, unstable_cache } from "next/cache";
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";

// Miniatura leggera (usata solo nella lista pubblica /home) generata una volta
// alla scrittura, non ad ogni lettura: evita di ritrasferire la cover a piena
// risoluzione (spesso centinaia di KB) per ogni proprietà ad ogni caricamento.
async function makeThumbnail(dataUri: string): Promise<string | null> {
  try {
    const base64 = dataUri.includes(",") ? dataUri.split(",")[1] : dataUri;
    const buf = Buffer.from(base64, "base64");
    const out = await sharp(buf).resize({ width: 320, withoutEnlargement: true }).jpeg({ quality: 55 }).toBuffer();
    return `data:image/jpeg;base64,${out.toString("base64")}`;
  } catch (_e) { return null; }
}

// --- HELPERS ---
const uid = () => Math.random().toString(36).slice(2, 10);
const hashPassword = (password: string) => createHash("sha256").update(password).digest("hex");
const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// --- INITIALIZATION ---
export async function resetDatabase(adminUserId: string) {
  try {
    // Operazione distruttiva (cancella tutte le tabelle): verifica lato server che
    // il chiamante sia davvero un admin attivo, non basta che il pulsante sia
    // nascosto nella UI — una Server Action resta raggiungibile direttamente.
    const caller = await db.execute({ sql: "SELECT role, status FROM users WHERE id = ?", args: [adminUserId] });
    const callerRow = caller.rows[0] as any;
    if (!callerRow || callerRow.role !== "admin" || callerRow.status !== "active") {
      return { success: false, error: "Non autorizzato." };
    }
    await db.execute("DROP TABLE IF EXISTS users");
    await db.execute("DROP TABLE IF EXISTS properties");
    await db.execute("DROP TABLE IF EXISTS rooms");
    await db.execute("DROP TABLE IF EXISTS pricing");
    await db.execute("DROP TABLE IF EXISTS availability");
    await db.execute("DROP TABLE IF EXISTS bookings");
    await db.execute("DROP TABLE IF EXISTS collaborations");
    await db.execute("DROP TABLE IF EXISTS payments");
    await db.execute("DROP TABLE IF EXISTS user_payment_methods");
    await db.execute("DROP TABLE IF EXISTS commission_rules");
    dbReady = false;
    return await initDatabase();
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

let dbReady = false;

export async function initDatabase() {
  try {
    if (dbReady) return { success: true };

    // `dbReady` è un flag in memoria: si azzera ad ogni cold start serverless.
    // SQLite ammette un solo writer alla volta, quindi anche lanciando le ~45
    // ALTER TABLE in parallelo dal client il server le mette comunque in coda
    // una dietro l'altra — il problema non è la latenza di rete per richiesta,
    // è rieseguirle affatto quando lo schema è già a posto. Un solo controllo
    // leggero sull'indice più recente (l'ultimo creato in ordine di tempo) ci
    // dice se tutto il resto (tabelle, colonne, altri indici) è già stato
    // applicato, ed evita l'intera batteria in quel caso.
    // IMPORTANTE: quando si aggiunge una nuova migrazione/indice in fondo agli
    // array sotto, aggiornare anche il nome dell'indice qui — altrimenti le
    // nuove migrazioni non verranno mai eseguite (il check corto-circuita
    // prima di arrivarci).
    try {
      const check = await db.execute("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_rooms_car_category'");
      if (check.rows.length > 0) {
        dbReady = true;
        return { success: true };
      }
    } catch (_e) { /* sqlite_master sempre presente: se questo fallisce, si prosegue con l'init completo */ }

    await db.batch([
      `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, nickname TEXT UNIQUE NOT NULL, role TEXT NOT NULL, password TEXT, status TEXT DEFAULT 'active', managed_by TEXT, created_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS properties (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL, location TEXT NOT NULL, description TEXT, image TEXT, asset_type TEXT DEFAULT 'apartment')`,
      `CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, property_id TEXT NOT NULL, name TEXT NOT NULL, capacity INTEGER NOT NULL, image TEXT, description TEXT)`,
      `CREATE TABLE IF NOT EXISTS pricing (id TEXT PRIMARY KEY, room_id TEXT NOT NULL, month TEXT NOT NULL, base_price INTEGER NOT NULL, cleaning_fee INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS availability (id TEXT PRIMARY KEY, room_id TEXT NOT NULL, date TEXT NOT NULL, status TEXT NOT NULL, price_snapshot TEXT)`,
      `CREATE TABLE IF NOT EXISTS bookings (id TEXT PRIMARY KEY, room_id TEXT NOT NULL, concierge_id TEXT NOT NULL, client_name TEXT NOT NULL, client_surname TEXT, start_date TEXT NOT NULL, end_date TEXT NOT NULL, notes TEXT, owner_price_total REAL NOT NULL, concierge_fee REAL NOT NULL, total_price REAL NOT NULL, status TEXT NOT NULL, stay_price_total REAL DEFAULT 0, cleaning_fee_total REAL DEFAULT 0, guests_count INTEGER DEFAULT 1, price_adjustments TEXT, fee_mode TEXT DEFAULT 'per_night', fee_value REAL DEFAULT 0, asset_type TEXT DEFAULT 'apartment', created_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS collaborations (id TEXT PRIMARY KEY, property_id TEXT NOT NULL, concierge_nickname TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, booking_id TEXT NOT NULL, type TEXT NOT NULL, amount REAL NOT NULL, payment_date TEXT NOT NULL, method TEXT NOT NULL, receiver TEXT NOT NULL, created_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS user_payment_methods (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, created_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS commission_rules (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, rate REAL NOT NULL, mode TEXT NOT NULL DEFAULT 'percentage', created_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS booking_requests (id TEXT PRIMARY KEY, property_id TEXT, room_id TEXT, client_name TEXT NOT NULL, client_email TEXT, client_phone TEXT, check_in TEXT, check_out TEXT, guests INTEGER DEFAULT 1, message TEXT, status TEXT DEFAULT 'new', created_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS platform_commissions (id TEXT PRIMARY KEY, owner_id TEXT, asset_type TEXT, rate REAL NOT NULL, created_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS agent_concierge_collabs (id TEXT PRIMARY KEY, concierge_id TEXT NOT NULL, agent_id TEXT NOT NULL, commission_rate REAL DEFAULT 0, created_at INTEGER NOT NULL)`,
    ], "write");

    // Migrations for existing tables
    const migrations = [
      "ALTER TABLE bookings ADD COLUMN stay_price_total REAL DEFAULT 0",
      "ALTER TABLE bookings ADD COLUMN cleaning_fee_total REAL DEFAULT 0",
      "ALTER TABLE bookings ADD COLUMN guests_count INTEGER DEFAULT 1",
      "ALTER TABLE bookings ADD COLUMN price_adjustments TEXT",
      "ALTER TABLE bookings ADD COLUMN fee_mode TEXT DEFAULT 'per_night'",
      "ALTER TABLE bookings ADD COLUMN fee_value REAL DEFAULT 0",
      "ALTER TABLE bookings ADD COLUMN asset_type TEXT DEFAULT 'apartment'",
      "ALTER TABLE rooms ADD COLUMN image TEXT",
      "ALTER TABLE rooms ADD COLUMN description TEXT",
      "ALTER TABLE properties ADD COLUMN description TEXT",
      "ALTER TABLE properties ADD COLUMN image TEXT",
      "ALTER TABLE properties ADD COLUMN asset_type TEXT DEFAULT 'apartment'",
      "ALTER TABLE users ADD COLUMN password TEXT",
      "ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'",
      "ALTER TABLE users ADD COLUMN managed_by TEXT",
      "ALTER TABLE users ADD COLUMN first_name TEXT",
      "ALTER TABLE users ADD COLUMN last_name TEXT",
      "ALTER TABLE users ADD COLUMN email TEXT",
      "ALTER TABLE users ADD COLUMN phone TEXT",
      "ALTER TABLE users ADD COLUMN services TEXT",
      "ALTER TABLE properties ADD COLUMN is_public INTEGER DEFAULT 1",
      "ALTER TABLE properties ADD COLUMN manages_availability INTEGER DEFAULT 0",
      "ALTER TABLE users ADD COLUMN avatar TEXT",
      "ALTER TABLE booking_requests ADD COLUMN referral_code TEXT",
      "ALTER TABLE booking_requests ADD COLUMN referral_user_id TEXT",
      "ALTER TABLE booking_requests ADD COLUMN platform_fee_rate REAL DEFAULT 0",
      "ALTER TABLE bookings ADD COLUMN platform_fee REAL DEFAULT 0",
      "ALTER TABLE bookings ADD COLUMN platform_fee_rate REAL DEFAULT 0",
      "ALTER TABLE bookings ADD COLUMN referral_user_id TEXT",
      "ALTER TABLE bookings ADD COLUMN agent_fee REAL DEFAULT 0",
      "ALTER TABLE bookings ADD COLUMN agent_id TEXT",
      "ALTER TABLE bookings ADD COLUMN concierge_commission_on_agent REAL DEFAULT 0",
      "ALTER TABLE collaborations ADD COLUMN collaborator_role TEXT DEFAULT 'concierge'",
      "ALTER TABLE properties ADD COLUMN latitude REAL",
      "ALTER TABLE properties ADD COLUMN longitude REAL",
      "ALTER TABLE properties ADD COLUMN pdf_document TEXT",
      "ALTER TABLE properties ADD COLUMN pdf_name TEXT",
      "ALTER TABLE properties ADD COLUMN cover_image TEXT",
      "ALTER TABLE rooms ADD COLUMN ical_url TEXT",
      "ALTER TABLE rooms ADD COLUMN ical_last_synced INTEGER",
      "ALTER TABLE availability ADD COLUMN blocked_source TEXT",
      "ALTER TABLE rooms ADD COLUMN bedrooms INTEGER",
      "ALTER TABLE rooms ADD COLUMN bathrooms INTEGER",
      "ALTER TABLE properties ADD COLUMN description_i18n TEXT",
      "ALTER TABLE properties ADD COLUMN thumbnail TEXT",
      "ALTER TABLE users ADD COLUMN google_id TEXT",
      "ALTER TABLE rooms ADD COLUMN car_model TEXT",
      "ALTER TABLE rooms ADD COLUMN car_category TEXT",
      "ALTER TABLE rooms ADD COLUMN airport_delivery INTEGER DEFAULT 0",
      "ALTER TABLE rooms ADD COLUMN security_deposit REAL",
      "ALTER TABLE rooms ADD COLUMN kasko_included INTEGER DEFAULT 0",
      "ALTER TABLE rooms ADD COLUMN deductible_amount REAL",
      "ALTER TABLE rooms ADD COLUMN documents_required TEXT",
      "ALTER TABLE bookings ADD COLUMN pickup_time TEXT",
      "ALTER TABLE bookings ADD COLUMN dropoff_time TEXT",
    ];
    // `dbReady` è un flag in memoria: si azzera ad ogni cold start serverless,
    // quindi queste migrazioni (quasi sempre no-op, la colonna esiste già) si
    // rieseguono ad ogni istanza fredda. In sequenza erano ~45 round-trip di
    // rete uno alla volta verso Turso — da soli potevano costare 20-45s prima
    // ancora di iniziare la query vera. In parallelo il costo è quello del
    // round-trip più lento, non la somma di tutti.
    await Promise.allSettled(migrations.map(sql => db.execute(sql)));

    // Senza questi indici, un filtro su properties.asset_type forza una scansione
    // completa che tocca anche le colonne image/cover_image (base64, multi-MB per
    // riga): una query altrimenti banale può richiedere 20-30s invece di ~100ms.
    const indexes = [
      "CREATE INDEX IF NOT EXISTS idx_properties_asset_type_id ON properties(asset_type, id)",
      "CREATE INDEX IF NOT EXISTS idx_rooms_property_id ON rooms(property_id)",
      "CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id)",
      "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)",
      "CREATE INDEX IF NOT EXISTS idx_rooms_car_category ON rooms(car_category)",
    ];
    await Promise.allSettled(indexes.map(sql => db.execute(sql)));

    const userCountRes = await db.execute("SELECT COUNT(*) as count FROM users");
    const count = (userCountRes.rows[0] as any).count;

    if (count === 0) {
      const now = Date.now();
      const seedBatch: any[] = [
        { sql: "INSERT OR IGNORE INTO users (id, nickname, role, password, status, created_at) VALUES (?, ?, ?, ?, ?, ?)", args: ['u2', 'silvia', 'owner', hashPassword('password123'), 'active', now] },
        { sql: "INSERT OR IGNORE INTO users (id, nickname, role, password, status, created_at) VALUES (?, ?, ?, ?, ?, ?)", args: ['u1', 'alessandro', 'admin', hashPassword('Gianni95.'), 'active', now] },
        { sql: "INSERT OR IGNORE INTO properties (id, owner_id, name, location, asset_type) VALUES (?, ?, ?, ?, ?)", args: ['p1', 'u2', 'La Marina Di Es Vedrà', 'Porto di Ibiza', 'apartment'] },
        { sql: "INSERT OR IGNORE INTO rooms (id, property_id, name, capacity) VALUES (?, ?, ?, ?)", args: ['r1', 'p1', 'Frangipani Room', 2] },
      ];
      await db.batch(seedBatch, "write");

      const now2 = new Date();
      const months: string[] = [];
      for (let m = now2.getMonth(); m <= 11; m++) {
        const d = new Date(now2.getFullYear(), m, 1);
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      }

      const detailBatch: any[] = [];
      for (const month of months) {
        detailBatch.push({ sql: "INSERT INTO pricing (id, room_id, month, base_price, cleaning_fee) VALUES (?, ?, ?, ?, ?)", args: [`pr${uid()}`, 'r1', month, 120, 40] });
        const [y, m] = month.split("-").map(Number);
        const lastDay = new Date(y, m, 0).getDate();
        for (let d = 1; d <= lastDay; d++) {
          const date = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          detailBatch.push({ sql: "INSERT INTO availability (id, room_id, date, status, price_snapshot) VALUES (?, ?, ?, ?, ?)", args: [`av${uid()}`, 'r1', date, 'available', '120+40'] });
        }
      }
      await db.batch(detailBatch, "write");
    }

    dbReady = true;
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("Init Error:", error);
    return { success: false, error: String(error) };
  }
}

// --- DATA FETCHING ---
export async function getDashboardData(userId?: string, role?: string) {
  try {
    await initDatabase();
    const users = await db.execute("SELECT * FROM users");
    const collaborations = await db.execute("SELECT * FROM collaborations");
    const payments = await db.execute("SELECT * FROM payments");
    const userPaymentMethods = (await db.execute("SELECT * FROM user_payment_methods ORDER BY created_at ASC")).rows;

    let properties: any, rooms: any, pricing: any, bookings: any;
    let collaboratedProperties: any[] = [], collaboratedRooms: any[] = [], collaboratedPricing: any[] = [], collaboratedBookings: any[] = [];

    if (role === "admin") {
      // Admin sees everything
      properties = await db.execute("SELECT id, owner_id, name, location, description, cover_image as image, asset_type, is_public, manages_availability, latitude, longitude, pdf_document, pdf_name, description_i18n FROM properties");
      rooms = await db.execute("SELECT * FROM rooms");
      pricing = await db.execute("SELECT * FROM pricing");
      bookings = await db.execute("SELECT * FROM bookings ORDER BY created_at DESC");
    } else if (role === "owner" && userId) {
      properties = await db.execute({ sql: "SELECT id, owner_id, name, location, description, cover_image as image, asset_type, is_public, manages_availability, latitude, longitude, pdf_document, pdf_name, description_i18n FROM properties WHERE owner_id = ?", args: [userId] });
      const pIds = properties.rows.map((p: any) => p.id);
      if (pIds.length > 0) {
        rooms = await db.execute(`SELECT * FROM rooms WHERE property_id IN (${pIds.map(() => '?').join(',')})`, pIds);
        const rIds = rooms.rows.map((r: any) => r.id);
        if (rIds.length > 0) {
          pricing = await db.execute(`SELECT * FROM pricing WHERE room_id IN (${rIds.map(() => '?').join(',')})`, rIds);
          bookings = await db.execute(`SELECT * FROM bookings WHERE room_id IN (${rIds.map(() => '?').join(',')}) ORDER BY created_at DESC`, rIds);
        }
      }
      const ownerNickRes = await db.execute({ sql: "SELECT nickname FROM users WHERE id = ?", args: [userId] });
      const ownerNick = (ownerNickRes.rows[0] as any)?.nickname;
      if (ownerNick) {
        const ownerCollabs = await db.execute({ sql: "SELECT property_id FROM collaborations WHERE concierge_nickname = ?", args: [ownerNick] });
        const ownerCollabPIds = ownerCollabs.rows.map((c: any) => c.property_id);
        if (ownerCollabPIds.length > 0) {
          const collabPropsRes = await db.execute(`SELECT id, owner_id, name, location, description, cover_image as image, asset_type, is_public, manages_availability, latitude, longitude, pdf_document, pdf_name, description_i18n FROM properties WHERE id IN (${ownerCollabPIds.map(() => '?').join(',')})`, ownerCollabPIds);
          collaboratedProperties = collabPropsRes.rows;
          const collabRoomsRes = await db.execute(`SELECT * FROM rooms WHERE property_id IN (${ownerCollabPIds.map(() => '?').join(',')})`, ownerCollabPIds);
          collaboratedRooms = collabRoomsRes.rows;
          const collabRIds = collaboratedRooms.map((r: any) => r.id);
          if (collabRIds.length > 0) {
            const collabPricingRes = await db.execute(`SELECT * FROM pricing WHERE room_id IN (${collabRIds.map(() => '?').join(',')})`, collabRIds);
            collaboratedPricing = collabPricingRes.rows;
            const collabBookingsRes = await db.execute(`SELECT * FROM bookings WHERE room_id IN (${collabRIds.map(() => '?').join(',')}) ORDER BY created_at DESC`, collabRIds);
            collaboratedBookings = collabBookingsRes.rows;
          }
        }
      }
    } else if (role === "concierge" && userId) {
      const userRes = await db.execute({ sql: "SELECT nickname FROM users WHERE id = ?", args: [userId] });
      const nick = (userRes.rows[0] as any)?.nickname;
      const collabs = await db.execute({ sql: "SELECT property_id FROM collaborations WHERE concierge_nickname = ?", args: [nick] });
      const pIds = collabs.rows.map((c: any) => c.property_id);
      if (pIds.length > 0) {
        properties = await db.execute(`SELECT id, owner_id, name, location, description, cover_image as image, asset_type, is_public, manages_availability, latitude, longitude, pdf_document, pdf_name, description_i18n FROM properties WHERE id IN (${pIds.map(() => '?').join(',')})`, pIds);
        rooms = await db.execute(`SELECT * FROM rooms WHERE property_id IN (${pIds.map(() => '?').join(',')})`, pIds);
        const rIds = rooms.rows.map((r: any) => r.id);
        if (rIds.length > 0) {
          pricing = await db.execute(`SELECT * FROM pricing WHERE room_id IN (${rIds.map(() => '?').join(',')})`, rIds);
          bookings = await db.execute(`SELECT * FROM bookings WHERE room_id IN (${rIds.map(() => '?').join(',')}) ORDER BY created_at DESC`, rIds);
        }
      }
    } else if (role === "agent" && userId) {
      // Path 1: direct collaboration (owner added agent directly)
      const userRes = await db.execute({ sql: "SELECT nickname FROM users WHERE id = ?", args: [userId] });
      const nick = (userRes.rows[0] as any)?.nickname;
      const directCollabs = await db.execute({ sql: "SELECT property_id FROM collaborations WHERE concierge_nickname = ?", args: [nick] });
      let allPIds: string[] = directCollabs.rows.map((c: any) => c.property_id as string);

      // Path 2: through concierge (concierge added agent to their team)
      const conciergeLinks = await db.execute({ sql: "SELECT concierge_id FROM agent_concierge_collabs WHERE agent_id = ?", args: [userId] });
      for (const link of conciergeLinks.rows) {
        const cId = (link as any).concierge_id;
        const cNickRes = await db.execute({ sql: "SELECT nickname FROM users WHERE id = ?", args: [cId] });
        const cNick = (cNickRes.rows[0] as any)?.nickname;
        if (cNick) {
          const cCollabs = await db.execute({ sql: "SELECT property_id FROM collaborations WHERE concierge_nickname = ?", args: [cNick] });
          cCollabs.rows.forEach((c: any) => { if (!allPIds.includes(c.property_id)) allPIds.push(c.property_id); });
        }
      }

      if (allPIds.length > 0) {
        properties = await db.execute(`SELECT id, owner_id, name, location, description, cover_image as image, asset_type, is_public, manages_availability, latitude, longitude, pdf_document, pdf_name, description_i18n FROM properties WHERE id IN (${allPIds.map(() => '?').join(',')})`, allPIds);
        rooms = await db.execute(`SELECT * FROM rooms WHERE property_id IN (${allPIds.map(() => '?').join(',')})`, allPIds);
        const rIds = rooms.rows.map((r: any) => r.id);
        if (rIds.length > 0) {
          pricing = await db.execute(`SELECT * FROM pricing WHERE room_id IN (${rIds.map(() => '?').join(',')})`, rIds);
          bookings = await db.execute(`SELECT * FROM bookings WHERE (room_id IN (${rIds.map(() => '?').join(',')}) AND agent_id = ?) OR (room_id IN (${rIds.map(() => '?').join(',')}) AND concierge_id = ?) ORDER BY created_at DESC`, [...rIds, userId, ...rIds, userId]);
        }
      }
    }

    const pendingUsers = (await db.execute("SELECT * FROM users WHERE status = 'pending' ORDER BY created_at DESC")).rows;
    const commissionRules = (await db.execute("SELECT * FROM commission_rules")).rows;
    const agentConciergeCollabs = (await db.execute("SELECT acc.*, u_a.nickname as agent_nickname, u_c.nickname as concierge_nickname FROM agent_concierge_collabs acc LEFT JOIN users u_a ON acc.agent_id = u_a.id LEFT JOIN users u_c ON acc.concierge_id = u_c.id")).rows;

    return {
      users: users.rows,
      properties: properties?.rows || [],
      rooms: rooms?.rows || [],
      pricing: pricing?.rows || [],
      bookings: bookings?.rows || [],
      collaborations: collaborations.rows,
      payments: payments.rows,
      userPaymentMethods,
      collaboratedProperties,
      collaboratedRooms,
      collaboratedPricing,
      collaboratedBookings,
      pendingUsers,
      commissionRules,
      agentConciergeCollabs,
    };
  } catch (error: any) {
    console.error("Dashboard Data Error:", error);
    if (error.message?.includes("no such table")) {
      return { users: [], properties: [], rooms: [], pricing: [], bookings: [], collaborations: [], payments: [], pendingUsers: [], commissionRules: [] };
    }
    return { _error: error.message || String(error) };
  }
}

export async function getRoomAvailability(roomId: string, month: string) {
  const avail = await db.execute({ sql: "SELECT * FROM availability WHERE room_id = ? AND date LIKE ?", args: [roomId, `${month}%`] });
  return avail.rows;
}

export async function loginOrRegister(nickname: string, password?: string) {
  const nick = nickname.toLowerCase().trim();
  const existing = await db.execute({ sql: "SELECT * FROM users WHERE nickname = ?", args: [nick] });
  if (existing.rows.length > 0) {
    const user = existing.rows[0] as any;
    if (user.status === 'pending') return { error: "Account in attesa di approvazione da parte dell'admin." };
    if (user.password && password) {
      if (user.password !== hashPassword(password)) return { error: "Password errata." };
    } else if (user.password && !password) {
      return { error: "Password richiesta." };
    }
    return user;
  }
  return { error: "Utente non trovato nel database." };
}

// --- ADMIN ACTIONS ---
export async function approveUser(userId: string) {
  try {
    await db.execute({ sql: "UPDATE users SET status = 'active' WHERE id = ?", args: [userId] });
    revalidatePath("/");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

export async function rejectUser(userId: string) {
  try {
    await db.execute({ sql: "DELETE FROM users WHERE id = ? AND status = 'pending'", args: [userId] });
    revalidatePath("/");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

export async function updateUserRole(userId: string, role: string) {
  try {
    await db.execute({ sql: "UPDATE users SET role = ? WHERE id = ?", args: [role, userId] });
    revalidatePath("/");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

export async function deleteUserAction(userId: string) {
  try {
    await db.execute({ sql: "DELETE FROM users WHERE id = ?", args: [userId] });
    revalidatePath("/");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

export async function setCommissionRule(userId: string, rate: number, mode: string) {
  try {
    const existing = await db.execute({ sql: "SELECT id FROM commission_rules WHERE user_id = ?", args: [userId] });
    if (existing.rows.length > 0) {
      await db.execute({ sql: "UPDATE commission_rules SET rate = ?, mode = ? WHERE user_id = ?", args: [rate, mode, userId] });
    } else {
      await db.execute({ sql: "INSERT INTO commission_rules (id, user_id, rate, mode, created_at) VALUES (?, ?, ?, ?, ?)", args: [uid(), userId, rate, mode, Date.now()] });
    }
    revalidatePath("/");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

// --- MUTATIONS ---
export async function createBooking(data: any) {
  try {
    const id = `b${uid()}`;

    // 1. Auto-lookup platform commission rate (from owner+asset_type)
    let platformFeeRate = 0;
    let platformFee = 0;
    let ownerId = "";
    try {
      const roomRes = await db.execute({ sql: "SELECT property_id FROM rooms WHERE id = ?", args: [data.room_id] });
      if (roomRes.rows.length > 0) {
        const propId = (roomRes.rows[0] as any).property_id;
        const propRes = await db.execute({ sql: "SELECT owner_id, asset_type FROM properties WHERE id = ?", args: [propId] });
        if (propRes.rows.length > 0) {
          const prop = propRes.rows[0] as any;
          ownerId = prop.owner_id;
          platformFeeRate = await getEffectiveCommissionRate(prop.owner_id, prop.asset_type);
          platformFee = Math.round((data.owner_price_total || 0) * platformFeeRate / 100 * 100) / 100;
        }
      }
    } catch (_e) {}

    // 2. Agent fee + concierge commission on agent
    const agentFee = data.agent_fee || 0;
    const agentId = data.agent_id || null;
    let conciergeCommissionOnAgent = 0;
    if (agentId && data.concierge_id) {
      try {
        const collabRes = await db.execute({ sql: "SELECT commission_rate FROM agent_concierge_collabs WHERE concierge_id = ? AND agent_id = ?", args: [data.concierge_id, agentId] });
        if (collabRes.rows.length > 0) {
          const rate = (collabRes.rows[0] as any).commission_rate || 0;
          conciergeCommissionOnAgent = Math.round(agentFee * rate / 100 * 100) / 100;
        }
      } catch (_e) {}
    }

    // 3. total = owner_price + concierge_fee + agent_fee (platform fee hidden from client)
    const totalPrice = (data.owner_price_total || 0) + (data.concierge_fee || 0) + agentFee;

    await db.execute({
      sql: "INSERT INTO bookings (id, room_id, concierge_id, client_name, client_surname, start_date, end_date, notes, owner_price_total, concierge_fee, total_price, status, stay_price_total, cleaning_fee_total, guests_count, fee_mode, fee_value, asset_type, platform_fee, platform_fee_rate, agent_fee, agent_id, concierge_commission_on_agent, pickup_time, dropoff_time, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [id, data.room_id, data.concierge_id, data.client_name, data.client_surname || "", data.start_date, data.end_date, data.notes || "", data.owner_price_total, data.concierge_fee, totalPrice, "draft", data.stay_price_total || 0, data.cleaning_fee_total || 0, data.guests_count || 1, data.fee_mode || 'per_night', data.fee_value || 0, data.asset_type || 'apartment', platformFee, platformFeeRate, agentFee, agentId, conciergeCommissionOnAgent, data.pickup_time || null, data.dropoff_time || null, Date.now()],
    });
    revalidatePath("/");
    return { id };
  } catch (error) { return { id: "", error: String(error) }; }
}

// Calculate full cascade split (pure function, no DB)
export async function calcCascadeSplit(ownerPriceTotal: number, platformFeeRate: number, conciergeFee: number, agentFee: number, conciergeCommissionOnAgent: number) {
  const platformFee = Math.round(ownerPriceTotal * platformFeeRate / 100 * 100) / 100;
  const ownerNet = Math.round((ownerPriceTotal - platformFee) * 100) / 100;
  const conciergeNet = Math.round((conciergeFee + conciergeCommissionOnAgent) * 100) / 100;
  const agentNet = Math.round((agentFee - conciergeCommissionOnAgent) * 100) / 100;
  const totalClient = ownerPriceTotal + conciergeFee + agentFee;
  return { platformFee, ownerNet, conciergeNet, agentNet, totalClient };
}

export async function updateBookingStatus(id: string, status: string) {
  try {
    await db.execute({ sql: "UPDATE bookings SET status = ? WHERE id = ?", args: [status, id] });
    revalidatePath("/");
  } catch (error) { console.error(error); }
}

export async function deleteBookingAction(id: string) {
  try {
    await db.execute({ sql: "DELETE FROM payments WHERE booking_id = ?", args: [id] });
    await db.execute({ sql: "DELETE FROM bookings WHERE id = ?", args: [id] });
    revalidatePath("/");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

export async function submitPaymentProposal(bookingId: string, payments: any[]) {
  try {
    await db.execute({ sql: "DELETE FROM payments WHERE booking_id = ?", args: [bookingId] });
    for (const p of payments) {
      await db.execute({
        sql: "INSERT INTO payments (id, booking_id, type, amount, payment_date, method, receiver, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        args: [uid(), bookingId, p.type, p.amount, p.date || new Date().toLocaleDateString('en-CA'), p.method || "", p.receiver, Date.now()],
      });
    }
    await db.execute({ sql: "UPDATE bookings SET status = 'payment_submitted' WHERE id = ?", args: [bookingId] });
    revalidatePath("/");
  } catch (error) { console.error(error); }
}

export async function confirmPaymentAndBlock(bookingId: string, userId: string, confirmData?: { date: string; method: string }) {
  try {
    if (confirmData) {
      await db.execute({
        sql: "UPDATE payments SET payment_date = ?, method = ? WHERE booking_id = ? AND method = '' AND receiver = ?",
        args: [confirmData.date, confirmData.method, bookingId, userId],
      });
    }
    await db.execute({ sql: "UPDATE bookings SET status = 'confirmed_owner' WHERE id = ?", args: [bookingId] });
    revalidatePath("/");
  } catch (error) { console.error(error); }
}

export async function recordFinalBalance(bookingId: string, p: any, _storno?: any) {
  try {
    await db.execute({
      sql: "INSERT INTO payments (id, booking_id, type, amount, payment_date, method, receiver, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      args: [uid(), bookingId, 'saldo_owner', p.amount, p.date, p.method || "", p.receiver || "owner", Date.now()],
    });
    await db.execute({ sql: "UPDATE bookings SET status = 'evaso' WHERE id = ?", args: [bookingId] });
    revalidatePath("/");
  } catch (error) { console.error(error); }
}

export async function updatePropertyAction(id: string, name: string, location: string, description: string, latitude?: number | null, longitude?: number | null) {
  try {
    await db.execute({ sql: "UPDATE properties SET name = ?, location = ?, description = ?, latitude = ?, longitude = ? WHERE id = ?", args: [name, location, description, latitude ?? null, longitude ?? null, id] });
    revalidatePath("/");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

export async function updatePropertyAssetType(id: string, assetType: string) {
  try {
    await db.execute({ sql: "UPDATE properties SET asset_type = ? WHERE id = ?", args: [assetType, id] });
    revalidatePath("/");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

export async function updatePropertyImage(id: string, base64: string) {
  try {
    const existing = await db.execute({ sql: "SELECT image FROM properties WHERE id = ?", args: [id] });
    const current = (existing.rows[0] as any)?.image;
    let images: string[] = [];
    if (current) {
      try { images = current.startsWith('[') ? JSON.parse(current) : [current]; } catch (_e) { images = [current]; }
    }
    images.push(base64);
    const thumbnail = await makeThumbnail(images[0]);
    await db.execute({ sql: "UPDATE properties SET image = ?, cover_image = ?, thumbnail = ? WHERE id = ?", args: [JSON.stringify(images), images[0], thumbnail, id] });
    revalidatePath("/");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

export async function removePropertyImage(id: string, index: number) {
  try {
    const existing = await db.execute({ sql: "SELECT image FROM properties WHERE id = ?", args: [id] });
    const current = (existing.rows[0] as any)?.image;
    let images: string[] = [];
    if (current) {
      try { images = current.startsWith('[') ? JSON.parse(current) : [current]; } catch (_e) { images = [current]; }
    }
    images.splice(index, 1);
    const thumbnail = images[0] ? await makeThumbnail(images[0]) : null;
    await db.execute({ sql: "UPDATE properties SET image = ?, cover_image = ?, thumbnail = ? WHERE id = ?", args: [images.length > 0 ? JSON.stringify(images) : null, images[0] || null, thumbnail, id] });
    revalidatePath("/");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

export async function addProperty(owner_id: string, name: string, location: string, description: string, assetType = 'apartment', latitude?: number | null, longitude?: number | null) {
  try {
    const id = `p${uid()}`;
    await db.execute({ sql: "INSERT INTO properties (id, owner_id, name, location, description, asset_type, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", args: [id, owner_id, name, location, description || "", assetType, latitude ?? null, longitude ?? null] });
    revalidatePath("/");
    return id;
  } catch (error) { console.error(error); return ""; }
}

export async function updatePropertyPdf(id: string, base64: string, fileName: string) {
  try {
    await db.execute({ sql: "UPDATE properties SET pdf_document = ?, pdf_name = ? WHERE id = ?", args: [base64, fileName, id] });
    revalidatePath("/");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

export async function removePropertyPdf(id: string) {
  try {
    await db.execute({ sql: "UPDATE properties SET pdf_document = NULL, pdf_name = NULL WHERE id = ?", args: [id] });
    revalidatePath("/");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

export async function getPropertyPdf(id: string) {
  try {
    const res = await db.execute({ sql: "SELECT pdf_document, pdf_name FROM properties WHERE id = ?", args: [id] });
    const row = res.rows[0] as any;
    return { pdf_document: row?.pdf_document || null, pdf_name: row?.pdf_name || null };
  } catch (error) { return { pdf_document: null, pdf_name: null, error: String(error) }; }
}

export async function addRoomWithPricing(propertyId: string, name: string, capacity: number, description: string, carFields?: {
  carModel?: string; carCategory?: string; airportDelivery?: boolean;
  securityDeposit?: number; kaskoIncluded?: boolean; deductibleAmount?: number; documentsRequired?: string;
}) {
  try {
    const roomId = `r${uid()}`;
    if (carFields) {
      await db.execute({
        sql: "INSERT INTO rooms (id, property_id, name, capacity, description, car_model, car_category, airport_delivery, security_deposit, kasko_included, deductible_amount, documents_required) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: [
          roomId, propertyId, name, capacity, description || "",
          carFields.carModel || null, carFields.carCategory || null,
          carFields.airportDelivery ? 1 : 0, carFields.securityDeposit ?? null,
          carFields.kaskoIncluded ? 1 : 0, carFields.deductibleAmount ?? null,
          carFields.documentsRequired || null,
        ],
      });
    } else {
      await db.execute({ sql: "INSERT INTO rooms (id, property_id, name, capacity, description) VALUES (?, ?, ?, ?, ?)", args: [roomId, propertyId, name, capacity, description || ""] });
    }

    const now = new Date();
    const months: string[] = [];
    for (let m = now.getMonth(); m <= 11; m++) {
      const d = new Date(now.getFullYear(), m, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }

    for (const month of months) {
      const pricingId = `pr${uid()}`;
      await db.execute({ sql: "INSERT INTO pricing (id, room_id, month, base_price, cleaning_fee) VALUES (?, ?, ?, ?, ?)", args: [pricingId, roomId, month, 100, 30] });
      const [y, m] = month.split("-").map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const avBatch: any[] = [];
      for (let d = 1; d <= lastDay; d++) {
        const date = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        avBatch.push({ sql: "INSERT INTO availability (id, room_id, date, status, price_snapshot) VALUES (?, ?, ?, ?, ?)", args: [`av${uid()}`, roomId, date, 'available', '100+30'] });
      }
      if (avBatch.length > 0) await db.batch(avBatch, "write");
    }
    revalidatePath("/");
    return roomId;
  } catch (error) { console.error(error); return ""; }
}

export async function updateRoomAction(roomId: string, fields: {
  name: string; capacity: number; description: string;
  bedrooms?: number | null; bathrooms?: number | null;
  carModel?: string | null; carCategory?: string | null; airportDelivery?: boolean;
  securityDeposit?: number | null; kaskoIncluded?: boolean;
  deductibleAmount?: number | null; documentsRequired?: string | null;
}) {
  try {
    await db.execute({
      sql: "UPDATE rooms SET name = ?, capacity = ?, description = ?, bedrooms = ?, bathrooms = ?, car_model = ?, car_category = ?, airport_delivery = ?, security_deposit = ?, kasko_included = ?, deductible_amount = ?, documents_required = ? WHERE id = ?",
      args: [
        fields.name, fields.capacity, fields.description || "",
        fields.bedrooms ?? null, fields.bathrooms ?? null,
        fields.carModel ?? null, fields.carCategory ?? null, fields.airportDelivery ? 1 : 0,
        fields.securityDeposit ?? null, fields.kaskoIncluded ? 1 : 0,
        fields.deductibleAmount ?? null, fields.documentsRequired ?? null,
        roomId,
      ],
    });
    revalidatePath("/");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

export async function updateRoomImage(roomId: string, base64: string) {
  try {
    const existing = await db.execute({ sql: "SELECT image FROM rooms WHERE id = ?", args: [roomId] });
    const current = (existing.rows[0] as any)?.image;
    let images: string[] = [];
    if (current) {
      try { images = current.startsWith('[') ? JSON.parse(current) : [current]; } catch (_e) { images = [current]; }
    }
    images.push(base64);
    await db.execute({ sql: "UPDATE rooms SET image = ? WHERE id = ?", args: [JSON.stringify(images), roomId] });
    revalidatePath("/");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

export async function removeRoomImage(roomId: string, index: number) {
  try {
    const existing = await db.execute({ sql: "SELECT image FROM rooms WHERE id = ?", args: [roomId] });
    const current = (existing.rows[0] as any)?.image;
    let images: string[] = [];
    if (current) {
      try { images = current.startsWith('[') ? JSON.parse(current) : [current]; } catch (_e) { images = [current]; }
    }
    images.splice(index, 1);
    await db.execute({ sql: "UPDATE rooms SET image = ? WHERE id = ?", args: [images.length > 0 ? JSON.stringify(images) : null, roomId] });
    revalidatePath("/");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

export async function addCollaboration(propertyId: string, nickname: string) {
  try {
    const nick = nickname.toLowerCase().trim();
    const userRes = await db.execute({ sql: "SELECT id, status, role FROM users WHERE nickname = ?", args: [nick] });
    if (userRes.rows.length === 0) return { success: false, error: `Utente "${nick}" non trovato.` };
    const u = userRes.rows[0] as any;
    if (u.status === 'pending') return { success: false, error: `L'utente "${nick}" non è ancora stato approvato dall'admin.` };
    if (!['concierge', 'agent', 'owner'].includes(u.role)) return { success: false, error: `L'utente "${nick}" non può collaborare (ruolo: ${u.role}).` };
    const existing = await db.execute({ sql: "SELECT id FROM collaborations WHERE property_id = ? AND concierge_nickname = ?", args: [propertyId, nick] });
    if (existing.rows.length > 0) return { success: false, error: "Collaboratore già presente." };
    await db.execute({ sql: "INSERT INTO collaborations (id, property_id, concierge_nickname, collaborator_role) VALUES (?, ?, ?, ?)", args: [uid(), propertyId, nick, u.role] });
    revalidatePath("/");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

// --- AGENT-CONCIERGE COLLABORATIONS ---

export async function addAgentToConcierge(conciergeId: string, agentNickname: string, commissionRate: number) {
  try {
    const nick = agentNickname.toLowerCase().trim();
    const agentRes = await db.execute({ sql: "SELECT id, status, role FROM users WHERE nickname = ?", args: [nick] });
    if (agentRes.rows.length === 0) return { success: false, error: `Agente "${nick}" non trovato.` };
    const agent = agentRes.rows[0] as any;
    if (agent.status === 'pending') return { success: false, error: `L'agente "${nick}" non è ancora stato approvato.` };
    if (agent.role !== 'agent') return { success: false, error: `"${nick}" non ha il ruolo agente (ruolo attuale: ${agent.role}).` };
    const existing = await db.execute({ sql: "SELECT id FROM agent_concierge_collabs WHERE concierge_id = ? AND agent_id = ?", args: [conciergeId, agent.id] });
    if (existing.rows.length > 0) return { success: false, error: "Agente già presente nel tuo team." };
    await db.execute({ sql: "INSERT INTO agent_concierge_collabs (id, concierge_id, agent_id, commission_rate, created_at) VALUES (?, ?, ?, ?, ?)", args: [uid(), conciergeId, agent.id, commissionRate, Date.now()] });
    revalidatePath("/platform");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

export async function removeAgentFromConcierge(id: string) {
  try {
    await db.execute({ sql: "DELETE FROM agent_concierge_collabs WHERE id = ?", args: [id] });
    revalidatePath("/platform");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

export async function updateAgentCommissionRate(id: string, rate: number) {
  try {
    await db.execute({ sql: "UPDATE agent_concierge_collabs SET commission_rate = ? WHERE id = ?", args: [rate, id] });
    revalidatePath("/platform");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

export async function removeCollaboration(id: string) {
  try {
    await db.execute({ sql: "DELETE FROM collaborations WHERE id = ?", args: [id] });
    revalidatePath("/");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

export async function updatePricingAction(roomId: string, month: string, basePrice: number, cleaningFee: number) {
  try {
    await db.execute({ sql: "UPDATE pricing SET base_price = ?, cleaning_fee = ? WHERE room_id = ? AND month = ?", args: [basePrice, cleaningFee, roomId, month] });
    await db.execute({ sql: "UPDATE availability SET price_snapshot = ? WHERE room_id = ? AND date LIKE ?", args: [`${basePrice}+${cleaningFee}`, roomId, `${month}%`] });
    revalidatePath("/");
  } catch (error) { console.error(error); }
}

export async function toggleAvailabilityAction(roomId: string, date: string, currentStatus: string) {
  try {
    const newStatus = currentStatus === 'available' ? 'blocked' : 'available';
    const existing = await db.execute({ sql: "SELECT id FROM availability WHERE room_id = ? AND date = ?", args: [roomId, date] });
    if (existing.rows.length > 0) {
      await db.execute({ sql: "UPDATE availability SET status = ? WHERE room_id = ? AND date = ?", args: [newStatus, roomId, date] });
    } else {
      await db.execute({ sql: "INSERT INTO availability (id, room_id, date, status, price_snapshot) VALUES (?, ?, ?, ?, ?)", args: [uid(), roomId, date, newStatus, "0+0"] });
    }
    revalidatePath("/");
    return { success: true, newStatus };
  } catch (error) { return { success: false, error: String(error), newStatus: currentStatus }; }
}

export async function batchUpdateAvailabilityAction(roomId: string, updates: Record<string, string>) {
  try {
    for (const [date, status] of Object.entries(updates)) {
      const existing = await db.execute({ sql: "SELECT id FROM availability WHERE room_id = ? AND date = ?", args: [roomId, date] });
      if (existing.rows.length > 0) {
        await db.execute({ sql: "UPDATE availability SET status = ? WHERE room_id = ? AND date = ?", args: [status, roomId, date] });
      } else {
        await db.execute({ sql: "INSERT INTO availability (id, room_id, date, status, price_snapshot) VALUES (?, ?, ?, ?, ?)", args: [uid(), roomId, date, status, "0+0"] });
      }
    }
    revalidatePath("/");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

// --- ICAL SYNC ---
// Estrae le coppie DTSTART/DTEND da ogni VEVENT di un feed .ics (gestisce sia date
// intere "VALUE=DATE:20260715" che date-time "20260715T140000Z", ne basta il prefisso YYYYMMDD).
function parseICSEvents(icsText: string): { start: string; end: string }[] {
  const events: { start: string; end: string }[] = [];
  const toIsoDate = (raw: string) => {
    const m = raw.match(/(\d{4})(\d{2})(\d{2})/);
    if (!m) return null;
    return `${m[1]}-${m[2]}-${m[3]}`;
  };
  const veventBlocks = icsText.split("BEGIN:VEVENT").slice(1);
  for (const block of veventBlocks) {
    const dtStartMatch = block.match(/DTSTART[^:\r\n]*:([^\r\n]+)/);
    const dtEndMatch = block.match(/DTEND[^:\r\n]*:([^\r\n]+)/);
    if (!dtStartMatch || !dtEndMatch) continue;
    const start = toIsoDate(dtStartMatch[1]);
    const end = toIsoDate(dtEndMatch[1]);
    if (start && end) events.push({ start, end });
  }
  return events;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function setRoomIcalUrl(roomId: string, icalUrl: string) {
  try {
    const url = icalUrl.trim() || null;
    await db.execute({ sql: "UPDATE rooms SET ical_url = ? WHERE id = ?", args: [url, roomId] });
    if (url) {
      // un URL iCal configurato implica calendario disponibilità live in vetrina
      await db.execute({ sql: "UPDATE properties SET manages_availability = 1 WHERE id = (SELECT property_id FROM rooms WHERE id = ?)", args: [roomId] });
    }
    revalidatePath("/");
    revalidatePath("/platform");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

export async function syncRoomIcal(roomId: string) {
  try {
    const roomRes = await db.execute({ sql: "SELECT ical_url FROM rooms WHERE id = ?", args: [roomId] });
    const icalUrl = (roomRes.rows[0] as any)?.ical_url as string | undefined;
    if (!icalUrl) return { success: false, error: "Nessun URL iCal configurato per questa unità." };

    const res = await fetch(icalUrl, { cache: "no-store" });
    if (!res.ok) return { success: false, error: `Impossibile scaricare il calendario (HTTP ${res.status})` };
    const icsText = await res.text();
    const events = parseICSEvents(icsText);

    // Libera le date precedentemente bloccate da un sync iCal (non tocca blocchi manuali o prenotazioni interne)
    await db.execute({ sql: "UPDATE availability SET status = 'available', blocked_source = NULL WHERE room_id = ? AND blocked_source = 'ical'", args: [roomId] });

    let blockedCount = 0;
    for (const ev of events) {
      let d = ev.start;
      while (d < ev.end) { // DTEND è esclusivo (giorno di check-out)
        const existing = await db.execute({ sql: "SELECT id, status FROM availability WHERE room_id = ? AND date = ?", args: [roomId, d] });
        if (existing.rows.length > 0) {
          await db.execute({ sql: "UPDATE availability SET status = 'blocked', blocked_source = 'ical' WHERE room_id = ? AND date = ?", args: [roomId, d] });
        } else {
          await db.execute({ sql: "INSERT INTO availability (id, room_id, date, status, price_snapshot, blocked_source) VALUES (?, ?, ?, 'blocked', '0+0', 'ical')", args: [uid(), roomId, d] });
        }
        blockedCount++;
        d = addDaysIso(d, 1);
      }
    }

    await db.execute({ sql: "UPDATE rooms SET ical_last_synced = ? WHERE id = ?", args: [Date.now(), roomId] });
    revalidatePath("/");
    revalidatePath("/platform");
    return { success: true, eventsFound: events.length, datesBlocked: blockedCount };
  } catch (error) { return { success: false, error: String(error) }; }
}

export async function createManagedUser(nickname: string, role: "owner" | "concierge" | "agent", firstName?: string, lastName?: string) {
  try {
    const nick = nickname.toLowerCase().trim();
    const existing = await db.execute({ sql: "SELECT id FROM users WHERE nickname = ?", args: [nick] });
    if (existing.rows.length > 0) return { success: true, id: (existing.rows[0] as any).id, alreadyExisted: true };
    const id = `u${uid()}`;
    await db.execute({
      sql: "INSERT INTO users (id, nickname, role, status, first_name, last_name, created_at) VALUES (?, ?, ?, 'active', ?, ?, ?)",
      args: [id, nick, role, firstName || "", lastName || "", Date.now()],
    });
    revalidatePath("/");
    return { success: true, id, alreadyExisted: false };
  } catch (error) { return { success: false, error: String(error), id: "" }; }
}

export async function bulkSetRoomPricing(roomId: string, monthly: { month: string; basePrice: number; cleaningFee: number }[]) {
  try {
    for (const { month, basePrice, cleaningFee } of monthly) {
      const existing = await db.execute({ sql: "SELECT id FROM pricing WHERE room_id = ? AND month = ?", args: [roomId, month] });
      if (existing.rows.length > 0) {
        await db.execute({ sql: "UPDATE pricing SET base_price = ?, cleaning_fee = ? WHERE room_id = ? AND month = ?", args: [basePrice, cleaningFee, roomId, month] });
      } else {
        await db.execute({ sql: "INSERT INTO pricing (id, room_id, month, base_price, cleaning_fee) VALUES (?, ?, ?, ?, ?)", args: [`pr${uid()}`, roomId, month, basePrice, cleaningFee] });
      }
      const [y, m] = month.split("-").map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const avBatch: any[] = [];
      for (let d = 1; d <= lastDay; d++) {
        const date = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const existingAv = await db.execute({ sql: "SELECT id FROM availability WHERE room_id = ? AND date = ?", args: [roomId, date] });
        if (existingAv.rows.length > 0) {
          avBatch.push({ sql: "UPDATE availability SET price_snapshot = ? WHERE room_id = ? AND date = ?", args: [`${basePrice}+${cleaningFee}`, roomId, date] });
        } else {
          avBatch.push({ sql: "INSERT INTO availability (id, room_id, date, status, price_snapshot) VALUES (?, ?, ?, 'available', ?)", args: [`av${uid()}`, roomId, date, `${basePrice}+${cleaningFee}`] });
        }
      }
      if (avBatch.length > 0) await db.batch(avBatch, "write");
    }
    revalidatePath("/");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

export async function addPricingMonthAction(roomId: string, month: string, basePrice: number, cleaningFee: number) {
  try {
    const existing = await db.execute({ sql: "SELECT id FROM pricing WHERE room_id = ? AND month = ?", args: [roomId, month] });
    if (existing.rows.length > 0) return { success: false, error: "Mese già presente nel listino." };
    await db.execute({ sql: "INSERT INTO pricing (id, room_id, month, base_price, cleaning_fee) VALUES (?, ?, ?, ?, ?)", args: [`pr${uid()}`, roomId, month, basePrice, cleaningFee] });
    const [y, m] = month.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const avBatch: any[] = [];
    for (let d = 1; d <= lastDay; d++) {
      const date = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const existingAv = await db.execute({ sql: "SELECT id FROM availability WHERE room_id = ? AND date = ?", args: [roomId, date] });
      if (existingAv.rows.length === 0) {
        avBatch.push({ sql: "INSERT INTO availability (id, room_id, date, status, price_snapshot) VALUES (?, ?, ?, ?, ?)", args: [`av${uid()}`, roomId, date, 'available', `${basePrice}+${cleaningFee}`] });
      }
    }
    if (avBatch.length > 0) await db.batch(avBatch, "write");
    revalidatePath("/");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

export async function updateBookingPriceAdjustment(bookingId: string, adjustments: Record<string, number>, newFee?: number) {
  try {
    const bookingRes = await db.execute({ sql: "SELECT * FROM bookings WHERE id = ?", args: [bookingId] });
    if (bookingRes.rows.length === 0) return { success: false, error: "Prenotazione non trovata." };
    const booking = bookingRes.rows[0] as any;
    const adjTotal = Object.values(adjustments).reduce((s: number, v) => s + (v as number), 0);
    const newOwnerPrice = booking.stay_price_total + booking.cleaning_fee_total + adjTotal;
    const fee = newFee !== undefined ? newFee : booking.concierge_fee;
    const newTotal = newOwnerPrice + fee;
    await db.execute({
      sql: "UPDATE bookings SET price_adjustments = ?, owner_price_total = ?, concierge_fee = ?, total_price = ? WHERE id = ?",
      args: [JSON.stringify(adjustments), newOwnerPrice, fee, newTotal, bookingId],
    });
    revalidatePath("/");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

export async function addPaymentMethod(userId: string, name: string) {
  try {
    await db.execute({ sql: "INSERT INTO user_payment_methods (id, user_id, name, created_at) VALUES (?, ?, ?, ?)", args: [uid(), userId, name, Date.now()] });
    revalidatePath("/");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

export async function changePasswordAction(userId: string, currentPassword: string, newPassword: string) {
  try {
    const userRes = await db.execute({ sql: "SELECT password FROM users WHERE id = ?", args: [userId] });
    if (userRes.rows.length === 0) return { error: "Utente non trovato." };
    const user = userRes.rows[0] as any;
    if (user.password && user.password !== hashPassword(currentPassword)) return { error: "Password attuale non corretta." };
    if (newPassword.length < 6) return { error: "La nuova password deve essere di almeno 6 caratteri." };
    await db.execute({ sql: "UPDATE users SET password = ? WHERE id = ?", args: [hashPassword(newPassword), userId] });
    revalidatePath("/");
    return { success: true };
  } catch (error) { return { error: String(error) }; }
}

export async function deletePaymentMethod(id: string) {
  try {
    await db.execute({ sql: "DELETE FROM user_payment_methods WHERE id = ?", args: [id] });
    revalidatePath("/");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

export async function deleteRoomAction(roomId: string) {
  try {
    await db.execute({ sql: "DELETE FROM availability WHERE room_id = ?", args: [roomId] });
    await db.execute({ sql: "DELETE FROM pricing WHERE room_id = ?", args: [roomId] });
    const bookingsRes = await db.execute({ sql: "SELECT id FROM bookings WHERE room_id = ?", args: [roomId] });
    for (const b of bookingsRes.rows) {
      await db.execute({ sql: "DELETE FROM payments WHERE booking_id = ?", args: [(b as any).id] });
    }
    await db.execute({ sql: "DELETE FROM bookings WHERE room_id = ?", args: [roomId] });
    await db.execute({ sql: "DELETE FROM rooms WHERE id = ?", args: [roomId] });
    revalidatePath("/");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

export async function deletePropertyAction(propertyId: string) {
  try {
    const roomsRes = await db.execute({ sql: "SELECT id FROM rooms WHERE property_id = ?", args: [propertyId] });
    for (const r of roomsRes.rows) {
      await deleteRoomAction((r as any).id);
    }
    await db.execute({ sql: "DELETE FROM collaborations WHERE property_id = ?", args: [propertyId] });
    await db.execute({ sql: "DELETE FROM properties WHERE id = ?", args: [propertyId] });
    revalidatePath("/");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

export async function registerUser(
  nickname: string,
  password: string,
  role: "owner" | "concierge" | "agent" = "concierge",
  profile?: { firstName?: string; lastName?: string; email?: string; phone?: string; services?: string[]; avatar?: string }
) {
  try {
    const nick = nickname.toLowerCase().trim();
    if (nick.length < 3) return { success: false, error: "Il nickname deve essere di almeno 3 caratteri." };
    if (password.length < 6) return { success: false, error: "La password deve essere di almeno 6 caratteri." };
    const email = profile?.email?.trim().toLowerCase() || "";
    if (!email) return { success: false, error: "L'email è obbligatoria." };
    if (!isValidEmail(email)) return { success: false, error: "Email non valida." };
    const existing = await db.execute({ sql: "SELECT id FROM users WHERE nickname = ?", args: [nick] });
    if (existing.rows.length > 0) return { success: false, error: "Nickname già in uso." };
    const existingEmail = await db.execute({ sql: "SELECT id FROM users WHERE email = ?", args: [email] });
    if (existingEmail.rows.length > 0) return { success: false, error: "Email già in uso." };
    const id = `u${uid()}`;
    await db.execute({
      sql: "INSERT INTO users (id, nickname, role, password, status, first_name, last_name, email, phone, services, avatar, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [
        id, nick, role, hashPassword(password), 'pending',
        profile?.firstName || null, profile?.lastName || null,
        email, profile?.phone || null,
        profile?.services?.length ? JSON.stringify(profile.services) : null,
        profile?.avatar || null,
        Date.now()
      ],
    });
    revalidatePath("/");
    return { success: true, id };
  } catch (error) { return { success: false, error: String(error) }; }
}

// Registrazione avviata da Google: stesso comportamento di registerUser (status
// 'pending', in attesa di approvazione admin) ma senza password — l'utente
// autentica sempre via Google, come i profili creati da un admin (password NULL).
export async function completeGoogleRegistration(
  googleId: string,
  email: string,
  nickname: string,
  role: "owner" | "concierge" | "agent",
  profile?: { firstName?: string; lastName?: string; phone?: string; services?: string[]; avatar?: string }
) {
  try {
    const nick = nickname.toLowerCase().trim();
    if (nick.length < 3) return { success: false, error: "Il nickname deve essere di almeno 3 caratteri." };
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !isValidEmail(cleanEmail)) return { success: false, error: "Email non valida." };
    const existingNick = await db.execute({ sql: "SELECT id FROM users WHERE nickname = ?", args: [nick] });
    if (existingNick.rows.length > 0) return { success: false, error: "Nickname già in uso." };
    const existingEmail = await db.execute({ sql: "SELECT id FROM users WHERE email = ?", args: [cleanEmail] });
    if (existingEmail.rows.length > 0) return { success: false, error: "Email già in uso." };
    const existingGoogle = await db.execute({ sql: "SELECT id FROM users WHERE google_id = ?", args: [googleId] });
    if (existingGoogle.rows.length > 0) return { success: false, error: "Account Google già registrato." };
    const id = `u${uid()}`;
    await db.execute({
      sql: "INSERT INTO users (id, nickname, role, status, first_name, last_name, email, phone, services, avatar, google_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [
        id, nick, role, 'pending',
        profile?.firstName || null, profile?.lastName || null,
        cleanEmail, profile?.phone || null,
        profile?.services?.length ? JSON.stringify(profile.services) : null,
        profile?.avatar || null,
        googleId,
        Date.now()
      ],
    });
    revalidatePath("/");
    return { success: true, id };
  } catch (error) { return { success: false, error: String(error) }; }
}

// --- PUBLIC LISTING (no auth required) ---
// Caso pubblico standard (nessun referral): risultato quasi identico ad ogni
// richiesta, quindi lo teniamo in cache per qualche secondo così le visite
// ripetute non generano nemmeno una query verso Turso. Le mutazioni (admin/owner)
// restano visibili al più entro questa finestra, un compromesso ragionevole
// per una vetrina pubblica a basso tasso di modifica.
// La lista pubblica NON porta più le immagini: la home mostra solo 6 asset
// per pagina, quindi il frontend chiede le thumbnail via getPropertyThumbnails()
// solo per gli id effettivamente visibili nella pagina corrente, invece di
// scaricarle tutte in anticipo per ogni proprietà del catalogo.
const getCachedPublicListings = unstable_cache(
  async () => {
    const propertiesSQL = "SELECT id, name, location, description, description_i18n, asset_type, is_public, manages_availability, latitude, longitude, CASE WHEN pdf_document IS NOT NULL THEN 1 ELSE 0 END as has_pdf FROM properties WHERE is_public = 1 ORDER BY name ASC";
    const [properties, rooms, pricing] = await Promise.all([
      db.execute(propertiesSQL),
      db.execute("SELECT id, property_id, name, capacity, description, bedrooms, bathrooms, car_model, car_category, airport_delivery, security_deposit, kasko_included, deductible_amount, documents_required FROM rooms ORDER BY name ASC"),
      db.execute("SELECT room_id, MIN(base_price) as min_price, MAX(base_price) as max_price, MIN(cleaning_fee) as cleaning_fee FROM pricing GROUP BY room_id"),
    ]);
    return { properties: properties.rows, rooms: rooms.rows, pricing: pricing.rows };
  },
  ["public-listings"],
  { revalidate: 30 }
);

// Turso impiega ~1-1.7s PER RIGA quando una colonna TEXT di dimensioni non
// banali (qui: thumbnail) viene letta in una scansione multi-riga — anche
// dopo aver ridotto le thumbnail a poche decine di KB e aver indicizzato ogni
// filtro coinvolto. Fetch paralleli riga-per-riga sulla singola PK, invece,
// restano ~90ms l'uno indipendentemente da quante righe servono in totale.
export async function getPropertyThumbnails(ids: string[]): Promise<Record<string, string | null>> {
  try {
    const results = await Promise.all(
      ids.map(id => db.execute({ sql: "SELECT thumbnail FROM properties WHERE id = ?", args: [id] }))
    );
    const map: Record<string, string | null> = {};
    ids.forEach((id, i) => { map[id] = (results[i].rows[0] as any)?.thumbnail || null; });
    return map;
  } catch (_error) {
    return {};
  }
}

// Foto di copertina a piena qualità: la griglia mostra prima la thumbnail
// leggera (getPropertyThumbnails) e sostituisce l'immagine con questa non
// appena l'utente resta sulla pagina qualche istante, senza rallentare il
// primo caricamento.
export async function getPropertyCoverImages(ids: string[]): Promise<Record<string, string | null>> {
  try {
    const results = await Promise.all(
      ids.map(id => db.execute({ sql: "SELECT cover_image FROM properties WHERE id = ?", args: [id] }))
    );
    const map: Record<string, string | null> = {};
    ids.forEach((id, i) => { map[id] = (results[i].rows[0] as any)?.cover_image || null; });
    return map;
  } catch (_error) {
    return {};
  }
}

export async function getPublicListings(referralCode?: string) {
  try {
    await initDatabase();
    // Se il referral è valido (utente attivo), mostra anche asset privati
    let showAll = false;
    if (referralCode) {
      const refUser = await db.execute({ sql: "SELECT id FROM users WHERE nickname = ? AND status = 'active'", args: [referralCode.toLowerCase().trim()] });
      showAll = refUser.rows.length > 0;
    }

    if (!showAll) {
      const cached = await getCachedPublicListings();
      return { ...cached, referralValid: false };
    }

    // Le immagini si caricano a parte via getPropertyThumbnails(), solo per gli id
    // visibili nella pagina corrente (vedi il commento su getCachedPublicListings).
    const propertiesSQL = "SELECT id, name, location, description, description_i18n, asset_type, is_public, manages_availability, latitude, longitude, CASE WHEN pdf_document IS NOT NULL THEN 1 ELSE 0 END as has_pdf FROM properties ORDER BY name ASC";
    // Query indipendenti lanciate in parallelo invece che in sequenza: il costo
    // è quello della più lenta delle tre, non la somma dei tre round-trip.
    const [properties, rooms, pricing] = await Promise.all([
      db.execute(propertiesSQL),
      db.execute("SELECT id, property_id, name, capacity, description, bedrooms, bathrooms, car_model, car_category, airport_delivery, security_deposit, kasko_included, deductible_amount, documents_required FROM rooms ORDER BY name ASC"),
      db.execute("SELECT room_id, MIN(base_price) as min_price, MAX(base_price) as max_price, MIN(cleaning_fee) as cleaning_fee FROM pricing GROUP BY room_id"),
    ]);
    return {
      properties: properties.rows,
      rooms: rooms.rows,
      pricing: pricing.rows,
      referralValid: showAll,
    };
  } catch (error) {
    return { properties: [], rooms: [], pricing: [], referralValid: false, error: String(error) };
  }
}

export async function getPropertyGallery(propertyId: string) {
  try {
    const res = await db.execute({ sql: "SELECT image FROM properties WHERE id = ?", args: [propertyId] });
    return { image: (res.rows[0] as any)?.image as string | undefined };
  } catch (error) {
    return { image: undefined, error: String(error) };
  }
}

export async function togglePropertyPublic(propertyId: string, isPublic: boolean) {
  try {
    await db.execute({ sql: "UPDATE properties SET is_public = ? WHERE id = ?", args: [isPublic ? 1 : 0, propertyId] });
    revalidatePath("/");
    revalidatePath("/platform");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

export async function togglePropertyManagesAvailability(propertyId: string, manages: boolean) {
  try {
    await db.execute({ sql: "UPDATE properties SET manages_availability = ? WHERE id = ?", args: [manages ? 1 : 0, propertyId] });
    revalidatePath("/");
    revalidatePath("/platform");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

export async function getPublicRoomAvailability(roomId: string, month: string) {
  try {
    const avail = await db.execute({ sql: "SELECT date, status FROM availability WHERE room_id = ? AND date LIKE ?", args: [roomId, `${month}%`] });
    // Fetch confirmed bookings to mark as occupied
    const bookings = await db.execute({ sql: "SELECT start_date, end_date FROM bookings WHERE room_id = ? AND status IN ('confirmed_owner','evaso','payment_submitted') AND start_date LIKE ? OR end_date LIKE ?", args: [roomId, `${month}%`, `${month}%`] });
    return { availability: avail.rows, bookings: bookings.rows };
  } catch (error) { return { availability: [], bookings: [] }; }
}

export async function createBookingRequest(data: {
  propertyId?: string; roomId?: string;
  clientName: string; clientEmail?: string; clientPhone?: string;
  checkIn?: string; checkOut?: string; guests?: number; message?: string;
  referralCode?: string;
}) {
  try {
    // Resolve referral code → user id
    let referralUserId: string | null = null;
    if (data.referralCode) {
      const ref = await db.execute({ sql: "SELECT id FROM users WHERE nickname = ? AND status = 'active'", args: [data.referralCode.toLowerCase().trim()] });
      if (ref.rows.length > 0) referralUserId = (ref.rows[0] as any).id;
    }
    // Resolve commission rate for this property
    let platformFeeRate = 0;
    if (data.propertyId) {
      const propRes = await db.execute({ sql: "SELECT owner_id, asset_type FROM properties WHERE id = ?", args: [data.propertyId] });
      if (propRes.rows.length > 0) {
        const { owner_id, asset_type } = propRes.rows[0] as any;
        platformFeeRate = await getEffectiveCommissionRate(owner_id, asset_type);
      }
    }
    await db.execute({
      sql: "INSERT INTO booking_requests (id, property_id, room_id, client_name, client_email, client_phone, check_in, check_out, guests, message, status, referral_code, referral_user_id, platform_fee_rate, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?)",
      args: [uid(), data.propertyId || null, data.roomId || null, data.clientName, data.clientEmail || null, data.clientPhone || null, data.checkIn || null, data.checkOut || null, data.guests || 1, data.message || null, data.referralCode || null, referralUserId, platformFeeRate, Date.now()],
    });
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

export async function getBookingRequests() {
  try {
    const res = await db.execute("SELECT br.*, p.name as property_name, r.name as room_name FROM booking_requests br LEFT JOIN properties p ON br.property_id = p.id LEFT JOIN rooms r ON br.room_id = r.id ORDER BY br.created_at DESC");
    return res.rows;
  } catch (error) { return []; }
}

export async function updateBookingRequestStatus(id: string, status: string) {
  try {
    await db.execute({ sql: "UPDATE booking_requests SET status = ? WHERE id = ?", args: [status, id] });
    revalidatePath("/platform");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

// --- PLATFORM COMMISSIONS ---

export async function getEffectiveCommissionRate(ownerId: string, assetType: string): Promise<number> {
  try {
    // Priority: owner+type > owner only > type only > global default
    const checks = [
      { sql: "SELECT rate FROM platform_commissions WHERE owner_id = ? AND asset_type = ? LIMIT 1", args: [ownerId, assetType] },
      { sql: "SELECT rate FROM platform_commissions WHERE owner_id = ? AND asset_type IS NULL LIMIT 1", args: [ownerId] },
      { sql: "SELECT rate FROM platform_commissions WHERE owner_id IS NULL AND asset_type = ? LIMIT 1", args: [assetType] },
      { sql: "SELECT rate FROM platform_commissions WHERE owner_id IS NULL AND asset_type IS NULL LIMIT 1", args: [] },
    ];
    for (const check of checks) {
      const res = await db.execute(check as any);
      if (res.rows.length > 0) return (res.rows[0] as any).rate as number;
    }
    return 0;
  } catch { return 0; }
}

export async function getPlatformCommissions() {
  try {
    const res = await db.execute(`
      SELECT pc.*, u.nickname as owner_nickname
      FROM platform_commissions pc
      LEFT JOIN users u ON pc.owner_id = u.id
      ORDER BY pc.owner_id IS NULL, pc.asset_type IS NULL, u.nickname
    `);
    return res.rows;
  } catch { return []; }
}

export async function upsertPlatformCommission(ownerId: string | null, assetType: string | null, rate: number) {
  try {
    const existing = await db.execute({
      sql: "SELECT id FROM platform_commissions WHERE (owner_id IS ? OR (owner_id IS NULL AND ? IS NULL)) AND (asset_type IS ? OR (asset_type IS NULL AND ? IS NULL))",
      args: [ownerId, ownerId, assetType, assetType],
    });
    if (existing.rows.length > 0) {
      await db.execute({ sql: "UPDATE platform_commissions SET rate = ? WHERE id = ?", args: [rate, (existing.rows[0] as any).id] });
    } else {
      await db.execute({ sql: "INSERT INTO platform_commissions (id, owner_id, asset_type, rate, created_at) VALUES (?, ?, ?, ?, ?)", args: [uid(), ownerId, assetType, rate, Date.now()] });
    }
    revalidatePath("/platform");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

export async function deletePlatformCommission(id: string) {
  try {
    await db.execute({ sql: "DELETE FROM platform_commissions WHERE id = ?", args: [id] });
    revalidatePath("/platform");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

export async function updateBookingPlatformFee(bookingId: string, platformFee: number, platformFeeRate: number) {
  try {
    await db.execute({ sql: "UPDATE bookings SET platform_fee = ?, platform_fee_rate = ? WHERE id = ?", args: [platformFee, platformFeeRate, bookingId] });
    revalidatePath("/platform");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

// --- PUBLIC BOOKING ASSISTANT ---
// Ricerca reale su disponibilità/prezzi (mai inventata dal modello): usata sia
// direttamente sia come tool eseguito da chatBookingAssistant.
const ASSISTANT_CATEGORY_TYPES: Record<string, string[]> = {
  residenze: ["apartment", "villa"],
  marine: ["boat"],
  mobilita: ["car", "scooter"],
};

export async function searchAvailability(filters: {
  checkIn?: string; checkOut?: string; guests?: number; category?: string; query?: string;
}) {
  try {
    await initDatabase();
    const types = filters.category && filters.category !== "all" ? ASSISTANT_CATEGORY_TYPES[filters.category] : null;

    let sql = `
      SELECT p.id as property_id, p.name as property_name, p.location, p.asset_type,
             r.id as room_id, r.name as room_name, r.capacity, r.bedrooms, r.bathrooms
      FROM properties p
      JOIN rooms r ON r.property_id = p.id
      WHERE (p.is_public = 1 OR p.is_public IS NULL)
    `;
    const args: any[] = [];
    if (types) {
      sql += ` AND p.asset_type IN (${types.map(() => "?").join(",")})`;
      args.push(...types);
    }
    if (filters.guests) {
      sql += ` AND r.capacity >= ?`;
      args.push(filters.guests);
    }
    if (filters.query && filters.query.trim()) {
      const q = `%${filters.query.trim()}%`;
      sql += ` AND (p.name LIKE ? OR p.location LIKE ?)`;
      args.push(q, q);
    }
    sql += ` LIMIT 40`;

    const candidates = await db.execute({ sql, args });
    let rows = candidates.rows as any[];
    if (rows.length === 0) return { results: [], totalMatches: 0 };

    if (filters.checkIn && filters.checkOut) {
      const roomIds = rows.map(r => r.room_id);
      const placeholders = roomIds.map(() => "?").join(",");

      const blocked = await db.execute({
        sql: `SELECT DISTINCT room_id FROM availability WHERE room_id IN (${placeholders}) AND date >= ? AND date < ? AND status = 'blocked'`,
        args: [...roomIds, filters.checkIn, filters.checkOut],
      });
      const blockedSet = new Set((blocked.rows as any[]).map(r => r.room_id));

      const overlapping = await db.execute({
        sql: `SELECT DISTINCT room_id FROM bookings WHERE room_id IN (${placeholders}) AND status IN ('confirmed_owner','evaso','payment_submitted') AND NOT (end_date <= ? OR start_date >= ?)`,
        args: [...roomIds, filters.checkIn, filters.checkOut],
      });
      const overlapSet = new Set((overlapping.rows as any[]).map(r => r.room_id));

      rows = rows.filter(r => !blockedSet.has(r.room_id) && !overlapSet.has(r.room_id));
    }

    if (rows.length === 0) return { results: [], totalMatches: 0 };

    const remainingRoomIds = rows.map(r => r.room_id);
    const phPricing = remainingRoomIds.map(() => "?").join(",");
    const pricingRows = await db.execute({
      sql: `SELECT room_id, month, base_price, cleaning_fee FROM pricing WHERE room_id IN (${phPricing})`,
      args: remainingRoomIds,
    });
    const pricingByRoom: Record<string, { month: string; base_price: number; cleaning_fee: number }[]> = {};
    for (const p of pricingRows.rows as any[]) {
      (pricingByRoom[p.room_id] ||= []).push(p);
    }

    const results = rows.slice(0, 8).map(r => {
      const prices = pricingByRoom[r.room_id] || [];
      let nights: number | null = null;
      let totalStay: number | null = null;
      let cleaningFee: number | null = null;
      let pricePerNight: number | null = null;

      if (filters.checkIn && filters.checkOut && prices.length > 0) {
        const [sy, sm, sd] = filters.checkIn.split("-").map(Number);
        const [ey, em, ed] = filters.checkOut.split("-").map(Number);
        const start = Date.UTC(sy, sm - 1, sd);
        const end = Date.UTC(ey, em - 1, ed);
        nights = Math.round((end - start) / 86400000);
        let sum = 0;
        for (let t = start; t < end; t += 86400000) {
          const d = new Date(t);
          const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
          const match = prices.find(p => p.month === month);
          sum += match ? match.base_price : prices[0].base_price;
        }
        totalStay = Math.round(sum);
        cleaningFee = prices[0].cleaning_fee || 0;
        pricePerNight = nights ? Math.round(sum / nights) : null;
      } else if (prices.length > 0) {
        pricePerNight = Math.min(...prices.map(p => p.base_price));
      }

      return {
        propertyId: r.property_id,
        propertyName: r.property_name,
        location: r.location,
        assetType: r.asset_type,
        roomId: r.room_id,
        roomName: r.room_name,
        capacity: r.capacity,
        pricePerNight,
        nights,
        totalStay,
        cleaningFee,
        totalWithCleaning: totalStay !== null && cleaningFee !== null ? Math.round(totalStay + cleaningFee) : null,
        checkIn: filters.checkIn || null,
        checkOut: filters.checkOut || null,
      };
    });

    return { results, totalMatches: rows.length };
  } catch (error) {
    return { results: [], totalMatches: 0, error: String(error) };
  }
}

const ASSISTANT_TOOL: Anthropic.Tool = {
  name: "search_availability",
  description:
    "Cerca alloggi/mezzi REALMENTE disponibili sulla piattaforma Aura Ibiza (Ibiza), in base a date, numero di ospiti, categoria e testo libero. Usa SEMPRE questo strumento prima di affermare che qualcosa è disponibile o di indicare un prezzo — non inventare mai disponibilità, prezzi o nomi di proprietà. Se l'utente non specifica le date, chiama comunque lo strumento omettendo checkIn/checkOut per vedere cosa esiste in generale.",
  input_schema: {
    type: "object",
    properties: {
      checkIn: { type: "string", description: "Data di check-in in formato YYYY-MM-DD. Ometti se non specificata." },
      checkOut: { type: "string", description: "Data di check-out in formato YYYY-MM-DD. Ometti se non specificata." },
      guests: { type: "integer", description: "Numero di ospiti/persone richiesto." },
      category: { type: "string", enum: ["residenze", "marine", "mobilita", "all"], description: "residenze = appartamenti/ville, marine = barche, mobilita = auto/scooter, all = tutte le categorie." },
      query: { type: "string", description: "OMETTI questo campo a meno che l'utente non abbia nominato ESPLICITAMENTE un luogo o una proprietà specifica (es. 'Santa Eularia', 'Ibiza Town', 'Chill Out'). È una ricerca per sottostringa esatta su nome/località: una singola parola generica come 'appartamento' o una frase inventata dal modello NON deve mai essere usata qui, altrimenti azzera risultati altrimenti validi. Guests/category/date bastano da soli per la maggior parte delle richieste." },
    },
  },
};

export async function chatBookingAssistant(
  history: { role: "user" | "assistant"; text: string }[],
  lang: string
) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return { success: false, text: "", matches: [] as any[], error: "ANTHROPIC_API_KEY non configurata." };
    }
    const client = new Anthropic();
    const today = new Date().toISOString().slice(0, 10);

    const systemPrompt = `Sei l'assistente di ricerca di Aura Ibiza, piattaforma di prenotazione di ville, appartamenti, barche, auto e scooter a Ibiza.
Oggi è ${today}. Rispondi SEMPRE nella lingua con codice "${lang}" (en/it/es/de/fr).
Usa SEMPRE lo strumento search_availability per verificare disponibilità e prezzi reali prima di rispondere — non inventare mai numeri, nomi o disponibilità.
Se una prima ricerca restituisce zero risultati e avevi usato il campo "query", riprova SUBITO una seconda volta omettendo "query" prima di concludere che non c'è disponibilità: un testo di ricerca troppo specifico può azzerare risultati validi.
Se dopo aver riprovato non ci sono comunque risultati, dillo chiaramente e suggerisci di allargare i criteri (date, categoria, ospiti).
Sii breve e cordiale. Non elencare tu stesso i dettagli di ogni struttura trovata (l'interfaccia mostra già delle schede con foto e prezzo per ogni risultato) — limitati a un breve commento e a invitare l'utente a scegliere un'opzione qui sotto per procedere con la richiesta di prenotazione.`;

    const messages: Anthropic.MessageParam[] = history.map(h => ({ role: h.role, content: h.text }));

    let matches: any[] = [];
    let finalText = "";

    for (let turn = 0; turn < 4; turn++) {
      const response = await client.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 1024,
        system: systemPrompt,
        tools: [ASSISTANT_TOOL],
        messages,
      });

      const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
      if (textBlocks.length > 0) finalText = textBlocks.map(b => b.text).join("\n");

      if (toolUses.length === 0 || response.stop_reason !== "tool_use") break;

      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const result = await searchAvailability(tu.input as any);
        if (result.results) matches = result.results;
        toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(result) });
      }
      messages.push({ role: "user", content: toolResults });
    }

    return { success: true, text: finalText, matches };
  } catch (error) {
    return { success: false, text: "", matches: [] as any[], error: String(error) };
  }
}
