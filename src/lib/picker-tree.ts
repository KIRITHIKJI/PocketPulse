import { type Category, type CategoryKind, categoryTree } from "@/domain";

/** Active categories of one kind, shaped for pickers and filters (serialisable). */
export type PickerNode = {
  id: string;
  name: string;
  subcategories: { id: string; name: string }[];
};

export function pickerTree(categories: readonly Category[], kind: CategoryKind): PickerNode[] {
  return categoryTree(categories, kind).map((n) => ({
    id: n.category.id,
    name: n.category.name,
    subcategories: n.subcategories.map((s) => ({ id: s.id, name: s.name })),
  }));
}
