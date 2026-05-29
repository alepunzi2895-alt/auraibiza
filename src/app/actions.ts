"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";

// --- HELPERS ---
const uid = () => Math.random().toString(36).slice(2, 10);
const hashPassword = (password: string) => createHash("sha256").update(password).digest("hex");

// --- INITIALIZATION ---
export async function resetDatabase() {
  try {
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
    return await initDatabase();
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function initDatabase() {
  try {
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
    ];
    for (const sql of migrations) {
      try { await db.execute(sql); } catch (_e) {}
    }

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
      properties = await db.execute("SELECT * FROM properties");
      rooms = await db.execute("SELECT * FROM rooms");
      pricing = await db.execute("SELECT * FROM pricing");
      bookings = await db.execute("SELECT * FROM bookings ORDER BY created_at DESC");
    } else if (role === "owner" && userId) {
      properties = await db.execute({ sql: "SELECT * FROM properties WHERE owner_id = ?", args: [userId] });
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
          const collabPropsRes = await db.execute(`SELECT * FROM properties WHERE id IN (${ownerCollabPIds.map(() => '?').join(',')})`, ownerCollabPIds);
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
        properties = await db.execute(`SELECT * FROM properties WHERE id IN (${pIds.map(() => '?').join(',')})`, pIds);
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
        properties = await db.execute(`SELECT * FROM properties WHERE id IN (${allPIds.map(() => '?').join(',')})`, allPIds);
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
      sql: "INSERT INTO bookings (id, room_id, concierge_id, client_name, client_surname, start_date, end_date, notes, owner_price_total, concierge_fee, total_price, status, stay_price_total, cleaning_fee_total, guests_count, fee_mode, fee_value, asset_type, platform_fee, platform_fee_rate, agent_fee, agent_id, concierge_commission_on_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [id, data.room_id, data.concierge_id, data.client_name, data.client_surname || "", data.start_date, data.end_date, data.notes || "", data.owner_price_total, data.concierge_fee, totalPrice, "draft", data.stay_price_total || 0, data.cleaning_fee_total || 0, data.guests_count || 1, data.fee_mode || 'per_night', data.fee_value || 0, data.asset_type || 'apartment', platformFee, platformFeeRate, agentFee, agentId, conciergeCommissionOnAgent, Date.now()],
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

export async function updatePropertyAction(id: string, name: string, location: string, description: string) {
  try {
    await db.execute({ sql: "UPDATE properties SET name = ?, location = ?, description = ? WHERE id = ?", args: [name, location, description, id] });
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
    await db.execute({ sql: "UPDATE properties SET image = ? WHERE id = ?", args: [JSON.stringify(images), id] });
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
    await db.execute({ sql: "UPDATE properties SET image = ? WHERE id = ?", args: [images.length > 0 ? JSON.stringify(images) : null, id] });
    revalidatePath("/");
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

export async function addProperty(owner_id: string, name: string, location: string, description: string, assetType = 'apartment') {
  try {
    const id = `p${uid()}`;
    await db.execute({ sql: "INSERT INTO properties (id, owner_id, name, location, description, asset_type) VALUES (?, ?, ?, ?, ?, ?)", args: [id, owner_id, name, location, description || "", assetType] });
    revalidatePath("/");
    return id;
  } catch (error) { console.error(error); return ""; }
}

export async function addRoomWithPricing(propertyId: string, name: string, capacity: number, description: string) {
  try {
    const roomId = `r${uid()}`;
    await db.execute({ sql: "INSERT INTO rooms (id, property_id, name, capacity, description) VALUES (?, ?, ?, ?, ?)", args: [roomId, propertyId, name, capacity, description || ""] });

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
  } catch (error) { console.error(error); }
}

export async function updateRoomAction(roomId: string, name: string, capacity: number, description: string) {
  try {
    await db.execute({ sql: "UPDATE rooms SET name = ?, capacity = ?, description = ? WHERE id = ?", args: [name, capacity, description || "", roomId] });
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
  profile?: { firstName?: string; lastName?: string; email?: string; phone?: string; services?: string[] }
) {
  try {
    const nick = nickname.toLowerCase().trim();
    if (nick.length < 3) return { success: false, error: "Il nickname deve essere di almeno 3 caratteri." };
    if (password.length < 6) return { success: false, error: "La password deve essere di almeno 6 caratteri." };
    const existing = await db.execute({ sql: "SELECT id FROM users WHERE nickname = ?", args: [nick] });
    if (existing.rows.length > 0) return { success: false, error: "Nickname già in uso." };
    const id = `u${uid()}`;
    await db.execute({
      sql: "INSERT INTO users (id, nickname, role, password, status, first_name, last_name, email, phone, services, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [
        id, nick, role, hashPassword(password), 'pending',
        profile?.firstName || null, profile?.lastName || null,
        profile?.email || null, profile?.phone || null,
        profile?.services?.length ? JSON.stringify(profile.services) : null,
        Date.now()
      ],
    });
    revalidatePath("/");
    return { success: true, id };
  } catch (error) { return { success: false, error: String(error) }; }
}

// --- PUBLIC LISTING (no auth required) ---
export async function getPublicListings() {
  try {
    await initDatabase();
    const properties = await db.execute("SELECT id, name, location, description, image, asset_type, is_public FROM properties WHERE is_public = 1 OR is_public IS NULL ORDER BY name ASC");
    const rooms = await db.execute("SELECT id, property_id, name, capacity, image, description FROM rooms ORDER BY name ASC");
    const pricing = await db.execute("SELECT room_id, MIN(base_price) as min_price, MAX(base_price) as max_price, MIN(cleaning_fee) as cleaning_fee FROM pricing GROUP BY room_id");
    return {
      properties: properties.rows,
      rooms: rooms.rows,
      pricing: pricing.rows,
    };
  } catch (error) {
    return { properties: [], rooms: [], pricing: [], error: String(error) };
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
