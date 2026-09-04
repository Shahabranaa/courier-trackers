import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const brands = await prisma.brand.findMany({
    orderBy: [{ isActive: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      isActive: true,
      adminNotes: true,
      postexEnabled: true,
      tranzoEnabled: true,
      zoomEnabled: true,
      shopifyEnabled: true,
      apiToken: true,
      tranzoApiToken: true,
      postexMerchantId: true,
      postexMerchantToken: true,
      tranzoMerchantToken: true,
      shopifyStore: true,
      shopifyAccessToken: true,
      selectedPackage: true,
      packageRequestedAt: true,
      activatedAt: true,
      createdAt: true,
      user: {
        select: { id: true, email: true, name: true },
      },
    },
  });

  return NextResponse.json(brands);
}

export async function PATCH(req: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { brandId, isActive, postexEnabled, tranzoEnabled, zoomEnabled, shopifyEnabled, adminNotes, selectedPackage } = body;

    if (!brandId) {
      return NextResponse.json({ error: "brandId is required" }, { status: 400 });
    }

    const existing = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!existing) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    const updateData: Record<string, any> = {};

    if (typeof isActive === "boolean") {
      updateData.isActive = isActive;
      if (isActive && !existing.activatedAt) {
        updateData.activatedAt = new Date();
      }
    }
    if (typeof postexEnabled === "boolean") updateData.postexEnabled = postexEnabled;
    if (typeof tranzoEnabled === "boolean") updateData.tranzoEnabled = tranzoEnabled;
    if (typeof zoomEnabled === "boolean") updateData.zoomEnabled = zoomEnabled;
    if (typeof shopifyEnabled === "boolean") updateData.shopifyEnabled = shopifyEnabled;
    if (typeof adminNotes === "string") updateData.adminNotes = adminNotes;
    if (typeof selectedPackage === "string") updateData.selectedPackage = selectedPackage || null;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const updated = await prisma.brand.update({
      where: { id: brandId },
      data: updateData,
      select: {
        id: true,
        name: true,
        isActive: true,
        adminNotes: true,
        postexEnabled: true,
        tranzoEnabled: true,
        zoomEnabled: true,
        shopifyEnabled: true,
        apiToken: true,
        tranzoApiToken: true,
        postexMerchantId: true,
        postexMerchantToken: true,
        tranzoMerchantToken: true,
        shopifyStore: true,
        shopifyAccessToken: true,
        selectedPackage: true,
        packageRequestedAt: true,
        activatedAt: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("Update brand error:", error.message);
    return NextResponse.json({ error: "Failed to update brand" }, { status: 500 });
  }
}
