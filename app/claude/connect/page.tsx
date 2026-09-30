import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createConsentCsrf,
  parseClaudeAuthorizationRequest,
  validateRegisteredAuthorization,
} from "@/lib/claudeOauth";
import { getAuthUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ClaudeConnectPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") params.set(key, value);
  }

  const user = await getAuthUser();
  if (!user) {
    const next = `/claude/connect?${params.toString()}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  let authorization;
  try {
    authorization = parseClaudeAuthorizationRequest(params);
  } catch {
    authorization = null;
  }
  // The canonical origin is validated in the authorization endpoint too; the
  // resource value is already explicit here and is revalidated on POST.
  if (
    !authorization ||
    authorization.resource !== params.get("resource") ||
    !(await validateRegisteredAuthorization(authorization))
  ) {
    return <main className="mx-auto mt-20 max-w-xl rounded-xl border border-red-200 bg-white p-8 text-gray-900 shadow">
      <h1 className="text-xl font-semibold">Invalid connector authorization request</h1>
      <p className="mt-3 text-sm text-gray-600">Return to Claude and try connecting again.</p>
    </main>;
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("auth_token")?.value;
  if (!sessionToken) {
    redirect(`/login?next=${encodeURIComponent(`/claude/connect?${params.toString()}`)}`);
  }
  const { csrf, expires } = createConsentCsrf(sessionToken, authorization);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-900">
      <section className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-xl font-bold text-white">H</div>
          <div>
            <p className="text-sm font-medium text-slate-500">Claude connector</p>
            <h1 className="text-xl font-semibold">Connect to HubLogistic</h1>
          </div>
        </div>
        <p className="text-sm leading-6 text-slate-600">
          Claude is requesting read-only access to order information for the HubLogistic account signed in as{" "}
          <strong className="text-slate-900">{user.email}</strong>.
        </p>
        <div className="my-6 rounded-xl bg-slate-50 p-4">
          <p className="text-sm font-semibold">Permission requested</p>
          <p className="mt-1 text-sm text-slate-600">Read orders (orders:read). This connector cannot change orders or access courier credentials.</p>
        </div>
        <form action="/api/claude/oauth/consent" method="post" className="space-y-3">
          {Array.from(params.entries()).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="csrf_expires" value={String(expires)} />
          <button name="decision" value="allow" className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700">
            Allow access
          </button>
          <button name="decision" value="deny" className="w-full rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
        </form>
      </section>
    </main>
  );
}
