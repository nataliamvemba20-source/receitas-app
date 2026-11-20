import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const RAIO_PERTO_KM = 5;

function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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

  const corpo = await req.json();
  const receitaId = String(corpo.prescription_id ?? "");
  const lat = Number(corpo.latitude);
  const lon = Number(corpo.longitude);
  const temLocalizacao =
    corpo.latitude !== null && corpo.longitude !== null && Number.isFinite(lat) && Number.isFinite(lon);
  if (!receitaId) return NextResponse.json({ erro: "Receita em falta." }, { status: 400 });

  const { data: receita } = await admin
    .from("prescriptions")
    .select("id, code, status, valid_until, patient_id")
    .eq("id", receitaId)
    .eq("patient_id", quem.user.id)
    .maybeSingle();
  if (!receita) return NextResponse.json({ erro: "Receita não encontrada." }, { status: 404 });

  const hoje = new Date().toISOString().slice(0, 10);
  if (receita.status !== "ativa")
    return NextResponse.json({ erro: "Esta receita já não está ativa." }, { status: 400 });
  if (receita.valid_until < hoje)
    return NextResponse.json({ erro: "Esta receita já expirou." }, { status: 400 });

  const { data: itensBrutos } = await admin
    .from("prescription_items")
    .select("medication_id, medication_name, dosage, quantity, quantity_dispensed")
    .eq("prescription_id", receita.id);

  const itens = (itensBrutos ?? [])
    .map((i) => ({
      medication_id: i.medication_id as string,
      nome: i.medication_name as string,
      dosagem: i.dosage as string,
      quantidade: (i.quantity as number) - ((i.quantity_dispensed as number) ?? 0),
    }))
    .filter((i) => i.quantidade > 0);

  if (itens.length === 0)
    return NextResponse.json({ erro: "Esta receita não tem nada por levantar." }, { status: 400 });

  const { data: farmacias } = await admin
    .from("pharmacies")
    .select("id, name, address, latitude, longitude")
    .eq("active", true)
    .eq("verified", true);

  const ids = (farmacias ?? []).map((f) => f.id as string);
  const { data: stock } = ids.length
    ? await admin
        .from("pharmacy_stock")
        .select("pharmacy_id, medication_id, price, quantity")
        .in("pharmacy_id", ids)
        .in("medication_id", itens.map((i) => i.medication_id))
    : { data: [] };

  const resultado = (farmacias ?? []).map((f) => {
    let total = 0;
    const tem: { nome: string; quantidade: number; subtotal: number }[] = [];
    const falta: { nome: string; quantidade: number }[] = [];

    for (const item of itens) {
      const linha = (stock ?? []).find(
        (s) => s.pharmacy_id === f.id && s.medication_id === item.medication_id
      );
      if (linha && (linha.quantity as number) >= item.quantidade) {
        const subtotal = Number(linha.price) * item.quantidade;
        total += subtotal;
        tem.push({ nome: item.nome, quantidade: item.quantidade, subtotal });
      } else {
        falta.push({ nome: item.nome, quantidade: item.quantidade });
      }
    }

    const distancia =
      temLocalizacao && f.latitude != null && f.longitude != null
        ? distanciaKm(lat, lon, Number(f.latitude), Number(f.longitude))
        : null;

    const destino = encodeURIComponent(
      f.latitude != null && f.longitude != null
        ? f.latitude + "," + f.longitude
        : String(f.address ?? f.name)
    );
    const origem = temLocalizacao ? "&origin=" + lat + "," + lon : "";
    const comoChegar = "https://www.google.com/maps/dir/?api=1&destination=" + destino + origem;

    return {
      id: f.id as string,
      nome: f.name as string,
      morada: f.address as string | null,
      total: Math.round(total * 100) / 100,
      tem,
      falta,
      temTudo: falta.length === 0,
      distanciaKm: distancia === null ? null : Math.round(distancia * 10) / 10,
      perto: distancia === null ? null : distancia <= RAIO_PERTO_KM,
      comoChegar,
    };
  });

  resultado.sort((a, b) => {
    if (a.distanciaKm !== b.distanciaKm && a.distanciaKm !== null && b.distanciaKm !== null) return a.distanciaKm - b.distanciaKm;
    return (a.distanciaKm ?? 9999) - (b.distanciaKm ?? 9999);
  });

  return NextResponse.json({
    receita: { id: receita.id, code: receita.code },
    raioPertoKm: RAIO_PERTO_KM,
        farmacias: resultado
      .filter((r) => r.tem.length > 0)
      .map((r) => ({
        id: r.id,
        nome: r.nome,
        morada: r.morada,
        total: r.total,
        temQtd: r.tem.length,
        totalQtd: r.tem.length + r.falta.length,
        temTudo: r.temTudo,
        distanciaKm: r.distanciaKm,
        perto: r.perto,
        comoChegar: r.comoChegar,
      })),
    semNenhum: resultado.filter((r) => r.tem.length === 0).length,
  });
}