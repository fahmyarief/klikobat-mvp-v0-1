"use client";
import { useEffect, useState } from "react";

export function useCatalog(q, category) {
  const [mode, setMode] = useState("loading");
  const [outlets, setOutlets] = useState([]);
  const [outletId, setOutletId] = useState("");
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/outlets", { signal: controller.signal, cache: "no-store" });
        const data = await res.json();
        if (res.status === 503 && data.error === "DATABASE_NOT_CONFIGURED") {
          setMode("demo");
          return;
        }
        if (!res.ok) throw new Error("Layanan outlet belum tersedia");
        setOutlets(data.outlets);
        setOutletId(data.outlets[0]?.id ?? "");
        setMode("live");
      } catch (err) {
        if (err.name !== "AbortError") {
          setError("Tidak dapat mengambil daftar outlet.");
          setMode("error");
        }
      }
    })();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (mode !== "live" || !outletId) {
      setProducts([]);
      return;
    }
    const controller = new AbortController();
    setProducts([]);
    setLoading(true);
    setError("");
    (async () => {
      try {
        const params = new URLSearchParams({ outletId, q, category: category === "Semua" ? "" : category });
        const res = await fetch(`/api/catalog?${params}`, { signal: controller.signal, cache: "no-store" });
        if (!res.ok) throw new Error("Katalog belum tersedia");
        const data = await res.json();
        setProducts(data.products.map(p => ({
          id: p.id, name: p.name, cat: p.category, price: p.priceIdr,
          icon: "💊", stockStatus: p.stockStatus,
          stockUpdatedAt: p.stockUpdatedAt, unit: p.unit,
        })));
      } catch (err) {
        if (err.name !== "AbortError") {
          setProducts([]);
          setError("Katalog gagal dimuat. Coba lagi.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [mode, outletId, q, category]);

  return { mode, outlets, outletId, setOutletId, products, loading, error };
}
