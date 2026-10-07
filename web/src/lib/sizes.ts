// Print sizes offered in the wizard. Safe to import from client components.
// Flip `enabled` to open a size up; the server rejects disabled sizes on submit.
export const PRINT_SIZES = [
  { id: "8x10-digital", label: '8×10" Digital', enabled: true },
  { id: "8x10", label: '8×10"', enabled: false },
  { id: "11x14", label: '11×14"', enabled: false },
  { id: "12x18", label: '12×18"', enabled: false },
  { id: "16x20", label: '16×20"', enabled: false },
  { id: "24x36", label: '24×36"', enabled: false },
] as const;

export type PrintSizeId = (typeof PRINT_SIZES)[number]["id"];

export const PRINT_SIZE_IDS = PRINT_SIZES.map((s) => s.id) as [PrintSizeId, ...PrintSizeId[]];

export function isSizeEnabled(id: string): boolean {
  return PRINT_SIZES.some((s) => s.id === id && s.enabled);
}

export function sizeLabel(id: string | null | undefined): string {
  if (!id) return "—";
  return PRINT_SIZES.find((s) => s.id === id)?.label ?? id;
}
