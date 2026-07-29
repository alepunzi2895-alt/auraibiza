import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { db } from "@/lib/db";
import { loginOrRegister } from "@/app/actions";

// Nessun database adapter: la tabella `users` esistente resta l'unica fonte di
// verità (usata da centinaia di punti nel codice). Il collegamento
// account Google <-> utente locale si fa a mano nei callback sotto, contro
// la stessa tabella già usata da loginOrRegister/registerUser.
export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  // Reindirizza qui (invece della pagina di errore NextAuth di default,
  // fuori dal design del sito) sia gli errori Google OAuth generici sia il
  // redirect "account in attesa di approvazione" impostato nel signIn callback.
  pages: { error: "/platform" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        nickname: { label: "Nickname", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const res = await loginOrRegister(credentials?.nickname || "", credentials?.password);
        if ((res as any).error) throw new Error((res as any).error);
        const u = res as any;
        return {
          id: u.id,
          nickname: u.nickname,
          role: u.role,
          status: u.status,
          managed_by: u.managed_by,
          created_at: u.created_at,
          avatar: u.avatar,
        } as any;
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true;

      const googleId = account.providerAccountId;
      const email = (profile as any)?.email?.toLowerCase().trim() || null;

      let row: any = null;
      if (googleId) {
        const r = await db.execute({ sql: "SELECT * FROM users WHERE google_id = ?", args: [googleId] });
        if (r.rows.length > 0) row = r.rows[0];
      }
      if (!row && email) {
        const r = await db.execute({
          sql: "SELECT * FROM users WHERE email = ? AND google_id IS NULL ORDER BY created_at ASC LIMIT 1",
          args: [email],
        });
        if (r.rows.length > 0) {
          row = r.rows[0];
          await db.execute({ sql: "UPDATE users SET google_id = ? WHERE id = ?", args: [googleId, row.id] });
        }
      }

      if (row) {
        if (row.status === "pending") return "/platform?error=pending";
        Object.assign(user, {
          id: row.id,
          nickname: row.nickname,
          role: row.role,
          status: row.status,
          managed_by: row.managed_by,
          created_at: row.created_at,
          avatar: row.avatar,
          isNewGoogleUser: false,
        });
        return true;
      }

      // Nessuna corrispondenza: identità Google nuova, nessuna riga creata finché
      // l'utente non completa il wizard (ruolo + dati) — sessione transitoria.
      Object.assign(user, {
        id: googleId,
        nickname: "",
        role: undefined,
        status: undefined,
        isNewGoogleUser: true,
        googleId,
        googleEmail: email,
        googleName: (profile as any)?.name || null,
        googlePicture: (profile as any)?.picture || null,
      });
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        const u = user as any;
        token.id = u.id;
        token.nickname = u.nickname;
        token.role = u.role;
        token.status = u.status;
        token.managed_by = u.managed_by;
        token.created_at = u.created_at;
        token.avatar = u.avatar;
        token.isNewGoogleUser = !!u.isNewGoogleUser;
        token.googleId = u.googleId || null;
        token.googleEmail = u.googleEmail || null;
        token.googleName = u.googleName || null;
        token.googlePicture = u.googlePicture || null;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        ...session.user,
        id: token.id || "",
        nickname: token.nickname || "",
        role: token.role,
        status: token.status,
        managed_by: token.managed_by,
        created_at: token.created_at,
        avatar: token.avatar,
        isNewGoogleUser: token.isNewGoogleUser,
        googleId: token.googleId,
        email: token.googleEmail,
        name: token.googleName,
        googlePicture: token.googlePicture,
      } as any;
      return session;
    },
  },
};
