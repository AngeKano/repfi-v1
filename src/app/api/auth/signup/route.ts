// app/api/auth/signup/route.ts
import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcrypt";
import { z } from "zod";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/prisma";
import {
  CompanyType,
  PackType,
} from "../../../../../prisma/generated/prisma/enums";

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const signUpSchema = z
  .object({
    companyName: z.string().min(2).max(100),
    companyEmail: z.string().email().toLowerCase(),
    companyType: z.nativeEnum(CompanyType),
    packType: z.nativeEnum(PackType),
    companyPhone: z.string().optional(),
    companyWebsite: z.string().url().optional().or(z.literal("")),
    companyDescription: z.string().max(1000).optional(),
    companyDenomination: z.string().max(100).optional(),
    adminEmail: z.string().email().toLowerCase(),
    adminPassword: z
      .string()
      .min(8)
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "Mot de passe faible"),
    adminPasswordConfirm: z.string(),
    adminFirstName: z.string().min(2).max(50).optional(),
    adminLastName: z.string().min(2).max(50).optional(),
  })
  .refine((data) => data.adminPassword === data.adminPasswordConfirm, {
    message: "Les mots de passe ne correspondent pas",
    path: ["adminPasswordConfirm"],
  });

async function createS3Folders(
  name: string,
  companyId: string,
  selfEntityId: string
) {
  const bucketName = process.env.AWS_S3_BUCKET_NAME!;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: `${name}_${companyId}/`,
      Body: "",
    })
  );

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: `${name}_${companyId}/${name}_${selfEntityId}/`,
      Body: "",
    })
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = signUpSchema.parse(body);

    const existingCompany = await prisma.company.findUnique({
      where: { email: data.companyEmail },
    });

    if (existingCompany) {
      return NextResponse.json(
        { error: "Cette entreprise est déjà enregistrée" },
        { status: 409 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: data.adminEmail },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Cet email est déjà utilisé" },
        { status: 409 }
      );
    }

    const hashedPassword = await hash(data.adminPassword, 12);

    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: data.companyName,
          denomination: data.companyDenomination,
          description: data.companyDescription,
          companyType: data.companyType,
          email: data.companyEmail,
          phone: data.companyPhone,
          website: data.companyWebsite,
          packType: data.packType,
        },
      });

      const admin = await tx.user.create({
        data: {
          email: data.adminEmail,
          password: hashedPassword,
          firstName: data.adminFirstName,
          lastName: data.adminLastName,
          companyId: company.id,
          role: "ADMIN_ROOT",
          isActive: true,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          createdAt: true,
        },
      });

      const selfEntity = await tx.client.create({
        data: {
          name: data.companyName,
          denomination: data.companyDenomination,
          description: data.companyDescription,
          companyType: data.companyType,
          email: data.companyEmail,
          phone: data.companyPhone,
          website: data.companyWebsite,
          companyId: company.id,
          isSelfEntity: true,
          createdById: admin.id,
        },
      });

      await createS3Folders(company.name, company.id, selfEntity.id);

      return {
        company: {
          id: company.id,
          name: company.name,
          email: company.email,
          packType: company.packType,
        },
        admin,
        selfEntity: {
          id: selfEntity.id,
          name: selfEntity.name,
        },
      };
    });

    return NextResponse.json(
      {
        success: true,
        message: "Entreprise créée avec succès",
        data: result,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Signup error:", error);

    if (error.name === "ZodError") {
      return NextResponse.json(
        {
          error: "Données invalides",
          details: error.errors,
        },
        { status: 400 }
      );
    }

    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "Email déjà utilisé" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Erreur lors de l'inscription" },
      { status: 500 }
    );
  }
}
