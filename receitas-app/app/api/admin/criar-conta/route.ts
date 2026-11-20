import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  );

  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ erro: "Sem sessão." }, { status: 401 });

  const { data: quem } = await admin.auth.getUser(token);
  if (!quem.user) return NextResponse.json({ erro: "Sessão inválida." }, { status: 401 });

  const { data: perfilAdmin } = await admin
    .from("profiles")
    .select("role")
    .eq("id", quem.user.id)
    .single();
  if (perfilAdmin?.role !== "admin")
    return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const { nome, email, password, role, pharmacy_id, hospital_id } = await req.json();

  if (!["medico", "farmacia"].includes(role))
    return NextResponse.json({ erro: "Tipo de conta inválido." }, { status: 400 });
  if (role === "farmacia" && !pharmacy_id)
    return NextResponse.json({ erro: "Escolhe a farmácia." }, { status: 400 });
  if (role === "medico" && !hospital_id)
    return NextResponse.json({ erro: "Escolhe o hospital." }, { status: 400 });

  const { data: novo, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: nome },
  });
  if (error || !novo.user)
    return NextResponse.json({ erro: error?.message ?? "Erro ao criar." }, { status: 400 });

  const { error: erroPerfil } = await admin.from("profiles").upsert({
    id: novo.user.id,
    full_name: nome,
    role,
    pharmacy_id: role === "farmacia" ? pharmacy_id : null,
    hospital_id: role === "medico" ? hospital_id : null,
  });
  if (erroPerfil)
    return NextResponse.json({ erro: erroPerfil.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}