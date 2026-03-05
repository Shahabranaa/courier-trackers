import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const employees = await prisma.employee.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      brand: { select: { id: true, name: true } }
    }
  });

  return NextResponse.json(employees);
}

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { username, name, brandId } = await req.json();

    if (!username || !name || !brandId) {
      return NextResponse.json({ error: "Username, name, and brandId are required" }, { status: 400 });
    }

    const slug = slugify(username);
    if (!slug) {
      return NextResponse.json({ error: "Username must contain valid URL-safe characters" }, { status: 400 });
    }

    const existing = await prisma.employee.findUnique({ where: { username: slug } });
    if (existing) {
      return NextResponse.json({ error: "An employee with this username already exists" }, { status: 409 });
    }

    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    const employee = await prisma.employee.create({
      data: {
        username: slug,
        name,
        brandId
      },
      include: {
        brand: { select: { id: true, name: true } }
      }
    });

    return NextResponse.json(employee, { status: 201 });
  } catch (error: any) {
    console.error("Create employee error:", error.message);
    return NextResponse.json({ error: "Failed to create employee" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { id, username, name, brandId, isActive } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "Employee ID is required" }, { status: 400 });
    }

    const updateData: any = {};
    if (name) updateData.name = name;
    if (brandId) updateData.brandId = brandId;
    if (typeof isActive === "boolean") updateData.isActive = isActive;

    if (username) {
      const slug = slugify(username);
      if (!slug) {
        return NextResponse.json({ error: "Username must contain valid URL-safe characters" }, { status: 400 });
      }
      const existing = await prisma.employee.findFirst({
        where: { username: slug, id: { not: id } }
      });
      if (existing) {
        return NextResponse.json({ error: "An employee with this username already exists" }, { status: 409 });
      }
      updateData.username = slug;
    }

    if (brandId) {
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) {
        return NextResponse.json({ error: "Brand not found" }, { status: 404 });
      }
    }

    const employee = await prisma.employee.update({
      where: { id },
      data: updateData,
      include: {
        brand: { select: { id: true, name: true } }
      }
    });

    return NextResponse.json(employee);
  } catch (error: any) {
    console.error("Update employee error:", error.message);
    return NextResponse.json({ error: "Failed to update employee" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const employeeId = searchParams.get("id");

  if (!employeeId) {
    return NextResponse.json({ error: "Employee ID is required" }, { status: 400 });
  }

  try {
    await prisma.employee.delete({ where: { id: employeeId } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Delete employee error:", error.message);
    return NextResponse.json({ error: "Failed to delete employee" }, { status: 500 });
  }
}
