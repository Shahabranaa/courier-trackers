const PAKISTAN_CITY_ALIASES: Record<string, string> = {
  ABT: "ABBOTTABAD",
  BWP: "BAHAWALPUR",
  FSD: "FAISALABAD",
  GUJ: "GUJRANWALA",
  HYD: "HYDERABAD",
  ISB: "ISLAMABAD",
  KHI: "KARACHI",
  LHE: "LAHORE",
  MUX: "MULTAN",
  PEW: "PESHAWAR",
  RWP: "RAWALPINDI",
  RYK: "RAHIM YAR KHAN",
  SGR: "SARGODHA",
  SKT: "SIALKOT",
  SWL: "SAHIWAL",
  UET: "QUETTA",
};

export function normalizePakistanCity(value?: string | null) {
  const city = String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
  return PAKISTAN_CITY_ALIASES[city] || city;
}