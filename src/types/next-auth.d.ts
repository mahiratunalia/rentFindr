import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: "TENANT" | "LANDLORD" | "ADMIN";
      accountType?: "tenant" | "landlord";
    };
  }

  interface User {
    role: "TENANT" | "LANDLORD" | "ADMIN";
    accountType?: "tenant" | "landlord";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: "TENANT" | "LANDLORD" | "ADMIN";
    accountType?: "tenant" | "landlord";
  }
}
