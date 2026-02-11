import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);

    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    return NextResponse.json({
      user: {
        id: session.user.id,
        username: session.user.username,
        displayName: session.user.displayName,
        role: session.user.role,
        brandIds: session.user.role === "SUPER_ADMIN"
          ? "all"
          : session.user.userBrands.map((ub) => ub.brandId),
      },
    });
  } catch (error: any) {
    console.error("Auth check error:", error.message);
    return NextResponse.json({ error: "Auth check failed" }, { status: 500 });
  }
}
