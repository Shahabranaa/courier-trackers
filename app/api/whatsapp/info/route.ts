import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getPhoneNumberInfo, getBusinessProfile, getMessageTemplates } from "@/lib/whatsapp";

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "phone";

  try {
    switch (type) {
      case "phone": {
        const data = await getPhoneNumberInfo();
        return NextResponse.json(data);
      }
      case "profile": {
        const data = await getBusinessProfile();
        return NextResponse.json(data);
      }
      case "templates": {
        const data = await getMessageTemplates();
        return NextResponse.json(data);
      }
      default:
        return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
  } catch (error: any) {
    console.error("WhatsApp info error:", error.message);
    return NextResponse.json({ error: "Failed to fetch info" }, { status: 500 });
  }
}
