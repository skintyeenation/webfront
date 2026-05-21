// Chart slice/bar colours, reused across the pie + bar charts so an area keeps
// the same colour everywhere.
export const chartPalette = [
  '#00B8EC', // primary cyan
  '#EC6A37', // accent orange
  '#9ECD3B', // success green
  '#B388FF', // purple
  '#FFD166', // amber
  '#4DD0E1', // teal
  '#F06292', // pink
  '#A1887F', // brown
  '#90A4AE', // blue grey
];

export const colorAt = (i: number) => chartPalette[i % chartPalette.length];
