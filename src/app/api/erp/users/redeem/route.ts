import { requireInvitationIdentity, setActiveCompanyId } from "@/lib/auth";
import { withApiHandler } from "@/lib/api-route";
import { redeemInvitation } from "@/server/services/memberships";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  return withApiHandler(async () => {
    const user = await requireInvitationIdentity();
    const body = await req.json();
    const result = await redeemInvitation(user, body?.token);
    await setActiveCompanyId(result.companyId);
    return { ok: true };
  });
}
// Standalone route: invitees have no active tenant yet, so cannot enter the ERP layout.
export async function GET() {
  return new Response(`<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Terima undangan Arunika</title><body><main style="max-width:40rem;margin:4rem auto;font:18px system-ui;padding:1rem"><h1>Terima undangan</h1><p>Masuk menggunakan email penerima undangan yang terverifikasi Kinde, lalu terima. Tautan berlaku 72 jam; hanya dapat dipakai sekali.</p><p><a id="login" href="/api/auth/login">Masuk dengan email undangan</a></p><button id="accept" type="button">Terima undangan</button><p id="message" role="status"></p></main><script>
const token = new URLSearchParams(location.hash.slice(1)).get('token');
const message = document.getElementById('message');
document.getElementById('login').href = '/api/auth/login?post_login_redirect_url=' + encodeURIComponent(location.pathname + location.hash);
document.getElementById('accept').onclick = async function () {
  this.disabled = true;
  try {
    const response = await fetch(location.pathname, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({token})});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Gagal menerima undangan');
    history.replaceState(null, '', location.pathname);
    location.assign('/dashboard');
  } catch (error) { message.textContent = error.message; this.disabled = false; }
};
</script></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });
}
