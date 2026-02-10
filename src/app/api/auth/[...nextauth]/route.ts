/**
 * Route NextAuth - Gère signin, signout, session
 * Endpoint: /api/auth/*
 */

import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcrypt";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        // Récupérer l'utilisateur
        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
          include: {
            company: {
              select: {
                id: true,
                name: true,
                packType: true,
              },
            },
          },
        });

        if (!user) {
          return null;
        }

        // Vérifier si actif
        if (!user.isActive) {
          return null;
        }

        // Vérifier le mot de passe
        const isValid = await compare(credentials.password, user.password);

        if (!isValid) {
          return null;
        }

        // Mettre à jour lastLoginAt
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        // Retourner l'objet utilisateur conforme au type NextAuth User
        return {
          id: user.id,
          email: user.email,
          name:
            user.firstName && user.lastName
              ? `${user.firstName} ${user.lastName}`
              : user.email,
          firstName: user.firstName ?? undefined,
          lastName: user.lastName ?? undefined,
          role: user.role,
          companyId: user.companyId,
          companyName: user.company.name,
          companyPackType: user.company.packType,
        }; // Cast required for NextAuth compatibility
      },
    }),
  ],

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 jours
  },

  pages: {
    signIn: "/auth/signin",
    signOut: "/auth/signout",
    error: "/auth/error",
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.companyId = user.companyId;
        token.companyName = user.companyName;
        token.companyPackType = user.companyPackType;
        token.firstName = user.firstName;
        token.lastName = user.lastName;
      }
      return token;
    },

    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.companyId = token.companyId as string;
        session.user.companyName = token.companyName as string;
        session.user.companyPackType = token.companyPackType as string;
        session.user.firstName = token.firstName as string;
        session.user.lastName = token.lastName as string;
      }
      return session;
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === "development",
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
