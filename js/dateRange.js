export function getRange(key) {
  const now = new Date();
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  switch (key) {
    case "hoje": { const s = startOfDay(now); return [s, addDays(s, 1)]; }
    case "ontem": { const s = addDays(startOfDay(now), -1); return [s, addDays(s, 1)]; }
    case "7d": return [addDays(startOfDay(now), -6), addDays(startOfDay(now), 1)];
    case "14d": return [addDays(startOfDay(now), -13), addDays(startOfDay(now), 1)];
    case "mes": { const s = new Date(now.getFullYear(), now.getMonth(), 1); return [s, addDays(startOfDay(now), 1)]; }
    case "mes_passado": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 1);
      return [s, e];
    }
    case "proximos": { const s = startOfDay(now); return [s, addDays(s, 31)]; }
    case "amanha": { const s = addDays(startOfDay(now), 1); return [s, addDays(s, 1)]; }
    case "ano": { const s = new Date(now.getFullYear(), 0, 1); return [s, addDays(startOfDay(now), 1)]; }
    default: return [addDays(startOfDay(now), -6), addDays(startOfDay(now), 1)];
  }
}
