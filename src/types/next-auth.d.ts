import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      nickname: string;
      role?: "admin" | "owner" | "concierge" | "agent";
      status?: string;
      managed_by?: string | null;
      created_at?: number;
      avatar?: string | null;
      isNewGoogleUser?: boolean;
      googleId?: string | null;
      email?: string | null;
      name?: string | null;
      googlePicture?: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    nickname: string;
    role: "admin" | "owner" | "concierge" | "agent";
    status?: string;
    managed_by?: string | null;
    created_at?: number;
    avatar?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    nickname?: string;
    role?: "admin" | "owner" | "concierge" | "agent";
    status?: string;
    managed_by?: string | null;
    created_at?: number;
    avatar?: string | null;
    isNewGoogleUser?: boolean;
    googleId?: string | null;
    googleEmail?: string | null;
    googleName?: string | null;
    googlePicture?: string | null;
  }
}
