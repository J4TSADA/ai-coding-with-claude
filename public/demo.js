"use strict"

// Simulated flood water for the demo map, adapted from upstream feat/fm-01..04 (public/demo.js).
// Nothing here is real and nothing is sent to the API. The page labels it "ข้อมูลจำลอง" wherever it shows.
// The water is drawn around spots that often flood after heavy rain; it is not made from user reports.
;(() => {
  const LABEL = "ข้อมูลจำลอง ไม่ใช่ขอบเขตน้ำท่วมจริง"

  // Each zone is a stack of nested, irregular rings: the outer ring is shallow, the inner ones deeper,
  // drifting toward the deepest spot. Depth bands are in cm like everything else in the app.
  const zone = (name, centre, deepest, radius, phase, depths) => ({
    zone: name,
    centre,
    deepest,
    radius,
    phase,
    bands: depths.map((cm, i) => [[1, 0.72, 0.5, 0.3, 0.18][i], cm])
  })
  const zones = [
    zone("ramkhamhaeng", [100.626, 13.7575], [100.6185, 13.7565], [0.021, 0.0095], [0.4, 1.9, 3.1], [10, 30, 50, 80]),
    zone("khlong-chan", [100.6435, 13.7858], [100.6445, 13.7866], [0.0115, 0.0082], [2.2, 0.7, 4.0], [10, 30, 50, 100]),
    zone("ha-yaek-lat-phrao", [100.5625, 13.8168], [100.5612, 13.8163], [0.0085, 0.0062], [1.1, 2.6, 0.3], [10, 30, 50, 80]),
    zone("kaset", [100.5708, 13.8472], [100.5706, 13.8468], [0.0072, 0.0058], [3.0, 1.2, 2.2], [10, 30, 50, 80]),
    zone("ratchayothin", [100.5736, 13.8285], [100.5736, 13.8285], [0.0038, 0.0034], [0.9, 2.0, 1.5], [10, 30]),
    zone("chok-chai-4", [100.5935, 13.8132], [100.5935, 13.8132], [0.0042, 0.0034], [1.8, 0.2, 2.9], [10, 30]),
    zone("bang-khen", [100.5925, 13.8768], [100.5925, 13.8768], [0.0048, 0.004], [2.6, 1.4, 0.6], [10, 30, 50]),
    zone("sai-mai", [100.6655, 13.9142], [100.6718, 13.9148], [0.0135, 0.0082], [0.2, 3.3, 1.7], [10, 30, 50, 80]),
    zone("don-mueang", [100.5992, 13.9118], [100.5995, 13.9125], [0.0055, 0.0072], [1.5, 0.8, 2.4], [10, 30, 50]),
    zone("din-daeng-huai-khwang", [100.5668, 13.7752], [100.5665, 13.7752], [0.0145, 0.0068], [2.1, 3.4, 0.9], [10, 30, 50]),
    zone("samyan", [100.5292, 13.7338], [100.5292, 13.7338], [0.0042, 0.0045], [0.7, 1.9, 3.0], [10, 30, 50]),
    zone("asok", [100.5618, 13.7362], [100.5606, 13.7372], [0.0068, 0.0048], [2.8, 0.5, 1.3], [10, 30, 50]),
    zone("khlong-toei-market", [100.5552, 13.7218], [100.5552, 13.7218], [0.0045, 0.0036], [1.2, 2.7, 0.4], [10, 30, 50]),
    zone("la-salle", [100.6125, 13.6655], [100.6135, 13.6665], [0.0072, 0.0068], [3.1, 1.6, 2.5], [10, 30, 50]),
    zone("lat-krabang", [100.7585, 13.7365], [100.7722, 13.7318], [0.029, 0.0165], [0.6, 2.3, 3.6], [10, 30, 50, 80])
  ]

  function ring(zone, scale) {
    const [cx, cy] = zone.centre
    const [dx, dy] = zone.deepest
    const shift = 1 - scale
    const x0 = cx + (dx - cx) * shift
    const y0 = cy + (dy - cy) * shift
    const [p1, p2, p3] = zone.phase
    const points = []
    for (let i = 0; i < 72; i++) {
      const t = (i / 72) * Math.PI * 2
      const wobble = 1 + 0.16 * Math.sin(3 * t + p1) + 0.08 * Math.sin(5 * t + p2) + 0.05 * Math.sin(7 * t + p3)
      points.push([x0 + Math.cos(t) * zone.radius[0] * scale * wobble, y0 + Math.sin(t) * zone.radius[1] * scale * wobble])
    }
    points.push(points[0])
    return points
  }

  /** GeoJSON bands, shallow first, so deeper rings draw on top. */
  function floodAreas() {
    const features = []
    for (const zone of zones) {
      for (const [scale, depthCm] of zone.bands) {
        features.push({
          type: "Feature",
          properties: { zone: zone.zone, depthCm },
          geometry: { type: "Polygon", coordinates: [ring(zone, scale)] }
        })
      }
    }
    return { type: "FeatureCollection", features }
  }

  window.NAMTUAM_DEMO = { label: LABEL, floodAreas }
})()
