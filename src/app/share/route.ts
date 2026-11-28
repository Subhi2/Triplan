// "Share to Triplan" (G12) before the service worker is installed: the share arrives here. Links
// and text go to the planner in its address; a file cannot be kept without the service worker,
// so the planner says to open it from there instead.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const q = new URLSearchParams();
  const file = form?.get("file");
  if (file instanceof File && file.size > 0) {
    q.set("shared", "failed");
  } else {
    q.set("shared", "link");
    for (const k of ["title", "text", "url"]) {
      const v = form?.get(k);
      if (typeof v === "string" && v.trim()) q.set(`s${k[0]}`, v.trim().slice(0, 1000));
    }
  }
  return Response.redirect(new URL(`/?${q.toString()}`, request.url), 303);
}
