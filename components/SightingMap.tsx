"use client";

import "leaflet/dist/leaflet.css";
import { useT } from "@/components/I18n";
import type { RegionGroup } from "@/lib/regions";
import { useEffect, useRef } from "react";
import type { Map as LMap, LayerGroup } from "leaflet";

/** India map with a circle per postal region that has sightings. Leaflet is browser-only, so it loads in an effect. */
export function SightingMap({ regions, className = "h-[300px]" }: { regions: RegionGroup[]; className?: string }) {
  const { t } = useT();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const leaflet = useRef<typeof import("leaflet") | null>(null);

  // build the map once
  useEffect(() => {
    let dead = false;
    void import("leaflet").then((L) => {
      if (dead || !el.current || map.current) return;
      leaflet.current = L;
      map.current = L.map(el.current, { scrollWheelZoom: false }).setView([22.6, 79.5], 4);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 9, attribution: "© OpenStreetMap" }).addTo(map.current);
      layer.current = L.layerGroup().addTo(map.current);
      draw();
    });
    return () => { dead = true; map.current?.remove(); map.current = null; layer.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw() {
    const L = leaflet.current;
    if (!L || !layer.current) return;
    layer.current.clearLayers();
    for (const g of regions) {
      L.circleMarker([g.lat, g.lon], { radius: 9 + Math.min(g.count, 12), color: "#fb7185", weight: 2, fillColor: "#fb7185", fillOpacity: 0.45 })
        .addTo(layer.current)
        .bindPopup(`<b>${g.name}</b><br>${t("regionSights", g.count)}<br>PIN ${g.pins.map((p) => `${p}xxx`).join(", ")}`);
    }
  }
  useEffect(draw, [regions, t]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className={`${className} overflow-hidden rounded-[24px] hairline`} role="img" aria-label="Map of India with reported sightings" />;
}
