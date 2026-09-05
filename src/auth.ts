import NextAuth, { type NextAuthOptions, type User } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { compare } from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const authOptions: NextAuthOptions = {
  // @auth/prisma-adapter's Adapter type lags next-auth's own — a version-skew
  // type mismatch, not an unknown shape, so this is the one warranted cast here.
  adapter: PrismaAdapter(prisma) as NextAuthOptions["adapter"],
  secret: process.env.AUTH_SECRET ?? "baskhuji-dev-secret",
  session: { strategy: "jwt" },
  pages: { signIn: "/auth" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw): Promise<User | null> {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
          select: {
            id: true,
            name: true,
            email: true,
            passwordHash: true,
            role: true,
            profile: { select: { accountType: true } },
          },
        });

        if (!user) return null;

        const ok = await compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          name: user.name ?? user.email.split("@")[0],
          email: user.email,
          role: user.role,
          accountType: user.profile?.accountType,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.accountType = user.accountType;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id ?? "";
        session.user.role = token.role ?? "TENANT";
        session.user.accountType = token.accountType;
      }
      return session;
    },
  },
};

export default NextAuth(authOptions);
