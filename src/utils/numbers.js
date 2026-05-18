export function fmtNum(n) {
  return new Intl.NumberFormat("ar-EG", { useGrouping: false }).format(n);
}
