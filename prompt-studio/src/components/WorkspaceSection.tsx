import { Reorder } from "framer-motion";

export const WorkspaceSection = ({ items, onReorder, renderItem, viewMode }: any) => {
  if (items.length === 0) return null;
  return (
    <div className="w-full">
      <Reorder.Group 
        axis="y" 
        values={items} 
        onReorder={onReorder} 
        className={`grid gap-6 ${viewMode === 'vertical' ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}
      >
        {items.map((item: any, index: number) => renderItem(item, index))}
      </Reorder.Group>
    </div>
  );
};
