/** UK tax year start (6 April) for a date. */
export function reportsTaxYearStart(date: string) {
  const y = Number(date.slice(0, 4));
  return date >= `${y}-04-06` ? `${y}-04-06` : `${y - 1}-04-06`;
}
