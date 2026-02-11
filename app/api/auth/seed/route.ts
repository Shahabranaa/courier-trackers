import { NextResponse } from "next/server";
import { seedSuperAdmin } from "@/lib/auth";

export async function POST() {
  try {
    await seedSuperAdmin();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Seed error:", error.message);
    return NextResponse.json({ error: "Seed failed" }, { status: 500 });
  }
}
