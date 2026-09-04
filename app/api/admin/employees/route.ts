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

function serializeEmployee(emp: any) {
  const accessBrands = (emp.brandAccess || [])
    .map((ba: any) => ba.brand)
    .filter((b: any) => b && b.id !== emp.brandId);

  const allBrands = [
    { id: emp.brand.id, name: emp.brand.name },
    ...accessBrands.map((b: any) => ({ id: b.id, name: b.name })),
  ];

  return {
    id: emp.id,
    username: emp.username,
    name: emp.name,
    brandId: emp.brandId,
    brandName: emp.brand.name,
    brands: allBrands,
    additionalBrandIds: accessBrands.map((b: any) => b.id),
    isActive: emp.isActive,
    createdAt: emp.createdAt,
  };
}

export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const employees = await prisma.employee.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      brand: { select: { id: true, name: true } },
      brandAccess: {
        include: { brand: { select: { id: true, name: true } } },
      },
    },
  });

  return NextResponse.json(employees.map(serializeEmployee));
}

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { username, name, brandId, additionalBrandIds } = await req.json();

    if (!username || !name || !brandId) {
      return NextResponse.json(
        { error: "Username, name, and brandId are required" },
        { status: 400 }
      );
    }

    const slug = slugify(username);
    if (!slug) {
      return NextResponse.json(
        { error: "Username must contain valid URL-safe characters" },
        { status: 400 }
      );
    }

    const existing = await prisma.employee.findUnique({ where: { username: slug } });
    if (existing) {
      return NextResponse.json(
        { error: "An employee with this username already exists" },
        { status: 409 }
      );
    }

    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    const extraIds: string[] = Array.isArray(additionalBrandIds)
      ? Array.from(new Set(additionalBrandIds.filter((id: string) => id && id !== brandId)))
      : [];

    if (extraIds.length > 0) {
      const found = await prisma.brand.findMany({
        where: { id: { in: extraIds } },
        select: { id: true },
      });
      if (found.length !== extraIds.length) {
        return NextResponse.json(
          { error: "One or more additional brands were not found" },
          { status: 404 }
        );
      }
    }

    const employee = await prisma.employee.create({
      data: {
        username: slug,
        name,
        brandId,
        brandAccess: {
          create: extraIds.map((bId) => ({ brandId: bId })),
        },
      },
      include: {
        brand: { select: { id: true, name: true } },
        brandAccess: {
          include: { brand: { select: { id: true, name: true } } },
        },
      },
    });

    return NextResponse.json(serializeEmployee(employee), { status: 201 });
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
    const { id, username, name, brandId, isActive, additionalBrandIds } = await req.json();
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
        return NextResponse.json(
          { error: "Username must contain valid URL-safe characters" },
          { status: 400 }
        );
      }
      const existing = await prisma.employee.findFirst({
        where: { username: slug, id: { not: id } },
      });
      if (existing) {
        return NextResponse.json(
          { error: "An employee with this username already exists" },
          { status: 409 }
        );
      }
      updateData.username = slug;
    }

    if (brandId) {
      const brand = await prisma.brand.findUnique({ where: { id: brandId } });
      if (!brand) {
        return NextResponse.json({ error: "Brand not found" }, { status: 404 });
      }
    }

    let extraIds: string[] | null = null;
    if (Array.isArray(additionalBrandIds)) {
      const effectivePrimary = brandId || (await prisma.employee.findUnique({
        where: { id },
        select: { brandId: true },
      }))?.brandId;

      extraIds = Array.from(
        new Set(
          additionalBrandIds.filter(
            (bId: string) => bId && bId !== effectivePrimary
          )
        )
      );

      if (extraIds.length > 0) {
        const found = await prisma.brand.findMany({
          where: { id: { in: extraIds } },
          select: { id: true },
        });
        if (found.length !== extraIds.length) {
          return NextResponse.json(
            { error: "One or more additional brands were not found" },
            { status: 404 }
          );
        }
      }
    }

    const employee = await prisma.$transaction(async (tx) => {
      const updated = await tx.employee.update({
        where: { id },
        data: updateData,
      });

      if (extraIds !== null) {
        await tx.employeeBrand.deleteMany({ where: { employeeId: id } });
        if (extraIds.length > 0) {
          await tx.employeeBrand.createMany({
            data: extraIds.map((bId) => ({ employeeId: id, brandId: bId })),
            skipDuplicates: true,
          });
        }
      }

      return tx.employee.findUnique({
        where: { id: updated.id },
        include: {
          brand: { select: { id: true, name: true } },
          brandAccess: {
            include: { brand: { select: { id: true, name: true } } },
          },
        },
      });
    });

    return NextResponse.json(serializeEmployee(employee));
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
