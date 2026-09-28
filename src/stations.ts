import snapshot from "../data/stations.json" with { type: "json" }

export type Reading = { at: Date; levelCm: number }

export type Station = {
  id: string
  districtId: string
  nameTh: string
  readings: Reading[]
}

type RawStation = { id: string; districtId: string; nameTh: string; readings: { at: string; levelCm: number }[] }

/** Stations from the recorded snapshot in data/stations.json (made-up readings for teaching). */
export const stations: Station[] = (snapshot.stations as RawStation[]).map((s) => ({
  ...s,
  readings: s.readings.map((r) => ({ at: new Date(r.at), levelCm: r.levelCm }))
}))

export function stationsIn(districtId: string): Station[] {
  return stations.filter((s) => s.districtId === districtId)
}

/** The newest reading at or before `now`, or undefined if the station has none yet. */
export function latestReading(station: Station, now: Date): Reading | undefined {
  return station.readings
    .filter((r) => r.at.getTime() <= now.getTime())
    .reduce<Reading | undefined>((latest, r) => (!latest || r.at > latest.at ? r : latest), undefined)
}
