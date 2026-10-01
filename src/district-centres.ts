/**
 * กึ่งกลางเขต: a rough [lon, lat] per district, only for placing หมุด on the map page.
 * Never a reporter's location: reports carry no coordinates. Kept out of districts.ts, which is not to be edited.
 * Values from upstream feat/fm-02-district-centres.
 */
export const districtCentres: Readonly<Record<string, readonly [number, number]>> = {
  "bang-kapi": [100.645, 13.772],
  "bang-khen": [100.625, 13.865],
  "bang-na": [100.615, 13.668],
  chatuchak: [100.56, 13.83],
  "din-daeng": [100.553, 13.775],
  "don-mueang": [100.595, 13.915],
  "huai-khwang": [100.585, 13.765],
  "khlong-toei": [100.565, 13.71],
  "lat-krabang": [100.755, 13.74],
  "lat-phrao": [100.61, 13.815],
  "pathum-wan": [100.53, 13.742],
  "sai-mai": [100.66, 13.905]
}
