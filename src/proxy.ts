import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { officeModules } from "@/lib/areas";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(values) {
        for (const { name, value } of values) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of values) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname.split("/")[1];
  const modules: Record<string, string> = {
    "": "/", moderacion: "/moderacion", avisos: "/avisos", clubes: "/clubes", mapa: "/mapa", objetos: "/objetos",
    foro: "/foro", guias: "/foro", espacios: "/eventos", eventos: "/eventos",
  };
  if (data?.claims.sub && Object.hasOwn(modules, path)) {
    const { data: profile } = await supabase.from("users").select("role, area").eq("id", data.claims.sub).maybeSingle();
    const allowed = officeModules(profile);
    if (allowed && !allowed.includes(modules[path])) {
      const redirect = NextResponse.redirect(new URL(allowed[0], request.url), 303);
      for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
      return redirect;
    }
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
