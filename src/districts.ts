export type District = {
  id: string
  nameTh: string
  nameEn: string
}

/** A subset of Bangkok's 50 districts, enough for the class. */
export const districts: ReadonlyMap<string, District> = new Map(
  [
    { id: "bang-kapi", nameTh: "บางกะปิ", nameEn: "Bang Kapi" },
    { id: "bang-khen", nameTh: "บางเขน", nameEn: "Bang Khen" },
    { id: "bang-na", nameTh: "บางนา", nameEn: "Bang Na" },
    { id: "chatuchak", nameTh: "จตุจักร", nameEn: "Chatuchak" },
    { id: "din-daeng", nameTh: "ดินแดง", nameEn: "Din Daeng" },
    { id: "don-mueang", nameTh: "ดอนเมือง", nameEn: "Don Mueang" },
    { id: "huai-khwang", nameTh: "ห้วยขวาง", nameEn: "Huai Khwang" },
    { id: "khlong-toei", nameTh: "คลองเตย", nameEn: "Khlong Toei" },
    { id: "lat-krabang", nameTh: "ลาดกระบัง", nameEn: "Lat Krabang" },
    { id: "lat-phrao", nameTh: "ลาดพร้าว", nameEn: "Lat Phrao" },
    { id: "pathum-wan", nameTh: "ปทุมวัน", nameEn: "Pathum Wan" },
    { id: "sai-mai", nameTh: "สายไหม", nameEn: "Sai Mai" }
  ].map((d) => [d.id, d])
)
